import { byWeek, seasonStart, streaks, rowOf, summary, badgesFor, trDate } from '../src/game/profile.ts';
import assert from 'node:assert/strict';
const at = (iso) => new Date(iso).getTime();
const pick = (id, h, a, kick) => ({ match_id: id, h, a, updated_at: new Date(at(kick) - 3600000).toISOString(), kickoff: kick });
const res = (id, s, kick) => ({ id, st: 'ft', s, ts: at(kick) / 1000 });

assert.equal(trDate(at('2026-11-09T22:30:00Z')), '2026-11-10', 'Türkiye saatiyle gün');
assert.equal(seasonStart(at('2026-11-10T12:00:00Z')), at('2026-07-01T00:00:00+03:00'));
assert.equal(seasonStart(at('2027-03-10T12:00:00Z')), at('2026-07-01T00:00:00+03:00'));

const picks = [
  pick(1, 2, 1, '2026-11-02T17:00:00Z'), // tam skor (Pzt)
  pick(2, 1, 0, '2026-11-04T17:00:00Z'), // doğru sonuç
  pick(3, 0, 0, '2026-11-08T17:00:00Z'), // kaçtı (Paz, aynı hafta)
  pick(4, 1, 1, '2026-11-10T17:00:00Z'), // tam skor (yeni hafta)
  pick(5, 3, 0, '2026-11-14T17:00:00Z'), // henüz sonuç yok
];
const results = new Map([
  [1, res(1, [2, 1], '2026-11-02T17:00:00Z')],
  [2, res(2, [3, 1], '2026-11-04T17:00:00Z')],
  [3, res(3, [1, 0], '2026-11-08T17:00:00Z')],
  [4, res(4, [1, 1], '2026-11-10T17:00:00Z')],
]);
const weeks = byWeek(picks, results);
assert.deepEqual(weeks.map((w) => [w.start, w.rows.length, w.points]), [['2026-11-09', 2, 3], ['2026-11-02', 3, 4]]);
assert.deepEqual(byWeek(picks, results, 'exact').flatMap((w) => w.rows.map((r) => r.pick.match_id)), [4, 1]);
assert.deepEqual(byWeek(picks, results, 'miss').flatMap((w) => w.rows.map((r) => r.pick.match_id)), [3]);

const rows = picks.map((p) => rowOf(p, results.get(p.match_id)));
assert.deepEqual(streaks(rows), { current: 1, best: 2 });
assert.deepEqual(badgesFor(5), [3, 5]);

const late = { ...pick(6, 1, 0, '2026-11-05T17:00:00Z'), updated_at: '2026-11-05T17:10:00Z' };
assert.equal(rowOf(late, res(6, [1, 0], '2026-11-05T17:00:00Z')).pts, null, 'başladıktan sonra girilen sayılmaz');

const s = summary(picks, results, at('2026-11-15T12:00:00Z'));
assert.equal(s.total, 7); assert.equal(s.exact, 2); assert.equal(s.streak, 1); assert.equal(s.best, 2);
console.log('ok');

// Defter (veritabanı puanı) varsa o geçerlidir: sürpriz bonusu ve joker dahil.
{
  const ledger = new Map([[1, { match_id: 1, total: 10, base: 3, bonus: 2, joker: true, outcome: 'exact', kickoff: '2026-11-02T17:00:00Z', week: '2026-11-02' }]]);
  const s2 = summary(picks, results, at('2026-11-15T12:00:00Z'), ledger);
  assert.equal(s2.total, 14, 'defterdeki 10 + diğerleri 1+0+3');
  const row = byWeek(picks, results, 'all', ledger).flatMap((w) => w.rows).find((r) => r.pick.match_id === 1);
  assert.equal(row.pts, 10); assert.equal(row.joker, true); assert.equal(row.bonus, 2);
  console.log('ok ledger');
}
