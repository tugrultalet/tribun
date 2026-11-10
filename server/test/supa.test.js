import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchRow, syncMatches } from '../lib/supa.js';

test('matchRow: saat, durum ve skor', () => {
  const r = matchRow({ id: 7, ts: 1800000000, st: 'ft', s: [2, 1], h: { name: 'A' }, a: { name: 'B' }, lg: 203 });
  assert.deepEqual(r, { id: 7, kickoff: new Date(1800000000 * 1000).toISOString(), status: 'ft', h: 2, a: 1, home: 'A', away: 'B', league: 203, home_id: null, away_id: null });
  assert.equal(matchRow({ id: 9, ts: 1, st: 'ns', s: null, h: { id: 645, name: 'GS' }, a: { id: 611, name: 'FB' }, lg: 203 }).away_id, 611);
  assert.equal(matchRow({ id: 8, ts: 1800000000, st: 'ns', s: null, h: { name: 'A' }, a: { name: 'B' }, lg: 1 }).h, null);
});

test('syncMatches: açık maçları sorar, bulunanları yazar', async () => {
  const calls = [];
  const supa = { rpc: async (fn, args) => { calls.push([fn, args]); return fn === 'server_open_matches' ? [1, 2, 3] : { scored: 1 }; } };
  const results = async (ids) => ({
    results: [{ id: 1, ts: 100, st: 'ft', s: [1, 0], h: { name: 'A' }, a: { name: 'B' }, lg: 1 }],
    open: [{ id: 2, ts: 200, st: 'ns', s: null, h: { name: 'C' }, a: { name: 'D' }, lg: 1 }],
    pending: ids.filter((x) => x === 3),
  });
  const out = await syncMatches(supa, results);
  assert.deepEqual(out, { sent: 2, scored: 1 });
  assert.equal(calls[1][0], 'server_sync_matches');
  assert.deepEqual(calls[1][1].p_rows.map((r) => [r.id, r.status]), [[1, 'ft'], [2, 'ns']]);
});

test('syncMatches: açık maç yoksa yazmaz', async () => {
  const supa = { rpc: async () => [] };
  assert.deepEqual(await syncMatches(supa, async () => ({})), { sent: 0, scored: 0 });
});
