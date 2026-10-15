import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const check = vm.runInNewContext(`${readFileSync(new URL('../public/evidence-integrity.js', import.meta.url), 'utf8')}\nEvidenceIntegrity`, { crypto: webcrypto });
const repo = {
  research: [{ id: 'owner', participantRole: 'Owner' }, { id: 'finder', participantRole: 'Finder' }],
  observations: [
    { id: 'a', sourceId: 'owner', dimension: 'Need', text: 'Needed a checklist', excerpt: 'original owner quote', status: 'approved' },
    { id: 'b', sourceId: 'finder', dimension: 'Need', text: 'Needed night-time contacts', excerpt: 'original finder quote', status: 'approved', suggestedPatternId: 'mixed', patternMatchApplied: true },
    { id: 'c', sourceId: 'owner', dimension: 'Motivation', text: 'Chose Facebook because many local people use it', excerpt: 'original channel quote', status: 'approved' },
  ],
  patterns: [{ id: 'mixed', observationIds: ['a', 'b'], title: 'Checklist', summary: 'Shared need.', status: 'approved' }, { id: 'channel', observationIds: ['c'], title: 'Facebook', status: 'approved' }],
  personas: [{ id: 'p', role: 'Owner', patternIds: ['mixed', 'channel'], status: 'Validated' }],
  proposals: [{ id: 'proposal', patternIds: ['mixed'], status: 'pending' }],
  settings: { model: 'gpt-6.1-sol' },
};
assert.equal(check.compatible(repo, repo.observations[1], { observationIds: ['a'] }), false, 'Finder must not attach to Owner');
assert.equal(check.normalise(repo), true);
assert.equal(repo.patterns.length, 3, 'mixed roles split into separate review candidates');
assert.equal(repo.patterns.find(p => p.id === 'mixed').observationIds.join(), 'a');
assert.equal(repo.observations[1].suggestedPatternId, null);
assert.equal(repo.observations[2].dimension, 'Decision-making');
assert.equal(repo.observations[2].excerpt, 'original channel quote', 'original evidence is untouched');
assert.equal(repo.personas[0].status, 'Unvalidated');
assert.equal(repo.personaUpdates.length, 1);
assert.equal(repo.proposals[0].status, 'superseded');
check.normalise(repo);
const stable = JSON.stringify(repo);
assert.equal(check.normalise(repo), false, 'migration must be idempotent');
assert.equal(JSON.stringify(repo), stable);
assert.equal(check.compatible(repo, { sourceId: 'owner', dimension: 'Action' }, { observationIds: ['a'] }), false, 'different categories must stay separate');
console.log('Evidence integrity: role separation, category review, evidence preservation and repeat migration passed.');
