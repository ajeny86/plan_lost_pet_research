import assert from 'node:assert/strict';
import { inspectLocal, destination, backup, LOCAL_KEY } from '../github-pages/gateway.js';

const storage = data => ({ getItem(key) { assert.equal(key, LOCAL_KEY); return data; } });
assert.equal(inspectLocal(storage(null)).hasWork, false);
assert.equal(inspectLocal(storage(JSON.stringify({ personas: [{ template: true }] }))).hasWork, false);
const data = { research: [{ id: 'original-interview' }], personas: [{ id: 'owner', template: false }], patterns: [{ id: 'pattern' }], observations: [{ id: 'observation' }], activity: [{ id: 'review' }] };
const local = inspectLocal(storage(JSON.stringify(data)));
assert.equal(local.hasWork, true);
assert.equal(local.research, 1);
assert.deepEqual(JSON.parse(backup(local)).data, data, 'backup preserves the entire workspace');
const broken = inspectLocal(storage('{broken'));
assert.equal(broken.hasWork, true, 'corrupt local data prevents silent navigation');
assert.equal(backup(broken), '{broken', 'recovery export preserves the original bytes');
assert.equal(inspectLocal({ getItem() { throw Error('blocked'); } }).hasWork, true);
assert.equal(destination('#analysis'), 'https://ajeny86.github.io/plan_lost_pet_research/demo/#analysis');
assert.equal(destination('#https://other.example'), 'https://ajeny86.github.io/plan_lost_pet_research/demo/#dashboard', 'no open redirects');
assert.equal(destination('#personas'), 'https://ajeny86.github.io/plan_lost_pet_research/demo/#personas');
console.log('GitHub gateway: routing, complete backup, template-only state and recovery protection passed.');
