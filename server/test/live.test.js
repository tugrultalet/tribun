import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { apnsJwt, createApns } from '../lib/apns.js';
import { createLive, liveState, nextUpdate, payloadFor } from '../lib/live.js';

const f = (o = {}) => ({ id: 7, st: 'live', s: [1, 0], min: 67, extra: null, short: '2H', time: '20:45', h: { name: 'GS' }, a: { name: 'FB' }, ...o });

test('liveState', () => {
  assert.deepEqual(liveState(f()), { home: 1, away: 0, minute: "67'", status: 'live' });
  assert.deepEqual(liveState(f({ short: 'HT' })).minute, 'DA');
  assert.deepEqual(liveState(f({ st: 'ft' })), { home: 1, away: 0, minute: 'MS', status: 'ft' });
  assert.deepEqual(liveState(f({ st: 'ns', s: null })), { home: 0, away: 0, minute: '20:45', status: 'ns' });
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
  const e = payloadFor({ kind: 'end', state: { home: 2, away: 0, minute: 'MS', status: 'ft' } }, f(), 1_000_000_000);
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
