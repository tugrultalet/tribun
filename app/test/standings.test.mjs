// Saf mantık testleri: npm test (Node 22.6+; ağ ve arayüz gerekmez).
import { standings, ranks, weekStart, finalSummary, points, entryCount } from '../src/groups/standings.ts';
import assert from 'node:assert/strict';
assert.equal(weekStart('2026-11-10'), '2026-11-09'); assert.equal(weekStart('2026-11-15'), '2026-11-09'); assert.equal(weekStart('2026-11-16'), '2026-11-16'); assert.equal(weekStart('2026-11-09'), '2026-11-09');
const ts = 1_800_000_000, early = new Date((ts - 3600) * 1000).toISOString(), late = new Date((ts + 60) * 1000).toISOString();
const F = (id, st, s, date = '2026-11-10') => ({ id, ts, date, st, s });
const fx = [F(1, 'ft', [2, 1]), F(2, 'live', [1, 0], '2026-11-11'), F(3, 'ft', [0, 0], '2026-11-02')];
const P = (who, m, h, a, at = early) => ({ profile_id: who, match_id: m, h, a, updated_at: at });
const detail = { me: 'a', members: [{ id: 'a', name: 'Ahmet' }, { id: 'm', name: 'Mehmet' }, { id: 'z', name: 'Zeki' }],
  predictions: [P('a', 1, 2, 1), P('m', 1, 1, 0), P('z', 1, 2, 1, late), P('m', 2, 2, 0), P('a', 3, 1, 1)], pending: [{ profile_id: 'z', match_id: 9 }] };
assert.equal(points(detail.predictions[0], fx[0]), 3); assert.equal(points(detail.predictions[1], fx[0]), 1); assert.equal(points(detail.predictions[2], fx[0]), null);
const week = standings(detail, fx, (f) => f.date >= '2026-11-09' && f.date <= '2026-11-15');
assert.deepEqual(week.map((r) => [r.member.name, r.total, r.live]), [['Ahmet', 3, 0], ['Mehmet', 2, 1], ['Zeki', 0, 0]]);
const season = standings(detail, fx);
assert.equal(season[0].member.name, 'Ahmet'); assert.equal(season[0].total, 4);
assert.equal(entryCount(detail, 9), 1);
assert.equal(finalSummary(detail, fx[0], fx), 'Tam skoru bilen: Ahmet (+3). Haftanın lideri: Ahmet.');
assert.deepEqual(ranks([{ total: 3, exact: 1 }, { total: 3, exact: 1 }, { total: 1, exact: 0 }]), [1, 1, 3]);
console.log('ok', JSON.stringify(season.map((r) => [r.member.name, r.total])));

// Defter puanı (sürpriz bonusu + joker) biten maçta istemci hesabının yerine geçer; canlı maçta geçmez.
{
  const withLedger = { ...detail, points: [{ profile_id: 'm', match_id: 1, total: 6, outcome: 'correct' }, { profile_id: 'm', match_id: 2, total: 99, outcome: 'exact' }] };
  const w = standings(withLedger, fx, (f) => f.date >= '2026-11-09' && f.date <= '2026-11-15');
  assert.deepEqual(w.map((r) => [r.member.name, r.total, r.exact]), [['Mehmet', 7, 0], ['Ahmet', 3, 1], ['Zeki', 0, 0]]);
  console.log('ok ledger');
}
