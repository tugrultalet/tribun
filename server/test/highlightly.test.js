import test from 'node:test';
import assert from 'node:assert/strict';
import { createHighlightly } from '../providers/highlightly.js';
import { fakeFetch, sample } from './helpers.js';

const make = (handler) => {
  const fetchImpl = fakeFetch(handler);
  return { provider: createHighlightly({ key: 'k', baseUrl: 'http://x/', fetchImpl }), fetchImpl };
};
const ok = (body) => ({ headers: { 'x-ratelimit-requests-limit': '100', 'x-ratelimit-requests-remaining': '90' }, body });

test('anahtar x-rapidapi-key başlığıyla gider ve kota başlıkları okunur', async () => {
  const { provider, fetchImpl } = make(() => ok(sample('hl-matches')));
  await provider.refresh([{ lg: 173537, date: '2026-11-08' }]);
  assert.equal(fetchImpl.calls[0].headers['x-rapidapi-key'], 'k');
  assert.deepEqual([provider.state.limitDay, provider.state.remaining], [100, 90]);
});

test('Türk takım adları düzeltilir, skor ve durum çevrilir', async () => {
  const { provider } = make(() => ok(sample('hl-matches')));
  const list = await provider.refresh([{ lg: 173537, date: '2026-11-08' }]);
  const besiktas = list.find((f) => f.h.name === 'Beşiktaş');
  assert.equal(besiktas.a.name, 'Gençlerbirliği');
  assert.deepEqual(besiktas.s, [3, 0]);
  assert.equal(besiktas.st, 'ft');
});

test('maç detayı olayları ve istatistikleri çevirir', async () => {
  const { provider } = make(() => ok(sample('hl-match')));
  const m = await provider.match(1348375393);
  assert.equal(m.fixture.h.name, 'Çorum FK');
  assert.equal(m.events.filter((e) => e.k === 'goal').length, 5);
  assert.equal(m.events[0].p, 'M. Greenwood');
  assert.equal(m.stats.find((s) => s.label === 'Topa sahip olma').h, 39);
});

test('ilk 11 satır ve sütun numaralarıyla gelir', async () => {
  const { provider } = make(() => ok(sample('hl-lineups')));
  const [home, away] = await provider.lineups(1);
  assert.equal(home.xi.length, 11);
  assert.equal(home.xi[0].row, 1);
  assert.equal(away.formation, '4-2-3-1');
});

test('puan durumu puana göre sıralı gelir', async () => {
  const { provider } = make(() => ok(sample('hl-standings')));
  const [g] = await provider.standings(173537, 2026);
  assert.deepEqual(g.rows.map((r) => r.rank), [1, 2, 3, 4]);
  assert.equal(g.rows[0].team.name, 'Galatasaray');
});

test('401 yanıtı yapılandırma hatası olarak bildirilir', async () => {
  const { provider } = make(() => ({ status: 401, headers: {}, body: { message: 'x' } }));
  await assert.rejects(provider.refresh([{ lg: 1, date: '2026-11-08' }]), (e) => e.kind === 'config');
});

test('numaralar API-Football numaralarına çevrilir', async () => {
  const { provider } = make(() => ok(sample('hl-matches')));
  const list = await provider.refresh([{ lg: 203, date: '2026-11-08' }]);
  const besiktas = list.find((f) => f.h.name === 'Beşiktaş');
  assert.equal(besiktas.id, 1584458); // API-Football'daki Beşiktaş – Gençlerbirliği maçı
  assert.equal(besiktas.h.id, 549);
  assert.equal(besiktas.lg, 203);
  assert.equal(besiktas.lgName, 'Süper Lig');
});

test('kaynağa giden isteklerde ortak numaralar Highlightly numarasına çevrilir', async () => {
  const { provider, fetchImpl } = make(() => ok({ data: [], pagination: { totalCount: 0 } }));
  await provider.refresh([{ lg: 203, date: '2026-11-08' }]);
  await provider.seasonFixtures(39, 2026);
  await provider.teamSeason(611, 2026);
  assert.match(fetchImpl.calls[0].path, /^matches\?leagueId=173537&date=2026-11-08/);
  assert.match(fetchImpl.calls[1].path, /^matches\?leagueId=33973&season=2026/);
  assert.match(fetchImpl.calls[2].path, /^matches\?homeTeamId=520745&season=2026/);
});

test('puan durumundaki takım numaraları ortak numaradır', async () => {
  const { provider } = make(() => ok(sample('hl-standings')));
  const [g] = await provider.standings(203, 2026);
  assert.equal(g.rows[0].team.id, 645); // Galatasaray
});

test('milli takımlar sayfalı çekilir, kadın ve gençlik takımları çıkarılır, numaralar çevrilir', async () => {
  const pageOf = (data, offset) => ok({ data, pagination: { totalCount: 4, offset, limit: 500 } });
  const { provider, fetchImpl } = make((path) => (path.includes('offset=0')
    ? pageOf([{ id: 662011, name: 'Turkey', logo: 'a' }, { id: 22059, name: 'Germany', logo: 'b' }, { id: 1, name: 'Germany Women', logo: 'c' }, { id: 2, name: 'Turkey U21', logo: 'd' }], 0)
    : pageOf([], 500)));
  const teams = await provider.nationalTeams();
  assert.deepEqual(teams.map((t) => [t.id, t.name]), [[777, 'Turkey'], [25, 'Germany']]);
  assert.match(fetchImpl.calls[0].path, /^teams\?type=national&limit=500&offset=0$/);
});

test('turnuvanın güncel sezonu, bugünkü sezonu aşmayan en büyük sezondur', async () => {
  const { provider } = make(() => ok([{ name: 'Euro Championship', seasons: [{ season: 2028 }, { season: 2024 }, { season: 2020 }] }]));
  assert.equal(await provider.seasonOf(4, 2026), 2024);
});
