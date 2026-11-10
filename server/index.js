// Tribün API: veri kaynağının anahtarını tutan, yanıtları sadeleştirip önbelleğe alan küçük sunucu.
// Bağımlılık yok; Node 20.12+ yeterli. Çalıştırma: `node index.js`
//
// Veri kaynağı: API_FOOTBALL_KEY tanımlı ve hesap ücretli plandaysa API-Football, aksi halde Highlightly.
// `DATA_PROVIDER=highlightly` ile API-Football devre dışı bırakılabilir.
import http from 'node:http';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail, today } from './lib/common.js';
import { createCore } from './core.js';
import { invitePage, validCode } from './lib/invite.js';
import { privacyPage } from './lib/privacy.js';
import { createFcm, loadServiceAccount } from './lib/fcm.js';
import { messageFor } from './lib/notify.js';
import { Buckets, clientIp, dateInWindow } from './lib/limits.js';
import { createSupa, syncMatches } from './lib/supa.js';
import { createApiFootball } from './providers/apifootball.js';
import { createHighlightly } from './providers/highlightly.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(DIR, '.env')); } catch { /* .env isteğe bağlı */ }

const PORT = Number(process.env.PORT || 8787);
const CACHE_DIR = process.env.CACHE_DIR || path.join(DIR, '.cache');

async function chooseProvider() {
  const want = (process.env.DATA_PROVIDER || '').toLowerCase();
  const key = process.env.API_FOOTBALL_KEY;
  if (want !== 'highlightly' && key) {
    const af = createApiFootball({ key, baseUrl: process.env.API_FOOTBALL_URL });
    try {
      const s = await af.status();
      if (!s.active) throw new Error('abonelik etkin değil');
      if (/free/i.test(s.plan || '') && !process.env.API_FOOTBALL_ALLOW_FREE) throw new Error(`"${s.plan}" planda güncel sezon verisi kapalı, ücretli plan gerekir`);
      return af;
    } catch (e) {
      console.warn(`UYARI: API-Football kullanılamıyor (${e.message}). Highlightly'ye geçiliyor.`);
    }
  }
  return createHighlightly({ key: process.env.HIGHLIGHTLY_KEY, baseUrl: process.env.HIGHLIGHTLY_URL });
}

const provider = await chooseProvider();
// Takım ve maç numaraları kaynağa göre değiştiği için her kaynağın önbelleği ayrı klasörde tutulur.
// Bildirimler: Firebase hizmet hesabı verildiyse açık (bkz. .env.example).
let fcm = null;
try {
  const sa = loadServiceAccount(process.env);
  if (sa) fcm = createFcm({ sa });
} catch (e) { console.warn(`UYARI: Firebase hizmet hesabı okunamadı (${e.message}); bildirimler kapalı.`); }
const notify = fcm ? (kind, f) => fcm.send(messageFor(kind, f)).catch((e) => console.warn(`Bildirim gönderilemedi: ${e.message}`)) : null;
const core = createCore({ provider, cacheDir: path.join(CACHE_DIR, provider.id), notify });

/* ---------- HTTP ---------- */
function leagueParam(q) {
  const raw = q.get('leagues');
  if (raw == null) return [...core.leagueIds];
  return [...new Set(raw.split(',').map(Number).filter((id) => core.leagueIds.has(id)))];
}
// Ortak numaralar pozitif; formüle uymayan kayıtlar negatif numara alır (bkz. lib/ids.js), ikisi de geçerlidir.
const validId = (n) => Number.isSafeInteger(n) && n !== 0;
const teamParam = (q) => [...new Set((q.get('teams') || '').split(',').map(Number).filter(validId))].slice(0, 30);
const knownLeague = (m) => {
  const id = Number(m[1]);
  if (!core.leagueIds.has(id)) throw fail('notfound', 'Bu lig desteklenmiyor.');
  return id;
};
const routes = [
  [/^\/api\/meta$/, () => core.meta()],
  [/^\/api\/fixtures$/, (m, q, ctx) => {
    const date = q.get('date') || today();
    // Gerçek bir tarih ve bugünden en çok 30 gün uzakta olmalı (her yeni tarih kaynağa istek demektir).
    if (!dateInWindow(date, today(), 30)) throw fail('bad', 'Geçersiz tarih.');
    return core.day(date, leagueParam(q), teamParam(q), ctx);
  }],
  [/^\/api\/mine$/, (m, q, ctx) => core.mine(teamParam(q), ctx)],
  [/^\/api\/national$/, () => core.national()],
  [/^\/api\/results$/, (m, q, ctx) => core.results([...new Set((q.get('ids') || '').split(',').map(Number).filter(validId))].slice(0, 40), ctx)],
  [/^\/api\/match\/(-?\d{1,12})$/, (m, q, ctx) => core.match(Number(m[1]), ctx)],
  [/^\/api\/match\/(-?\d{1,12})\/lineups$/, (m, q, ctx) => core.lineups(Number(m[1]), ctx)],
  [/^\/api\/standings\/(\d+)$/, (m) => core.standings(knownLeague(m))],
  [/^\/api\/league\/(\d+)\/fixtures$/, (m) => core.leagueFixtures(knownLeague(m))],
  [/^\/api\/league\/(\d+)\/teams$/, (m) => core.teams(knownLeague(m))],
  [/^\/api\/team\/(-?\d{1,12})$/, (m, q, ctx) => core.team(Number(m[1]), ctx)],
  [/^\/api\/team\/(-?\d{1,12})\/squad$/, (m, q, ctx) => core.squad(Number(m[1]), ctx)],
];
const STATUS = { quota: 429, busy: 429, bad: 400, notfound: 404, config: 500, plan: 403, blocked: 503, upstream: 502 };

// IP başına istek sınırı: dakikada 120 istek, en çok 60'lık patlama (uygulamanın normal kullanımı bunun çok altında).
const perIp = new Buckets({ rate: Number(process.env.RATE_PER_MIN || 120), burst: Number(process.env.RATE_BURST || 60) });
setInterval(() => perIp.sweep(), 5 * 60000).unref();
// Yanıt ne kadar süre önbellekte (telefon/ara sunucu) tutulabilir: canlı veri kısa, yavaş değişen veri uzun.
const cacheFor = (p) =>
  /^\/api\/(match\/[^/]+|results|mine|fixtures)$/.test(p) ? 'public, max-age=10'
  : /^\/api\/(league\/\d+\/fixtures|team\/[^/]+|match\/[^/]+\/lineups)$/.test(p) ? 'public, max-age=30'
  : /^\/api\/(standings\/\d+|league\/\d+\/teams|team\/[^/]+\/squad|national|meta)$/.test(p) ? 'public, max-age=300'
  : 'no-store';
// Universal Links: tribunapp.io/j/KOD bağlantısı uygulama kuruluysa doğrudan uygulamada açılır.
const AASA = JSON.stringify({ applinks: { details: [{ appIDs: [`${process.env.APPLE_TEAM_ID || 'M93BM8ZSQH'}.com.sportvisor.tribun`], components: [{ '/': '/j/*' }] }] } });
const PUBLIC_HOST = (process.env.PUBLIC_HOST || 'tribunapp.io').toLowerCase();
const SECURITY_HEADERS = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };

const server = http.createServer(async (req, res) => {
  const send = (code, body, cache = 'no-store') => {
    const headers = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': code === 200 ? cache : 'no-store', ...SECURITY_HEADERS };
    const json = JSON.stringify(body);
    // Büyük yanıtlar sıkıştırılır (mobil veri ve süre).
    if (json.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      res.writeHead(code, { ...headers, 'content-encoding': 'gzip', vary: 'accept-encoding' });
      return res.end(zlib.gzipSync(json));
    }
    res.writeHead(code, headers);
    res.end(json);
  };
  const ip = clientIp(req.headers, req.socket.remoteAddress);
  if (req.method === 'OPTIONS') return send(204, {});
  if (!perIp.take(ip)) return send(429, { error: { kind: 'busy', message: 'Çok fazla istek; biraz sonra tekrar dene.' } });
  if (req.method !== 'GET') return send(405, { error: { kind: 'bad', message: 'Yalnızca GET.' } });
  const url = new URL(req.url, 'http://x');
  // www.tribunapp.io → tribunapp.io (tek adres; Universal Links yalnızca ana alan adında tanımlı).
  if ((req.headers.host || '').toLowerCase() === `www.${PUBLIC_HOST}`) {
    res.writeHead(301, { location: `https://${PUBLIC_HOST}${url.pathname}${url.search}` });
    return res.end();
  }
  if (url.pathname === '/.well-known/apple-app-site-association' || url.pathname === '/apple-app-site-association') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600', ...SECURITY_HEADERS });
    return res.end(AASA);
  }
  if (url.pathname === '/') return send(200, { name: 'Tribün API', ok: true, provider: provider.id });
  // Gizlilik politikası ve KVKK aydınlatma metni (App Store'a verilecek adres).
  if (url.pathname === '/gizlilik') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600', ...SECURITY_HEADERS, 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" });
    return res.end(privacyPage({ contact: process.env.CONTACT_EMAIL }));
  }
  // Davet bağlantısı: /j/ABC123?n=Grup+adı  (WhatsApp'tan gelen kişi için karşılama sayfası)
  const invite = /^\/j\/([A-Za-z0-9]{6})$/.exec(url.pathname);
  if (invite && validCode(invite[1])) {
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300', ...SECURITY_HEADERS,
      // Sayfa dış kaynak yüklemez; yalnızca kendi satır içi stil ve betiği çalışır, başka sitelerde çerçevelenemez.
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'x-frame-options': 'DENY',
    });
    return res.end(invitePage({ code: invite[1], name: url.searchParams.get('n'), storeUrl: process.env.APP_STORE_URL }));
  }
  for (const [re, handler] of routes) {
    const m = re.exec(url.pathname);
    if (!m) continue;
    try {
      return send(200, await handler(m, url.searchParams, { ip }), cacheFor(url.pathname));
    } catch (e) {
      if (!e.kind) console.error(e);
      // Beklenmeyen hataların iç ayrıntısı istemciye gönderilmez (sunucu günlüğüne yazılır).
      return send(STATUS[e.kind] || 500, { error: { kind: e.kind || 'server', message: e.kind ? e.message : 'Sunucu hatası.' } });
    }
  }
  send(404, { error: { kind: 'notfound', message: 'Bulunamadı.' } });
});

// Yavaş/yarım bırakılan bağlantılar kaynak tutmasın.
server.requestTimeout = 30000;
server.headersTimeout = 15000;

// Uygulamalar kapalıyken de canlı maçlar tazelensin (gol bildirimi için). refreshUnsettled kendi hızını sınırlar:
// canlı/başlamak üzere maç yoksa kaynağa istek gitmez.
if (process.env.BACKGROUND_REFRESH !== '0') setInterval(() => core.tick().catch(() => {}), 15000).unref();

// Puanlama: tahmin girilen maçların saatini ve sonucunu dakikada bir Supabase'e yazar; puanlar veritabanında hesaplanır.
const supa = createSupa();
if (supa && process.env.BACKGROUND_REFRESH !== '0') {
  let syncing = false;
  setInterval(async () => {
    if (syncing) return;
    syncing = true;
    try {
      const r = await syncMatches(supa, (ids) => core.results(ids));
      if (r.scored) console.log(`Puanlama: ${r.scored} maç puanlandı.`);
    } catch (e) { console.warn('Puanlama eşitlemesi başarısız:', e.message); } finally { syncing = false; }
  }, 60000).unref();
}

server.listen(PORT, () => {
  const s = provider.state;
  console.log(`Tribün API http://localhost:${PORT}`);
  console.log(`Veri kaynağı: ${provider.name}${s.plan ? ` (plan ${s.plan}${s.limitDay ? `, günlük limit ${s.limitDay}` : ''})` : ''}`);
  const problem = provider.configError();
  if (problem) console.warn(`UYARI: ${problem} server/.env dosyasına ekleyin.`);
  console.log(supa ? 'Puanlama: açık (Supabase)' : 'Puanlama: kapalı (SUPABASE_SERVICE_ROLE_KEY tanımlı değil)');
  console.log(fcm ? `Bildirimler: açık (Firebase projesi ${fcm.projectId})` : 'Bildirimler: kapalı (FIREBASE_SERVICE_ACCOUNT tanımlı değil)');
});
