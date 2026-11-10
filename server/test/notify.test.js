import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eventKey, matchEvents, messageFor, reminderFor } from '../lib/notify.js';
import { createFcm, loadServiceAccount, signJwt } from '../lib/fcm.js';

const F = (st, s, extra = {}) => ({ id: 9, st, s, min: 64, extra: null, h: { id: 645, name: 'Galatasaray' }, a: { id: -5, name: 'Fenerbahçe' }, ...extra });

test('olaylar: başladı, gol, bitti; VAR iptali (skor azaldı) bildirilmez', () => {
  assert.deepEqual(matchEvents(F('ns', null), F('live', [0, 0])), ['start']);
  assert.deepEqual(matchEvents(F('live', [0, 0]), F('live', [1, 0])), ['goal']);
  assert.deepEqual(matchEvents(F('live', [1, 0]), F('ft', [2, 0])), ['goal', 'end']);
  assert.deepEqual(matchEvents(F('live', [1, 0]), F('live', [0, 0])), []);
  assert.deepEqual(matchEvents(F('live', [1, 0]), F('live', [1, 0])), []);
  assert.deepEqual(matchEvents(F('ns', null), undefined), []);
  assert.notEqual(eventKey('goal', F('live', [1, 0])), eventKey('goal', F('live', [2, 0])), 'her gol ayrı');
});

test('mesaj: iki takımın konusuna tek koşulla, maça dokununca açılacak numarayla', () => {
  const m = messageFor('goal', F('live', [2, 1]));
  assert.equal(m.condition, "'team_645' in topics || 'team_-5' in topics");
  assert.equal(m.notification.body, "Galatasaray 2–1 Fenerbahçe (64')");
  assert.deepEqual(m.data, { matchId: '9', kind: 'goal' });
  assert.equal(messageFor('end', F('ft', [2, 1])).notification.title, 'Maç sonu');
});

test('FCM: hizmet hesabı okunur, JWT imzası doğrulanır, erişim anahtarı önbelleklenir', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = { client_email: 'x@p.iam.gserviceaccount.com', project_id: 'p', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  assert.deepEqual(loadServiceAccount({ FIREBASE_SERVICE_ACCOUNT: Buffer.from(JSON.stringify(sa)).toString('base64') }).project_id, 'p');
  assert.equal(loadServiceAccount({}), null);
  const jwt = signJwt(sa, 1_700_000_000_000);
  const [h, c, s] = jwt.split('.');
  assert.ok(crypto.createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url')));
  assert.equal(JSON.parse(Buffer.from(c, 'base64url')).scope, 'https://www.googleapis.com/auth/firebase.messaging');
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(url);
    if (url.includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
    assert.equal(opts.headers.authorization, 'Bearer tok');
    return { ok: true, json: async () => ({ name: 'msg/1' }) };
  };
  const fcm = createFcm({ sa, fetchImpl });
  await fcm.send({ topic: 'team_645' }); await fcm.send({ topic: 'team_645' });
  assert.equal(calls.filter((u) => u.includes('oauth2')).length, 1, 'erişim anahtarı bir kez alınır');
  assert.ok(calls[1].endsWith('/v1/projects/p/messages:send'));
});

test('tahmin hatırlatması: iki takımın hatırlatma konusuna, maç ekranını açar', () => {
  const now = 1_700_000_000_000;
  const f = { id: 9, ts: now / 1000 + 3600, h: { id: 645, name: 'Galatasaray' }, a: { id: 611, name: 'Fenerbahçe' } };
  const m = reminderFor(f, now);
  assert.equal(m.condition, "'pre_team_645' in topics || 'pre_team_611' in topics");
  assert.equal(m.notification.title, 'Galatasaray – Fenerbahçe');
  assert.equal(m.notification.body, 'Maç 1 saat sonra başlıyor. Skoru tahmin et!');
  assert.deepEqual(m.data, { matchId: '9', kind: 'pre' });
  assert.match(reminderFor({ ...f, ts: now / 1000 + 25 * 60 }, now).notification.body, /25 dakika sonra/);
});
