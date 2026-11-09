import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiFootball } from '../providers/apifootball.js';
import { fakeFetch, sample } from './helpers.js';

const ok = (response, headers = {}) => ({ headers: { 'x-ratelimit-limit': '300', 'x-ratelimit-requests-limit': '7500', 'x-ratelimit-requests-remaining': '7000', ...headers }, body: { errors: [], response } });
const make = (handler) => {
  const fetchImpl = fakeFetch(handler);
  return { provider: createApiFootball({ key: 'k', baseUrl: 'http://x/', fetchImpl, sleepImpl: async () => {} }), fetchImpl };
};

test('anahtar x-apisports-key başlığıyla gider', async () => {
  const { provider, fetchImpl } = make(() => ok(sample('af-fixtures').response));
  await provider.seasonFixtures(203, 2026);
  assert.equal(fetchImpl.calls[0].headers['x-apisports-key'], 'k');
  assert.match(fetchImpl.calls[0].path, /^fixtures\?league=203&season=2026&timezone=Europe\/Istanbul$/);
});

test('maç listesi uygulamanın ortak biçimine çevrilir', async () => {
  const { provider } = make(() => ok(sample('af-fixtures').response));
  const [f] = await provider.seasonFixtures(203, 2026);
  assert.equal(f.id, 1584459);
  assert.equal(f.lg, 203);
  assert.equal(f.st, 'ft');
  assert.deepEqual(f.s, [0, 5]);
  assert.equal(f.round, '11. hafta');
  assert.equal(f.h.name, 'Çorum FK');
  assert.match(f.time, /^\d\d:\d\d$/);
  assert.match(f.date, /^\d{4}-\d\d-\d\d$/);
});

test('maç detayı olay, istatistik ve ilk 11\'i tek istekte getirir', async () => {
  const { provider, fetchImpl } = make(() => ok(sample('af-match').response));
  const m = await provider.match(1584459);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(m.events.filter((e) => e.k === 'goal').length, 5);
  assert.deepEqual(m.events[0], { min: 12, extra: null, side: 'a', k: 'goal', p: 'M. Greenwood', x: 'Asist: O. Aydin' });
  assert.ok(m.events.some((e) => e.k === 'sub' && e.x?.startsWith('Çıkan: ')));
  assert.equal(m.lineups.length, 2);
  assert.equal(m.lineups[0].xi.length, 11);
  assert.equal(m.lineups[0].formation, '4-2-3-1');
  assert.match(m.lineups[0].color, /^#[0-9a-f]{6}$/i);
  const possession = m.stats.find((s) => s.label === 'Topa sahip olma');
  assert.deepEqual([possession.h, possession.a, possession.unit], [39, 61, '%']);
  assert.equal(m.venue, 'Corum Stadyumu');
});

test('puan durumu form ve bölge bilgisini taşır', async () => {
  const { provider } = make(() => ok(sample('af-standings').response));
  const [g] = await provider.standings(203, 2026);
  assert.equal(g.rows.length, 4);
  assert.equal(g.rows[0].rank, 1);
  assert.equal(g.rows[0].team.name, 'Galatasaray');
  assert.equal(g.rows[0].zone, 'cl');
  assert.match(g.rows[0].form, /^[WDL]{1,5}$/);
});

test('kadro yaş ve forma numarasıyla gelir', async () => {
  const { provider } = make(() => ok(sample('af-squad').response));
  const s = await provider.squad(611);
  assert.equal(s.team.name, 'Fenerbahçe');
  assert.deepEqual(s.players[0], { id: 62401, name: 'T. Çetin', age: 29, no: 13, pos: 'Goalkeeper' });
});

test('refresh maçları 20\'şerli gruplar halinde tek istekle sorar', async () => {
  const { provider, fetchImpl } = make((path) => ok([]));
  const fixtures = Array.from({ length: 45 }, (_, i) => ({ id: 1000 + i }));
  await provider.refresh(fixtures);
  assert.equal(fetchImpl.calls.length, 3);
  assert.match(fetchImpl.calls[0].path, /^fixtures\?ids=1000-1001-.*-1019&timezone=/);
  assert.equal(fetchImpl.calls[0].path.split('=')[1].split('&')[0].split('-').length, 20);
  assert.equal(fetchImpl.calls[2].path.split('=')[1].split('&')[0].split('-').length, 5);
});

test('hesap askıya alınınca bir saat boyunca hiç istek gönderilmez', async () => {
  const { provider, fetchImpl } = make(() => ({ headers: {}, body: { errors: { access: 'Your account is suspended, check on https://dashboard.api-football.com.' }, response: [] } }));
  await assert.rejects(provider.status(), (e) => e.kind === 'blocked');
  assert.equal(fetchImpl.calls.length, 1);
  await assert.rejects(provider.match(1), (e) => e.kind === 'blocked');
  await assert.rejects(provider.standings(203, 2026), (e) => e.kind === 'blocked');
  assert.equal(fetchImpl.calls.length, 1, 'askıdayken ikinci istek gönderilmemeli');
});

test('plan ve anahtar hataları ayrı türde bildirilir', async () => {
  const plan = make(() => ({ headers: {}, body: { errors: { plan: 'Free plans do not have access to this season, try from 2022 to 2024.' }, response: [] } }));
  await assert.rejects(plan.provider.seasonFixtures(203, 2026), (e) => e.kind === 'plan');
  const token = make(() => ({ headers: {}, body: { errors: { token: 'Error/Missing application key.' }, response: [] } }));
  await assert.rejects(token.provider.status(), (e) => e.kind === 'config');
});

test('günlük kota bitmeye yaklaşınca istek göndermez', async () => {
  const { provider, fetchImpl } = make(() => ok([], { 'x-ratelimit-requests-remaining': '2' }));
  await provider.standings(203, 2026);
  await assert.rejects(provider.standings(39, 2026), (e) => e.kind === 'quota');
  assert.equal(fetchImpl.calls.length, 1);
});

test('status kotadan düşmeyen çağrıdır ve planı okur', async () => {
  const { provider } = make(() => ok({ subscription: { plan: 'Pro', active: true }, requests: { current: 12, limit_day: 7500 } }));
  assert.deepEqual(await provider.status(), { plan: 'Pro', active: true });
  assert.equal(provider.state.limitDay, 7500);
});
