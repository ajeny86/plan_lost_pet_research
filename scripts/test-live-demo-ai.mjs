import assert from 'node:assert/strict';
import { demoFixture } from '../public-demo/fixtures.mjs';

const root = 'https://plan-lost-pet-research.onrender.com';
const demo = demoFixture();
async function request(path, data) {
  const response = await fetch(`${root}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://ajeny86.github.io' }, body: JSON.stringify(data), signal: AbortSignal.timeout(60000) });
  const result = await response.json();
  assert.equal(response.status, 200, `${path}: ${result.error || response.status}`);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://ajeny86.github.io');
  return result;
}
const sources = demo.research.filter(s => s.participantRole === 'Owner');
const patterns = demo.patterns.filter(p => p.id.startsWith('demo-pattern-owner')).map(pattern => ({
  id: pattern.id, title: pattern.title, summary: pattern.summary,
  observations: pattern.observationIds.map(id => demo.observations.find(o => o.id === id)).map(o => ({ dimension: o.dimension, text: o.text, excerpt: o.excerpt, sourceId: o.sourceId, participantRole: 'Owner' })),
}));
const checks = [
  ['analysis', async () => {
    const result = await request('/api/analyze', { sources, existingPatterns: [] });
    assert.ok(result.observations.length > 0);
    for (const item of result.observations) assert.ok(sources.find(s => s.id === item.sourceId)?.content.includes(item.excerpt), 'exact source excerpt required');
    return { observations: result.observations.length, patterns: result.patterns.length };
  }],
  ['persona synthesis', async () => {
    const result = await request('/api/synthesize-persona', { persona: { ...demo.personas[0], mainGoal: demo.personas[0].goal }, patterns });
    assert.ok(result.persona.mainGoal);
    assert.ok(Array.isArray(result.persona.behaviours));
    assert.ok(/find|recover|home|reunit/i.test(result.persona.mainGoal), 'goal must describe pet recovery');
    return { role: result.persona.role, behaviours: result.persona.behaviours.length };
  }],
  ['pattern merge', async () => {
    const selected = patterns.find(p => p.id === 'demo-pattern-owner-4');
    const result = await request('/api/merge-patterns', { patterns: selected.observations.map(o => ({ title: o.text, summary: o.text, observations: [o] })) });
    assert.ok(result.pattern.title);
    assert.ok(/[.!?]$/.test(result.pattern.summary));
    return { completeStatement: true };
  }],
];
const results = await Promise.allSettled(checks.map(async ([name, run]) => ({ name, result: await run() })));
for (let i = 0; i < results.length; i++) {
  const item = results[i];
  console.log(JSON.stringify(item.status === 'fulfilled' ? item.value : { name: checks[i][0], error: item.reason.message }));
}
if (results.some(r => r.status === 'rejected')) process.exitCode = 1;
