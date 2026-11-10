import { pendingCount } from '../src/game/pending.ts';
import assert from 'node:assert/strict';
const now = 1_800_000_000_000, H = 3600000;
const f = (id, st, inH) => ({ id, st, ts: (now + inH * H) / 1000 });
const list = [f(1, 'ns', 2), f(2, 'ns', 30), f(3, 'ns', 60), f(4, 'live', -0.5), f(5, 'ns', -1), f(6, 'ns', 5)];
assert.equal(pendingCount(list, new Set([6]), now), 2, 'yalnızca 48 saat içinde, başlamamış, tahminsiz maçlar');
console.log('ok');
