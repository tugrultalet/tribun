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

test('ana ekran takımların tüm maçlarını (tüm yarışmalarda) tek listede, tekrarsız verir; lig takibi yoktur', async () => {
  const league = fx({ h: FB, a: GS, offsetDays: 30 });
  const cup = fx({ lg: 2, lgName: 'Champions League', h: FB, a: side(2, 'B'), offsetDays: 4 });
  const dupOfLeague = { ...league };
  const { core, calls } = makeCore({ teamSeason: async (id) => (id === 611 ? [league, cup] : [dupOfLeague]) });
  const mine = await core.mine([611, 645]);
  const ids = mine.fixtures.map((f) => f.id);
  assert.ok(ids.includes(league.id) && ids.includes(cup.id), 'iki yarışmanın maçı da gelmeli');
  assert.equal(ids.filter((i) => i === league.id).length, 1, 'aynı maç bir kez görünmeli');
  assert.ok(!calls.some((c) => c[0] === 'season'), 'lig sezonu hiç sorulmamalı');
  assert.deepEqual((await core.mine([])).fixtures, []);
});

test('takım fikstürü günde bir kez, ortak önbellekten gelir (ikinci istek kaynağa gitmez)', async () => {
  let n = 0;
  const { core } = makeCore({ teamSeason: async () => { n++; return [fx({ h: FB, a: GS })]; } });
  await core.mine([611]); await core.mine([611]); await core.team(611);
  assert.equal(n, 1);
});

test('tüm ligler günü: gün listesi tek çağrıyla gelir, katalog dışı ligler ve kulüp hazırlıkları elenir', async () => {
  const today = dayFmt.format(Date.now());
  const inCatalog = fx({ lg: 203, h: FB, a: GS, offsetDays: 0 });
  const outside = fx({ lg: -5, lgName: 'Bilinmeyen Lig', h: side(8, 'X'), a: side(9, 'Y'), offsetDays: 0 });
  const club = fx({ lg: 203, lgName: 'Friendlies Clubs', h: side(6, 'P'), a: side(7, 'Q'), offsetDays: 0 });
  let dayCalls = 0;
  const { core, calls } = makeCore({ day: async () => { dayCalls++; return [inCatalog, outside, club]; } });
  const r = await core.day(today, [...core.leagueIds], []);
  assert.deepEqual(r.fixtures.map((f) => f.id), [inCatalog.id]);
  await core.day(today, [...core.leagueIds], []);
  assert.equal(dayCalls, 1, 'ikinci istek önbellekten');
  assert.equal(calls.length, 0, 'lig sezonları sorulmamalı');
});

test('gün listesi alınamazsa lig lig yola düşülür', async () => {
  const today = dayFmt.format(Date.now());
  const m = fx({ lg: 203, h: FB, a: GS, offsetDays: 0 });
  const { core } = makeCore({ day: async () => { throw new Error('desteklenmiyor'); }, seasonFixtures: async (lg) => (lg === 203 ? [m] : []) });
  assert.deepEqual((await core.day(today, [...core.leagueIds], [])).fixtures.map((f) => f.id), [m.id]);
});

test('canlı yenileme yalnızca son 24 saatte istenen takımlar için yapılır', async () => {
  const live = fx({ h: FB, a: GS, st: 'live', ts: Math.floor(Date.now() / 1000) - 600 });
  let refreshed = 0;
  const { core } = makeCore({ teamSeason: async () => [live], refresh: async (list) => { refreshed++; return list.map((f) => ({ ...f, st: 'ft' })); } });
  await core.mine([611]);
  assert.equal(refreshed, 1, 'istenen takım için yenilenir');
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

test('önbellek boşken milli takım maçları da Türkçe adlarla gelir (takım seçici hiç açılmadan)', async () => {
  const match = fx({ lg: 5, lgName: 'UEFA Nations League', h: TR, a: side(1, 'Belgium'), offsetDays: 3 });
  const { core } = makeCore({
    nationalTeams: async () => [side(777, 'Turkey'), side(1, 'Belgium')],
    teamSeason: async () => [match],
  });
  const team = await core.team(777); // /api/national hiç çağrılmadı
  assert.deepEqual([team.fixtures[0].h.name, team.fixtures[0].a.name], ['Türkiye', 'Belçika']);
});

test('sonuçlar: önbellekteki biten maç kaynağa sorulmaz; bilinmeyen maç tek çağrıda en çok 8 kez sorulur', async () => {
  const done = fx({ h: FB, a: GS, offsetDays: -3, st: 'ft', s: [2, 1] });
  const notDone = fx({ h: FB, a: GS, offsetDays: 3 });
  let asked = 0;
  const { core } = makeCore({
    teamSeason: async () => [done, notDone],
    match: async (id) => { asked++; return { fixture: id === notDone.id ? notDone : fx({ h: FB, a: GS, offsetDays: -2, st: 'ft', s: [1, 0] }), events: [], stats: [] }; },
  });
  await core.mine([611]); // fikstürler önbelleğe girer
  const r = await core.results([done.id]);
  assert.equal(asked, 0);
  assert.deepEqual(r.results.map((x) => [x.id, x.s]), [[done.id, [2, 1]]]);
  assert.deepEqual(r.pending, []);
  const many = Array.from({ length: 12 }, (_, i) => 9000 + i);
  const r2 = await core.results(many);
  assert.equal(asked, 8, 'tek çağrıda en çok 8 maç sorulur');
  assert.equal(r2.pending.length >= 4, true);
  const r3 = await core.results([notDone.id]);
  assert.deepEqual(r3.results, [], 'bitmemiş maç sonuç sayılmaz');
});

test('koruma: bilinmeyen takım numarası soğuk bütçeye bağlı; bilinen ve önbellekteki numara serbest', async () => {
  process.env.COLD_PER_IP = '2';
  let calls = 0;
  const { core } = makeCore({ teamSeason: async () => { calls++; return []; } });
  const ctx = { ip: '1.2.3.4' };
  await core.team(900001, ctx); await core.team(900002, ctx);
  await assert.rejects(core.team(900003, ctx), (e) => e.kind === 'busy');
  assert.equal(calls, 2, 'bütçe dolunca kaynağa gidilmez');
  await core.team(900001, ctx); // önbellekte (boş liste) → bilinen sayılır
  assert.equal(calls, 2);
  await core.team(900004, { ip: '5.6.7.8' }); // başka IP'nin bütçesi ayrı
  assert.equal(calls, 3);
  delete process.env.COLD_PER_IP;
});

test('koruma: kaynakta olmayan maç 6 saat tekrar sorulmaz', async () => {
  let calls = 0;
  const { core } = makeCore({ match: async () => { calls++; throw Object.assign(new Error('yok'), { kind: 'notfound' }); } });
  await assert.rejects(core.match(424242), (e) => e.kind === 'notfound');
  await assert.rejects(core.match(424242), (e) => e.kind === 'notfound');
  assert.equal(calls, 1);
});

test('koruma: kota azaldıysa kaynağa gidilmez, eski veri gösterilir', async () => {
  let calls = 0;
  const m = fx({ h: FB, a: GS });
  const { core, provider } = makeCore({ teamSeason: async () => { calls++; return [m]; } });
  await core.mine([611]);
  provider.state.remaining = 3; // QUOTA_RESERVE varsayılanı 10
  const fresh = await core.team(645).catch((e) => e);
  assert.equal(fresh.kind, 'quota', 'önbellekte olmayan takım için kaynağa gidilmez');
  assert.equal(calls, 1);
});

test('önbellek: bellek sınırı aşılınca en eski kayıt çıkar, diskten geri okunur', async () => {
  const { createCache } = await import('../lib/cache.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tribun-cache-'));
  const c = createCache(dir, { maxEntries: 2 });
  c.save('a', 1, 60000); c.save('b', 2, 60000); c.save('c', 3, 60000);
  assert.deepEqual(c.keys(''), ['b', 'c']);
  await new Promise((r) => setTimeout(r, 50)); // disk yazımı
  assert.equal(c.load('a').data, 1, 'diskten geri gelir');
});
