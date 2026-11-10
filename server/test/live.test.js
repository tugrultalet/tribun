import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { apnsJwt, createApns } from '../lib/apns.js';
import { createLive, liveState, multiPayload, nextUpdate, payloadFor } from '../lib/live.js';

const f = (o = {}) => ({ id: 7, st: 'live', s: [1, 0], min: 67, extra: null, short: '2H', time: '20:45', h: { name: 'GS' }, a: { name: 'FB' }, ...o });

test('liveState', () => {
  assert.deepEqual(liveState(f(), 1_000_000_000), { home: 1, away: 0, minute: "67'", status: 'live', clock: 1_000_000 - 67 * 60 });
  assert.deepEqual(liveState(f({ short: 'HT' })).minute, 'Devre arası');
  assert.deepEqual(liveState(f({ st: 'ft' })), { home: 1, away: 0, minute: 'Maç sonu', status: 'ft', clock: null });
  assert.deepEqual(liveState(f({ st: 'ns', s: null })), { home: 0, away: 0, minute: '20:45', status: 'ns', clock: null });
});

test('nextUpdate: gol hemen, dakika en çok dakikada bir', () => {
  const now = 1_000_000;
  const prev = { state: liveState(f()), at: now };
  assert.equal(nextUpdate(prev, f({ min: 68 }), now + 30000), null);
  assert.equal(nextUpdate(prev, f({ min: 68 }), now + 61000).priority, 5);
  const goal = nextUpdate(prev, f({ s: [2, 0] }), now + 1000);
  assert.equal(goal.kind, 'goal'); assert.equal(goal.priority, 10); assert.equal(goal.side, 'h');
  assert.equal(nextUpdate(prev, f({ s: [1, 1] }), now + 1000).side, 'a');
  assert.equal(nextUpdate(prev, f({ st: 'ft' }), now + 1000).kind, 'end');
});

test('payloadFor: gol uyarısı, maç sonu kapanış', () => {
  const g = payloadFor({ kind: 'goal', side: 'h', state: { home: 2, away: 0, minute: "70'", status: 'live' } }, f(), 1_000_000_000);
  assert.equal(g.aps.event, 'update'); assert.equal(g.aps.alert.title, 'GOL! GS'); assert.equal(g.aps['content-state'].note, '⚽ GOL! GS');
  const e = payloadFor({ kind: 'end', state: { home: 2, away: 0, minute: 'Maç sonu', status: 'ft' } }, f(), 1_000_000_000);
  assert.equal(e.aps['content-state'].note, null);
  assert.equal(e.aps.event, 'end'); assert.equal(e.aps['dismissal-date'], 1_000_000 + 3600);
});

test('apnsJwt: ES256 imzası doğrulanır', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const cfg = { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), keyId: 'K', teamId: 'T' };
  const [h, p, s] = apnsJwt(cfg, 1_000_000).split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'K' });
  assert.deepEqual(JSON.parse(Buffer.from(p, 'base64url')), { iss: 'T', iat: 1000 });
  assert.ok(crypto.createVerify('SHA256').update(`${h}.${p}`).verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
});

test('createApns + createLive: kanal açılır, güncelleme yayınlanır', async () => {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const calls = [];
  const send = async (origin, headers, body) => {
    calls.push({ origin, path: headers[':path'], channel: headers['apns-channel-id'], body: body && JSON.parse(body) });
    return headers[':path'].endsWith('/channels') ? { status: 201, headers: { 'apns-channel-id': 'CH1' }, body: '' } : { status: 200, headers: {}, body: '' };
  };
  const apns = createApns({ key: privateKey.export({ type: 'pkcs8', format: 'pem' }), keyId: 'K', teamId: 'T', bundleId: 'b', env: 'development' }, { send });
  const store = [];
  const supa = { rpc: async (fn, a) => { store.push([fn, a]); return fn === 'server_live_channels' ? [] : null; } };
  const live = createLive({ apns, supa });
  assert.equal(await live.channelFor(7), 'CH1');
  assert.equal(await live.channelFor(7), 'CH1', 'ikinci kez oluşturulmaz');
  await live.onFixtures([f(), f({ id: 8 })]);
  const pushes = calls.filter((c) => c.path === '/4/broadcasts/apps/b');
  assert.equal(pushes.length, 1); assert.equal(pushes[0].channel, 'CH1');
  assert.equal(calls[0].origin, 'https://api-manage-broadcast.sandbox.push.apple.com:2195');
  assert.ok(store.some(([fn]) => fn === 'server_set_live_channel'));
});

test('çoklu kart: cihaz anahtarına iki maçın durumu birlikte gider', async () => {
  const calls = [];
  const apns = { env: 'development', createChannel: async () => 'CH', broadcast: async () => {}, deleteChannel: async () => {},
    toToken: async (token, payload, priority) => { calls.push({ token, payload, priority }); } };
  const supa = { rpc: async (fn) => (fn === 'server_live_tokens' ? [{ token: 'T1', matches: [7, 8] }] : fn === 'server_live_channels' ? [] : null) };
  const watched = [];
  const live = createLive({ apns, supa, watch: (id) => watched.push(id) });
  await live.onFixtures([f({ id: 7 }), f({ id: 8, s: [0, 0], min: 12 })], 1_000_000_000);
  assert.deepEqual(watched.sort(), [7, 8]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].payload.aps['content-state'].slots.map((x) => [x.id, x.home, x.away]), [[7, 1, 0], [8, 0, 0]]);
  // 8. maçta gol: kart uyarıyla ve hemen gider
  await live.onFixtures([f({ id: 8, s: [1, 0], min: 13 })], 1_000_030_000);
  assert.equal(calls[1].priority, 10);
  assert.equal(calls[1].payload.aps.alert.title, '⚽ GOL! GS');
  assert.equal(calls[1].payload.aps['content-state'].slots[1].note, '⚽ GOL! GS');
});

test('multiPayload: tüm maçlar bitince kart kapanır', () => {
  const states = new Map([[1, { home: 1, away: 0, minute: 'Maç sonu', status: 'ft', clock: null }], [2, { home: 2, away: 2, minute: 'Maç sonu', status: 'ft', clock: null }]]);
  const p = multiPayload([1, 2], states, new Map(), null, 1_000_000_000);
  assert.equal(p.aps.event, 'end');
});

test('devre arası ve maç sonu uyarısı (sesli)', () => {
  const ht = payloadFor({ kind: 'status', state: { home: 1, away: 0, minute: 'Devre arası', status: 'ht', clock: null } }, f(), 1_000_000_000);
  assert.equal(ht.aps.alert.title, 'Devre arası'); assert.equal(ht.aps.alert.sound, 'default');
  const end = payloadFor({ kind: 'end', state: { home: 2, away: 1, minute: 'Maç sonu', status: 'ft', clock: null } }, f(), 1_000_000_000);
  assert.equal(end.aps.alert.title, 'Maç bitti'); assert.equal(end.aps.alert.body, 'GS 2–1 FB');
  const live = payloadFor({ kind: 'tick', state: { home: 1, away: 0, minute: "70'", status: 'live', clock: 1 } }, f(), 1_000_000_000);
  assert.equal(live.aps.alert, undefined, 'dakika güncellemesinde uyarı yok');
});

test('maç başladı / ikinci yarı uyarısı', () => {
  const now = 1_000_000;
  const ns = { state: liveState(f({ st: 'ns', s: null, min: null })), at: now };
  const k = nextUpdate(ns, f({ min: 1, s: [0, 0] }), now + 1000);
  assert.equal(payloadFor(k, f(), 1_000_000_000).aps.alert.title, 'Maç başladı');
  const ht = { state: liveState(f({ short: 'HT' })), at: now };
  const second = nextUpdate(ht, f({ min: 46 }), now + 1000);
  assert.equal(payloadFor(second, f(), 1_000_000_000).aps.alert.title, 'İkinci yarı başladı');
});

test('gol satırı golü atan oyuncuyu ve tarafını yazar', () => {
  const st = { home: 0, away: 5, minute: "58'", status: 'live' };
  const fx = f({ s: [0, 5], h: { name: 'Tavernes' }, a: { name: 'Valencia' }, goal: { p: 'H. Duro', side: 'a', min: 57, extra: null, n: 5 } });
  const g = payloadFor({ kind: 'goal', side: 'a', state: st }, fx, 1_000_000_000);
  assert.equal(g.aps['content-state'].note, "⚽ GOL! H. Duro 57'");
  assert.equal(g.aps['content-state'].side, 'a');
  assert.equal(g.aps.alert.title, 'GOL! Valencia');
  assert.match(g.aps.alert.body, /^H\. Duro 57' · Tavernes 0–5 Valencia$/);
  // Olaylar skoru henüz yakalamadıysa (eski gol) takım adı yazılır.
  const old = payloadFor({ kind: 'goal', side: 'a', state: st }, { ...fx, goal: { ...fx.goal, n: 4 } }, 1_000_000_000);
  assert.equal(old.aps['content-state'].note, '⚽ GOL! Valencia');
});
