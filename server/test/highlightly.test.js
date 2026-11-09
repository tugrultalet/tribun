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
