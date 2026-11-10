import { canFollow, liveStateOf } from '../src/liveState.ts';
import assert from 'node:assert/strict';
// Sunucudaki lib/live.js liveState ile aynı sonuç vermeli.
assert.deepEqual(liveStateOf({ st: 'live', s: [1, 0], min: 67, extra: null, short: '2H', time: '20:45' }, 1_000_000_000), { home: 1, away: 0, minute: "67'", status: 'live', clock: 1_000_000 - 67 * 60 });
assert.deepEqual(liveStateOf({ st: 'live', s: [1, 1], min: 45, extra: 2, short: 'HT', time: '' }), { home: 1, away: 1, minute: 'Devre arası', status: 'ht', clock: null });
assert.deepEqual(liveStateOf({ st: 'ft', s: [2, 1], min: 90, extra: null, short: 'FT', time: '' }).minute, 'Maç sonu');
assert.deepEqual(liveStateOf({ st: 'ns', s: null, min: null, extra: null, short: 'NS', time: '20:45' }), { home: 0, away: 0, minute: '20:45', status: 'ns', clock: null });
const now = 1_800_000_000_000;
assert.equal(canFollow({ st: 'ns', ts: (now + 5 * 3600000) / 1000 }, now), true);
assert.equal(canFollow({ st: 'ns', ts: (now + 7 * 3600000) / 1000 }, now), false);
assert.equal(canFollow({ st: 'ft', ts: (now - 3600000) / 1000 }, now), false);
console.log('ok');
