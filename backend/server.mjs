import { createServer } from 'node:http';
import { isIP } from 'node:net';

const port = Number(process.env.PORT || 8787);
const apiKey = process.env.AI_API_KEY || '';
const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const model = process.env.AI_MODEL || 'gpt-4.1-mini';
const allowedOrigins = new Set([
  'http://127.0.0.1:4173',
  'https://persona-atlas.rightotter16.chatgpt.site',
  'https://ajeny86.github.io',
  ...(process.env.ALLOWED_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean),
]);

function allowedOrigin(req) {
  const origin = req.headers.origin;
  return allowedOrigins.has(origin) ? origin : 'https://persona-atlas.rightotter16.chatgpt.site';
}

function reply(req, res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': allowedOrigin(req),
    'access-control-allow-headers': 'content-type',
    vary: 'Origin',
  });
  res.end(JSON.stringify(data));
}

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (!isIP(host)) return false;
  return /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(host);
}

function redactPersonalData(value = '') {
  return String(value)
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email removed]')
    .replace(/(?:\+?\d[\s().-]*){8,}/g, '[phone removed]')
    .replace(/\b(?:Rua|Avenida|Av\.|Travessa|Praça)\s+[^\n,]{3,80},?\s*\d+[A-Za-z-]*\b/gi, '[private address removed]');
}

function promptFor(body) {
  return `You assist a UX researcher. Analyse only the supplied research sources.

Integrity rules:
- Never invent facts, quotations, participants, motivations, counts or sources.
- Copy every excerpt exactly from the matching source content.
- Keep unknown information unknown.
- Label an inference as Interpretation. Use Direct observation only for explicitly reported actions or statements.
- A behavioural pattern requires at least two observations from at least two independent source IDs. Do not mistake many quotations from one source for independent cases.
- Group observations by underlying meaning, not literal wording, animal species or channel name. For example, "find my cat" and "find my dog" may support one broader goal pattern such as "recover the missing pet" when their intent is equivalent.
- Prefer a smaller set of coherent cross-source patterns over many narrow restatements. Do not return a pattern that merely repeats one observation.
- Preserve contradictions. Do not force inconsistent observations into one pattern.
- Preserve participant-role provenance throughout the analysis. Owner evidence belongs to Owner personas. Finder and Spotter evidence must remain distinct unless the supplied sources explicitly support the same broader Encounterer behaviour. Never combine Owner evidence with Finder or Spotter evidence in one pattern.
- When participantRole is Unknown, keep it unknown and require researcher review instead of guessing a persona type.

Classification framework (apply strictly):
- Goal: the participant's desired end result. A channel or action is never a goal. Example: "find my missing dog and bring him home", not "post on Facebook".
- Action: an observable behaviour the participant performed. Examples: posted in a Facebook group, called a veterinary clinic, searched nearby streets.
- Motivation: an explicitly stated reason or internal driver for acting. Do not infer a motive merely from an action.
- Constraint: a circumstance that limits or prevents action, such as lack of time, transport, space, permission, access or service availability.
- Problem: a pain point or experienced friction, confusion, uncertainty, repetition, delay or negative consequence.
- Need: information, guidance, coordination or capability that the participant explicitly says would help them progress. Phrase it as the needed support, not as a product feature unless the participant requested that feature.
- Decision-making: how the participant chose or prioritised an action, including stated influences and trade-offs.
- Level of involvement: the extent of action taken, only when directly supported.
- Interaction: a reported exchange with another person, organisation or platform.

Boundary rules:
- "Used Facebook" is Action or Interaction, never Goal or Motivation by itself.
- "Did not know who to contact" is Problem; "needed a clear contact order" is Need.
- "Could not keep the animal because the landlord prohibited pets" is Constraint.
- One excerpt may support more than one observation only when each interpretation is distinct and directly supported.

Before proposing a new pattern, compare every new observation with existingPatterns. Match by underlying meaning, participant role and evidence dimension—not exact words, animal species or platform. For example, an Owner goal to "find my cat" and an existing Owner goal to "find my dog" both support the broader goal "recover the missing pet". In that case, set existingPatternId to that pattern's ID and do not create a duplicate pattern. Never match evidence across incompatible participant roles or different dimensions.

Return strict JSON with observations and patterns.
Each observation needs a unique short key such as o1, sourceId, dimension, text, exact excerpt, evidenceType, and existingPatternId. existingPatternId must be the matching supplied pattern ID or null.
Each pattern needs title, summary, observationKeys and counterEvidenceKeys. observationKeys must refer to returned observation keys. Return an empty patterns array if the evidence does not support a recurring pattern.

Research sources:
${JSON.stringify(body.sources)}

Existing patterns:
${JSON.stringify(body.existingPatterns || [])}`;
}

function metadataPromptFor(body) {
  return `Extract case metadata only from the supplied research source.

Integrity rules:
- Never guess or add information that is not explicitly present in the source.
- Use null when a field is not supported by the source.
- Copy a short exact excerpt for every non-null value.
- Dates must use YYYY-MM-DD only when the complete date is explicit; otherwise use null.
- "location" may be a neighbourhood, street, district or city explicitly named in the source.
- "involvement" describes the participant's actions, not their character.
- Keep comments factual and concise.

Source:
${JSON.stringify(body.source)}`;
}

function personaSynthesisPromptFor(body) {
  return `Rewrite one behavioural persona from approved, source-linked evidence.

Integrity rules:
- Use only the supplied approved patterns and observations. Never invent details, demographics, motives, needs or goals.
- Merge semantic duplicates into one concise statement. Preserve meaningfully different behaviours and contradictory evidence as separate statements.
- A Facebook post, phone call, search action or platform choice is Behaviour, never Main goal.
- Main goal is the desired end result. For an Owner in a lost-pet case this may be finding the missing pet and bringing them home safely, but only when the evidence context supports it.
- Motivation is an explicitly supported driver; Constraint is an external or practical limit; Pain point is experienced friction or uncertainty; Need is the support or information required to progress.
- Do not copy unsupported content from the current draft. Return an empty array for an unsupported section and null for an unsupported main goal.
- Write each item as one clear sentence in English. Do not include source IDs in the wording.

Current persona draft:
${JSON.stringify(body.persona)}

Approved evidence package:
${JSON.stringify(body.patterns)}`;
}

const analysisSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    observations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string' },
          sourceId: { type: 'string' },
          dimension: { type: 'string', enum: ['Goal', 'Action', 'Motivation', 'Constraint', 'Problem', 'Need', 'Decision-making', 'Level of involvement', 'Interaction'] },
          text: { type: 'string' },
          excerpt: { type: 'string' },
          evidenceType: { type: 'string', enum: ['Direct observation', 'Interpretation'] },
          existingPatternId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
        required: ['key', 'sourceId', 'dimension', 'text', 'excerpt', 'evidenceType', 'existingPatternId'],
      },
    },
    patterns: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          observationKeys: { type: 'array', items: { type: 'string' } },
          counterEvidenceKeys: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'summary', 'observationKeys', 'counterEvidenceKeys'],
      },
    },
  },
  required: ['observations', 'patterns'],
};

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const nullableEnum = values => ({ anyOf: [{ type: 'string', enum: values }, { type: 'null' }] });
const metadataFieldSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { value: nullableString, excerpt: nullableString },
  required: ['value', 'excerpt'],
};
const metadataEnumFieldSchema = values => ({
  type: 'object',
  additionalProperties: false,
  properties: { value: nullableEnum(values), excerpt: nullableString },
  required: ['value', 'excerpt'],
});
const metadataSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    participantRole: metadataEnumFieldSchema(['Owner', 'Finder', 'Spotter', 'Volunteer', 'Other']),
    reportStatus: metadataEnumFieldSchema(['Lost', 'Found', 'Sighted']),
    involvement: metadataEnumFieldSchema(['Quick', 'Active', 'Temporary Care']),
    animalType: metadataFieldSchema,
    location: metadataFieldSchema,
    incidentDate: metadataFieldSchema,
    publicationDate: metadataFieldSchema,
    outcome: metadataFieldSchema,
    updates: metadataFieldSchema,
  },
  required: ['participantRole', 'reportStatus', 'involvement', 'animalType', 'location', 'incidentDate', 'publicationDate', 'outcome', 'updates'],
};

const personaSynthesisSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    role: nullableEnum(['Owner', 'Finder', 'Spotter', 'Volunteer', 'Other']),
    mainGoal: nullableString,
    behaviours: { type: 'array', items: { type: 'string' } },
    motivations: { type: 'array', items: { type: 'string' } },
    constraints: { type: 'array', items: { type: 'string' } },
    painPoints: { type: 'array', items: { type: 'string' } },
    needs: { type: 'array', items: { type: 'string' } },
  },
  required: ['role', 'mainGoal', 'behaviours', 'motivations', 'constraints', 'painPoints', 'needs'],
};

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': allowedOrigin(req),
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    return res.end();
  }

  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (req.method !== 'POST' || !['/api/analyze', '/api/import-url', '/api/extract-metadata', '/api/synthesize-persona'].includes(pathname)) {
    return reply(req, res, 404, { error: 'Not found' });
  }

  if (pathname === '/api/import-url') {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 50_000) return reply(req, res, 413, { error: 'Request is too large' });
    }
    try {
      const { url } = JSON.parse(raw);
      const target = new URL(url);
      if (!['http:', 'https:'].includes(target.protocol) || isPrivateHost(target.hostname)) {
        return reply(req, res, 400, { error: 'Only public HTTP(S) URLs are supported' });
      }
      const page = await fetch(target, { redirect: 'error', headers: { 'user-agent': 'PersonaBuilderUniversityPrototype/2.0' } });
      if (!page.ok) return reply(req, res, 422, { error: `The public page returned ${page.status}. Use manual import instead.` });
      const type = page.headers.get('content-type') || '';
      if (!type.includes('text/html') && !type.includes('text/plain')) return reply(req, res, 422, { error: 'This source is not a readable public text page. Use manual import instead.' });
      const html = (await page.text()).slice(0, 500_000);
      const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || target.hostname).replace(/\s+/g, ' ').trim();
      const content = redactPersonalData(html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim())
        .slice(0, 50_000);
      return reply(req, res, 200, { title, content, url: target.href });
    } catch (error) {
      return reply(req, res, 422, { error: `Could not extract this page: ${error.message}. Use manual import instead.` });
    }
  }

  if (!apiKey) return reply(req, res, 503, { error: 'AI_API_KEY is not configured on the backend. No analysis was performed.' });

  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000_000) return reply(req, res, 413, { error: 'Request is too large' });
  }

  try {
    const body = JSON.parse(raw);
    if (pathname === '/api/synthesize-persona') {
      if (!body.persona || !Array.isArray(body.patterns) || !body.patterns.length) return reply(req, res, 400, { error: 'Persona and approved evidence are required' });
      const upstream = await fetch(`${base}/responses`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          input: personaSynthesisPromptFor(body),
          text: { format: { type: 'json_schema', name: 'persona_synthesis', strict: true, schema: personaSynthesisSchema } },
        }),
      });
      const data = await upstream.json();
      if (!upstream.ok) return reply(req, res, 502, { error: data.error?.message || 'AI provider request failed' });
      const outputText = data.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text;
      if (!outputText) return reply(req, res, 502, { error: 'AI provider returned no structured output' });
      return reply(req, res, 200, { persona: JSON.parse(outputText) });
    }
    if (pathname === '/api/extract-metadata') {
      if (!body.source?.content) return reply(req, res, 400, { error: 'No source text supplied' });
      const upstream = await fetch(`${base}/responses`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          input: metadataPromptFor(body),
          text: { format: { type: 'json_schema', name: 'source_metadata', strict: true, schema: metadataSchema } },
        }),
      });
      const data = await upstream.json();
      if (!upstream.ok) return reply(req, res, 502, { error: data.error?.message || 'AI provider request failed' });
      const outputText = data.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text;
      if (!outputText) return reply(req, res, 502, { error: 'AI provider returned no structured output' });
      const parsed = JSON.parse(outputText);
      const content = String(body.source.content);
      for (const field of Object.values(parsed)) {
        if (field.value !== null && (!field.excerpt || !content.includes(field.excerpt))) {
          field.value = null;
          field.excerpt = null;
        }
      }
      return reply(req, res, 200, { metadata: parsed });
    }
    if (!Array.isArray(body.sources) || !body.sources.length) return reply(req, res, 400, { error: 'No research sources supplied' });
    const upstream = await fetch(`${base}/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        input: promptFor(body),
        text: { format: { type: 'json_schema', name: 'research_analysis', strict: true, schema: analysisSchema } },
      }),
    });
    const data = await upstream.json();
    if (!upstream.ok) return reply(req, res, 502, { error: data.error?.message || 'AI provider request failed' });
    const outputText = data.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text;
    if (!outputText) return reply(req, res, 502, { error: 'AI provider returned no structured output' });
    const parsed = JSON.parse(outputText);
    const sourceMap = new Map(body.sources.map(source => [source.id, source]));
    const validExistingPatternIds = new Set((body.existingPatterns || []).map(pattern => pattern.id));
    const observations = (parsed.observations || []).filter(item => {
      const source = sourceMap.get(item.sourceId);
      if (!validExistingPatternIds.has(item.existingPatternId)) item.existingPatternId = null;
      return source && item.excerpt && String(source.content || '').includes(item.excerpt);
    });
    const validKeys = new Set(observations.map(item => item.key));
    const sourceForKey = new Map(observations.map(item => [item.key, item.sourceId]));
    const patterns = (parsed.patterns || []).filter(pattern => {
      pattern.observationKeys = [...new Set(pattern.observationKeys || [])].filter(key => validKeys.has(key));
      pattern.counterEvidenceKeys = [...new Set(pattern.counterEvidenceKeys || [])].filter(key => validKeys.has(key));
      const independentSources = new Set(pattern.observationKeys.map(key => sourceForKey.get(key)));
      return pattern.observationKeys.length >= 2 && independentSources.size >= 2;
    });
    return reply(req, res, 200, { observations, patterns });
  } catch (error) {
    return reply(req, res, 500, { error: `Analysis failed: ${error.message}. No findings were saved.` });
  }
}).listen(port, () => console.log(`Persona Builder analysis backend: http://127.0.0.1:${port}`));
