import { pollMs } from '../src/poll.ts';
import assert from 'node:assert/strict';
const now = 1_800_000_000_000, ts = (ms) => (now + ms) / 1000;
assert.equal(pollMs({ st: 'live', ts: ts(0) }, now), 15000);
assert.equal(pollMs({ st: 'ns', ts: ts(30 * 60000) }, now), 60000);
assert.equal(pollMs({ st: 'ns', ts: ts(5 * 3600000) }, now), 300000);
assert.equal(pollMs({ st: 'ft', ts: ts(-3600000) }, now), undefined);
console.log('ok');
