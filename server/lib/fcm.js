// Firebase Cloud Messaging (HTTP v1) gönderici, bağımlılıksız. Kimlik: Firebase hizmet hesabı (service account) JSON'u.
// FIREBASE_SERVICE_ACCOUNT (JSON ya da base64) veya FIREBASE_SERVICE_ACCOUNT_FILE (dosya yolu) ile verilir; asla repoya konmaz.
import crypto from 'node:crypto';
import fs from 'node:fs';

export function loadServiceAccount(env) {
  const raw = env.FIREBASE_SERVICE_ACCOUNT || (env.FIREBASE_SERVICE_ACCOUNT_FILE ? fs.readFileSync(env.FIREBASE_SERVICE_ACCOUNT_FILE, 'utf8') : '');
  if (!raw) return null;
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const sa = JSON.parse(text);
  if (!sa.client_email || !sa.private_key || !sa.project_id) throw new Error('hizmet hesabı JSON\'unda client_email, private_key ya da project_id eksik');
  return sa;
}

const b64u = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
export function signJwt(sa, nowMs = Date.now()) {
  const iat = Math.floor(nowMs / 1000);
  const unsigned = `${b64u({ alg: 'RS256', typ: 'JWT' })}.${b64u({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600,
  })}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
  return `${unsigned}.${sig}`;
}

export function createFcm({ sa, fetchImpl = fetch }) {
  let token = null, until = 0;
  async function accessToken() {
    if (token && Date.now() < until) return token;
    const res = await fetchImpl(sa.token_uri || 'https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signJwt(sa) }).toString(),
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) throw new Error(`FCM kimlik doğrulama başarısız (HTTP ${res.status})`);
    token = body.access_token;
    until = Date.now() + Math.max(60, (body.expires_in || 3600) - 300) * 1000;
    return token;
  }
  return {
    projectId: sa.project_id,
    async send(message) {
      const res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST', headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message }), signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`FCM gönderimi başarısız (HTTP ${res.status})`);
      return res.json().catch(() => ({}));
    },
  };
}
