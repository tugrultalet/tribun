import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCore } from '../core.js';
import { DAY, dayFmt, timeFmt } from '../lib/common.js';

process.env.LIVE_TTL = '0';
const side = (id, name) => ({ id, name, logo: `l${id}` });
let nextId = 1;
const fx = ({ lg = 203, h, a, offsetDays = 5, st = 'ns', s = null, ts, lgName = 'Süper Lig' }) => {
  const when = ts ?? Math.floor((Date.now() + offsetDays * DAY) / 1000);
  return { id: nextId++, lg, lgName, lgLogo: 'x', round: '1. hafta', ts: when, date: dayFmt.format(when * 1000), time: timeFmt.format(when * 1000), st, short: st === 'ns' ? 'NS' : st === 'live' ? '2H' : 'FT', min: null, extra: null, h, a, s, pen: null };
};
const FB = side(611, 'Fenerbahçe'), GS = side(645, 'Galatasaray'), TR = side(777, 'Turkey'), DE = side(25, 'Germany');

function makeCore(overrides = {}) {
  const calls = [];
  const provider = {
    id: 'stub', name: 'Stub', state: { plan: null, limitDay: 7500, remaining: null }, onState: null,
    leagueLogo: (id) => `lg${id}`, teamLogo: (id) => `t${id}`, configError: () => null, liveTtl: () => 0,
    seasonFixtures: async (lg, season) => { calls.push(['season', lg, season]); return []; },
    teamSeason: async (id, season) => { calls.push(['team', id, season]); return []; },
    refresh: async () => [], nationalTeams: async () => [],
    ...overrides,
  };
  const core = createCore({ provider, cacheDir: fs.mkdtempSync(path.join(os.tmpdir(), 'tribun-core-')) });
  return { core, calls, provider };
}

test('takım ekranı takımın katıldığı tüm yarışmaları gösterir, kulüp hazırlık maçlarını göstermez', async () => {
  const league = fx({ h: FB, a: GS });
  const cup = fx({ lg: 206, lgName: 'Turkey Cup', h: FB, a: side(1, 'Rizespor'), offsetDays: 9 });
  const friendly = fx({ lg: 667, lgName: 'Friendlies Clubs', h: FB, a: side(2, 'X'), offsetDays: 2 });
  const { core } = makeCore({ teamSeason: async () => [league, cup, friendly] });
  const team = await core.team(611);
  assert.deepEqual(team.fixtures.map((f) => f.lgName), ['Süper Lig', 'Turkey Cup']);
});

test('ana ekran takipteki takımların maçlarını ve takipteki turnuvaların yakın maçlarını birleştirir', async () => {
  const teamMatch = fx({ h: FB, a: GS, offsetDays: 30 });
  const cupSoon = fx({ lg: 2, lgName: 'Champions League', h: side(1, 'A'), a: side(2, 'B'), offsetDays: 4 });
  const cupLater = fx({ lg: 2, lgName: 'Champions League', h: side(3, 'C'), a: side(4, 'D'), offsetDays: 40 });
  const dup = { ...teamMatch };
  const { core } = makeCore({ teamSeason: async () => [teamMatch], seasonFixtures: async (lg) => (lg === 2 ? [cupSoon, cupLater] : [dup]) });
  const mine = await core.mine([611], [2, 203]);
  const ids = mine.fixtures.map((f) => f.id);
  assert.ok(ids.includes(teamMatch.id), 'takım maçı (30 gün sonra bile) gelmeli');
  assert.ok(ids.includes(cupSoon.id), 'takipteki turnuvanın yakın maçı gelmeli');
  assert.ok(!ids.includes(cupLater.id), 'takipteki turnuvanın uzak maçı gelmemeli');
  assert.equal(ids.filter((i) => i === teamMatch.id).length, 1, 'aynı maç bir kez görünmeli');
});

test('yalnızca turnuva takip edilirken de çalışır', async () => {
  const m = fx({ lg: 1, lgName: 'World Cup', h: TR, a: DE, offsetDays: 3 });
  const { core } = makeCore({ seasonFixtures: async () => [m] });
  assert.equal((await core.mine([], [1])).fixtures.length, 1);
  assert.deepEqual((await core.mine([], [])).fixtures, []);
});

test('milli takım turnuvasının sezonu kaynağa sorulur, lig sezonu takvimden bulunur', async () => {
  const { core, calls } = makeCore({ seasonOf: async () => 2024 });
  await core.leagueFixtures(4); // Avrupa Şampiyonası
  await core.leagueFixtures(203); // Süper Lig
  assert.equal(calls.find((c) => c[1] === 4)[2], 2024);
  assert.notEqual(calls.find((c) => c[1] === 203)[2], 2024);
});

test('milli takım listesi Türkçe adlarla gelir, Türkiye başta olur ve maçlardaki adları da Türkçeleştirir', async () => {
  const match = fx({ lg: 10, lgName: 'Friendlies', h: TR, a: DE, offsetDays: 6 });
  const { core } = makeCore({
    nationalTeams: async () => [side(25, 'Germany'), side(777, 'Turkey'), side(9, 'Spain'), side(25, 'Germany')],
    teamSeason: async () => [match],
  });
  const { teams } = await core.national();
  assert.deepEqual(teams.map((t) => t.name), ['Türkiye', 'Almanya', 'İspanya']);
  const team = await core.team(777);
  assert.deepEqual([team.fixtures[0].h.name, team.fixtures[0].a.name], ['Türkiye', 'Almanya']);
});

test('aynı ligde aynı gün sonradan başlayan maç, önceki maç bitse de canlı olarak güncellenir', async () => {
  const now = Math.floor(Date.now() / 1000);
  const a = fx({ h: GS, a: FB, st: 'live', ts: now - 3000 });
  const b = fx({ h: side(1, 'X'), a: side(2, 'Y'), st: 'ns', ts: now + 60 });
  let phase = 0;
  const current = () => (phase === 0 ? [a, b] : [{ ...a, st: 'ft', short: 'FT', s: [2, 0] }, { ...b, st: 'live', short: '1H', ts: now - 30, s: [0, 0] }]);
  const { core } = makeCore({ seasonFixtures: async () => [a, b], refresh: async () => current() });
  const first = await core.day(a.date, [203]);
  assert.deepEqual(first.fixtures.map((f) => f.st), ['live', 'ns']);
  phase = 1;
  const second = await core.day(a.date, [203]);
  assert.deepEqual(second.fixtures.map((f) => f.st), ['ft', 'live']);
});
