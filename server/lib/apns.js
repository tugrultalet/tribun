// APNs (Apple Push Notification service) — Live Activity yayın kanalları (iOS 18+), bağımlılıksız (node:http2).
// Kimlik: .p8 anahtarı (APNS_KEY: PEM ya da base64, veya APNS_KEY_FILE), APNS_KEY_ID, APNS_TEAM_ID. Anahtar asla repoya konmaz.
// Ortam: APNS_ENV=development (geliştirme derlemesi) | production (TestFlight / App Store).
import crypto from 'node:crypto';
import fs from 'node:fs';
import http2 from 'node:http2';

const HOSTS = {
  development: { push: 'https://api.sandbox.push.apple.com', manage: 'https://api-manage-broadcast.sandbox.push.apple.com:2195' },
  production: { push: 'https://api.push.apple.com', manage: 'https://api-manage-broadcast.push.apple.com:2196' },
};

export function loadApnsConfig(env) {
  const raw = env.APNS_KEY || (env.APNS_KEY_FILE ? fs.readFileSync(env.APNS_KEY_FILE, 'utf8') : '');
  if (!raw || !env.APNS_KEY_ID || !env.APNS_TEAM_ID) return null;
  const key = raw.includes('BEGIN PRIVATE KEY') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return {
    key, keyId: env.APNS_KEY_ID, teamId: env.APNS_TEAM_ID,
    bundleId: env.APNS_BUNDLE_ID || 'com.sportvisor.tribun',
    env: env.APNS_ENV === 'production' ? 'production' : 'development',
  };
}

const b64u = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
export function apnsJwt(cfg, nowMs = Date.now()) {
  const unsigned = `${b64u({ alg: 'ES256', kid: cfg.keyId })}.${b64u({ iss: cfg.teamId, iat: Math.floor(nowMs / 1000) })}`;
  const sig = crypto.createSign('SHA256').update(unsigned).sign({ key: cfg.key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${unsigned}.${sig}`;
}

// HTTP/2 isteği: { status, headers, body }.
function request(origin, headers, body) {
  return new Promise((resolve, reject) => {
    const client = http2.connect(origin);
    client.on('error', reject);
    const req = client.request(headers);
    const timer = setTimeout(() => { req.close(); client.close(); reject(new Error('APNs zaman aşımı')); }, 15000);
    let status = 0, resHeaders = {}, data = '';
    req.on('response', (h) => { status = h[':status']; resHeaders = h; });
    req.setEncoding('utf8');
    req.on('data', (c) => { data += c; });
    req.on('end', () => { clearTimeout(timer); client.close(); resolve({ status, headers: resHeaders, body: data }); });
    req.on('error', (e) => { clearTimeout(timer); client.close(); reject(e); });
    if (body) req.end(body); else req.end();
  });
}

export function createApns(cfg, { send = request } = {}) {
  const hosts = HOSTS[cfg.env];
  let token = null, tokenAt = 0;
  const auth = () => {
    // Apple: anahtar 20–60 dakikada bir yenilenmeli.
    if (!token || Date.now() - tokenAt > 40 * 60000) { token = apnsJwt(cfg); tokenAt = Date.now(); }
    return `bearer ${token}`;
  };
  const fail = (what, r) => Object.assign(new Error(`APNs ${what} başarısız (HTTP ${r.status} ${r.body || ''})`), { status: r.status });
  return {
    env: cfg.env,
    // Yeni yayın kanalı (maç başına bir tane). En son mesaj saklanır: sonradan başlatılan aktivite de güncel skoru alır.
    async createChannel() {
      const r = await send(hosts.manage, {
        ':method': 'POST', ':path': `/1/apps/${cfg.bundleId}/channels`, authorization: auth(), 'content-type': 'application/json',
      }, JSON.stringify({ 'message-storage-policy': 1, 'push-type': 'LiveActivity' }));
      if (r.status !== 201 && r.status !== 200) throw fail('kanal oluşturma', r);
      const id = r.headers['apns-channel-id'];
      if (!id) throw fail('kanal oluşturma (numara yok)', r);
      return String(id);
    },
    async deleteChannel(id) {
      const r = await send(hosts.manage, { ':method': 'DELETE', ':path': `/1/apps/${cfg.bundleId}/channels`, authorization: auth(), 'apns-channel-id': id });
      if (r.status !== 204 && r.status !== 200 && r.status !== 404) throw fail('kanal silme', r);
    },
    // Tek bir Live Activity'ye (cihaza özel anahtar) güncelleme: çoklu maç kartı için.
    async toToken(token, payload, priority = 10) {
      const r = await send(hosts.push, {
        ':method': 'POST', ':path': `/3/device/${token}`, authorization: auth(),
        'apns-push-type': 'liveactivity', 'apns-topic': `${cfg.bundleId}.push-type.liveactivity`, 'apns-priority': String(priority),
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600), 'content-type': 'application/json',
      }, JSON.stringify(payload));
      if (r.status !== 200) throw fail('cihaz gönderimi', r);
    },
    // Kanaldaki tüm Live Activity'lere güncelleme. priority 10: hemen (gol, maç sonu); 5: bütçe dostu (dakika).
    async broadcast(id, payload, priority = 10) {
      const r = await send(hosts.push, {
        ':method': 'POST', ':path': `/4/broadcasts/apps/${cfg.bundleId}`, authorization: auth(),
        'apns-push-type': 'liveactivity', 'apns-channel-id': id, 'apns-priority': String(priority),
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600), 'content-type': 'application/json',
      }, JSON.stringify(payload));
      if (r.status !== 200) throw fail('yayın', r);
    },
  };
}
