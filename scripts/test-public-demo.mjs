import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { demoFixture, DEMO_KEY } from '../public-demo/fixtures.mjs';
const data = demoFixture();
assert.equal(data.research.length, 6);
assert.equal(data.personas.length, 3);
assert.notEqual(DEMO_KEY, 'persona-builder-priority1-v1');
assert.equal(data.settings.endpoint, '');
const sources = new Map(data.research.map(s => [s.id, s]));
const observations = new Map(data.observations.map(o => [o.id, o]));
for (const observation of data.observations) {
  assert.ok(sources.get(observation.sourceId).content.includes(observation.excerpt));
  assert.equal(observation.origin, 'Authored synthetic demo fixture');
}
for (const pattern of data.patterns) {
  const evidence = pattern.observationIds.map(id => observations.get(id));
  assert.equal(new Set(evidence.map(o => sources.get(o.sourceId).participantRole)).size, 1);
  assert.equal(new Set(evidence.map(o => o.sourceId)).size, 2);
}
for (const persona of data.personas) for (const id of persona.patternIds) {
  const pattern = data.patterns.find(p => p.id === id);
  assert.equal(pattern.status, 'approved');
  assert.ok(pattern.observationIds.every(id => sources.get(observations.get(id).sourceId).participantRole === persona.role));
}
const html = readFileSync(new URL('../github-pages/demo/index.html', import.meta.url), 'utf8');
assert.ok(!html.includes('cloud-sync.js'));
assert.ok(html.includes('demo-data.js'));
const app = readFileSync(new URL('../github-pages/demo/app.js', import.meta.url), 'utf8');
assert.ok(!app.includes('plan-lost-pet-research.onrender.com'));
assert.ok(app.includes(DEMO_KEY));
assert.ok(!app.includes("const KEY='persona-builder-priority1-v1'"));
const runtime = readFileSync(new URL('../public-demo/runtime.js', import.meta.url), 'utf8');
assert.ok(runtime.includes("const apiOrigin = 'https://plan-lost-pet-research.onrender.com'"));
assert.ok(runtime.includes("'/api/analyze'"));
assert.ok(!runtime.includes("'/api/state'"));
assert.ok(runtime.includes("state.settings.model = 'gpt-4.1-mini'"));
console.log('Public demo: isolated storage, synthetic provenance, exact quotes, live AI and blocked private database passed.');
