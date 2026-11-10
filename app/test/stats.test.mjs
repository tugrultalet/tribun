// Saf mantık testleri: npm test (Node 22.6+; ağ ve arayüz gerekmez).
import { personalStats, needsResult } from '../src/game/stats.ts';
import assert from 'node:assert/strict';
const ts = 1_800_000_000, early = new Date((ts - 3600) * 1000).toISOString(), late = new Date((ts + 60) * 1000).toISOString();
const R = (id, s) => [id, { id, st: 'ft', s, ts }];
const results = new Map([R(1, [2, 1]), R(2, [0, 0]), R(3, [1, 3]), R(4, [2, 2])]);
const picks = [
  { match_id: 1, h: 2, a: 1, updated_at: early, kickoff: null },   // tam skor +3
  { match_id: 2, h: 1, a: 1, updated_at: early, kickoff: null },   // doğru sonuç (beraberlik) +1
  { match_id: 3, h: 2, a: 0, updated_at: early, kickoff: null },   // yanlış 0
  { match_id: 4, h: 2, a: 2, updated_at: late, kickoff: null },    // geç girilmiş: sayılmaz
  { match_id: 9, h: 1, a: 0, updated_at: early, kickoff: null },   // sonucu yok: sayılmaz
];
const s = personalStats(picks, results);
assert.deepEqual(s, { total: 4, exact: 1, correct: 2, played: 3, rate: 2 / 3 });
assert.deepEqual(personalStats([], results), { total: 0, exact: 0, correct: 0, played: 0, rate: 0 });
const now = Date.parse('2026-11-12T20:00:00Z');
assert.equal(needsResult({ kickoff: '2026-11-12T17:00:00Z', updated_at: '', h: 0, a: 0, match_id: 1 }, now), true);
assert.equal(needsResult({ kickoff: '2026-11-12T19:00:00Z', updated_at: '', h: 0, a: 0, match_id: 1 }, now), false, 'maç bitmemiş olabilir');
assert.equal(needsResult({ kickoff: null, updated_at: '2026-11-12T10:00:00Z', h: 0, a: 0, match_id: 1 }, now), true);
console.log('ok');
