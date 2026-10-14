import { createServer } from 'node:http';
import { isIP } from 'node:net';

const port = Number(process.env.PORT || 8787);
const apiKey = process.env.AI_API_KEY || '';
const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const model = process.env.AI_MODEL || 'gpt-4.1-mini';
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://127.0.0.1:4173';

function reply(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': allowedOrigin,
    'access-control-allow-headers': 'content-type',
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
- Preserve contradictions. Do not force inconsistent observations into one pattern.

Return strict JSON with observations and patterns.
Each observation needs a unique short key such as o1, sourceId, dimension, text, exact excerpt and evidenceType.
Each pattern needs title, summary, observationKeys and counterEvidenceKeys. observationKeys must refer to returned observation keys. Return an empty patterns array if the evidence does not support a recurring pattern.

Research sources:
${JSON.stringify(body.sources)}`;
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
        },
        required: ['key', 'sourceId', 'dimension', 'text', 'excerpt', 'evidenceType'],
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

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': allowedOrigin,
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    return res.end();
  }

  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (req.method !== 'POST' || !['/api/analyze', '/api/import-url'].includes(pathname)) {
    return reply(res, 404, { error: 'Not found' });
  }

  if (pathname === '/api/import-url') {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 50_000) return reply(res, 413, { error: 'Request is too large' });
    }
    try {
      const { url } = JSON.parse(raw);
      const target = new URL(url);
      if (!['http:', 'https:'].includes(target.protocol) || isPrivateHost(target.hostname)) {
        return reply(res, 400, { error: 'Only public HTTP(S) URLs are supported' });
      }
      const page = await fetch(target, { redirect: 'error', headers: { 'user-agent': 'PersonaBuilderUniversityPrototype/2.0' } });
      if (!page.ok) return reply(res, 422, { error: `The public page returned ${page.status}. Use manual import instead.` });
      const type = page.headers.get('content-type') || '';
      if (!type.includes('text/html') && !type.includes('text/plain')) return reply(res, 422, { error: 'This source is not a readable public text page. Use manual import instead.' });
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
      return reply(res, 200, { title, content, url: target.href });
    } catch (error) {
      return reply(res, 422, { error: `Could not extract this page: ${error.message}. Use manual import instead.` });
    }
  }

  if (!apiKey) return reply(res, 503, { error: 'AI_API_KEY is not configured on the backend. No analysis was performed.' });

  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000_000) return reply(res, 413, { error: 'Request is too large' });
  }

  try {
    const body = JSON.parse(raw);
    if (!Array.isArray(body.sources) || !body.sources.length) return reply(res, 400, { error: 'No research sources supplied' });
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
    if (!upstream.ok) return reply(res, 502, { error: data.error?.message || 'AI provider request failed' });
    const outputText = data.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text;
    if (!outputText) return reply(res, 502, { error: 'AI provider returned no structured output' });
    const parsed = JSON.parse(outputText);
    const sourceMap = new Map(body.sources.map(source => [source.id, source]));
    const observations = (parsed.observations || []).filter(item => {
      const source = sourceMap.get(item.sourceId);
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
    return reply(res, 200, { observations, patterns });
  } catch (error) {
    return reply(res, 500, { error: `Analysis failed: ${error.message}. No findings were saved.` });
  }
}).listen(port, () => console.log(`Persona Builder analysis backend: http://127.0.0.1:${port}`));
