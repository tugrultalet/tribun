import { canFollow, liveStateOf } from '../src/liveState.ts';
import assert from 'node:assert/strict';
// Sunucudaki lib/live.js liveState ile aynı sonuç vermeli.
assert.deepEqual(liveStateOf({ st: 'live', s: [1, 0], min: 67, extra: null, short: '2H', time: '20:45' }), { home: 1, away: 0, minute: "67'", status: 'live' });
assert.deepEqual(liveStateOf({ st: 'live', s: [1, 1], min: 45, extra: 2, short: 'HT', time: '' }), { home: 1, away: 1, minute: 'DA', status: 'ht' });
assert.deepEqual(liveStateOf({ st: 'ns', s: null, min: null, extra: null, short: 'NS', time: '20:45' }), { home: 0, away: 0, minute: '20:45', status: 'ns' });
const now = 1_800_000_000_000;
assert.equal(canFollow({ st: 'ns', ts: (now + 5 * 3600000) / 1000 }, now), true);
assert.equal(canFollow({ st: 'ns', ts: (now + 7 * 3600000) / 1000 }, now), false);
assert.equal(canFollow({ st: 'ft', ts: (now - 3600000) / 1000 }, now), false);
console.log('ok');
