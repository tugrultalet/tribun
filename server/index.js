// Tribün API: veri kaynağının anahtarını tutan, yanıtları sadeleştirip önbelleğe alan küçük sunucu.
// Bağımlılık yok; Node 20.12+ yeterli. Çalıştırma: `node index.js`
//
// Veri kaynağı: API_FOOTBALL_KEY tanımlı ve hesap ücretli plandaysa API-Football, aksi halde Highlightly.
// `DATA_PROVIDER=highlightly` ile API-Football devre dışı bırakılabilir.
import http from 'node:http';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG, fail, today } from './lib/common.js';
import { createCore } from './core.js';
import { invitePage, validCode } from './lib/invite.js';
import { privacyPage } from './lib/privacy.js';
import { landingPage, LANDING_CSP } from './lib/landing.js';
import { createFcm, loadServiceAccount } from './lib/fcm.js';
import { messageFor } from './lib/notify.js';
import { Buckets, clientIp, dateInWindow } from './lib/limits.js';
import { createSupa, syncMatches } from './lib/supa.js';
import { askPage, validAskToken } from './lib/ask.js';
import { loginPage } from './lib/login.js';
import { friendSvg, groupSvg, logoUri, matchSvg, renderPng } from './lib/og.js';
import { friendPage, validFriendCode } from './lib/friend.js';
import { nationalName } from './lib/national.js';
import { sendPushes } from './lib/push.js';
import { createApns, loadApnsConfig } from './lib/apns.js';
import { createLive } from './lib/live.js';
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
// Live Activity (iOS 18+): APNs yayın kanalları. APNS_KEY / APNS_KEY_ID / APNS_TEAM_ID tanımlı değilse kapalı.
let live = null;
const onRefresh = (fixtures) => live?.onFixtures(fixtures);
const core = createCore({ provider, cacheDir: path.join(CACHE_DIR, provider.id), notify, onRefresh });

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
  [/^\/api\/match\/(-?\d{1,12})\/odds$/, (m, q, ctx) => core.odds(Number(m[1]), ctx)],
  [/^\/api\/standings\/(\d+)$/, (m) => core.standings(knownLeague(m))],
  [/^\/api\/league\/(\d+)\/fixtures$/, (m) => core.leagueFixtures(knownLeague(m))],
  [/^\/api\/league\/(\d+)\/teams$/, (m) => core.teams(knownLeague(m))],
  [/^\/api\/team\/(-?\d{1,12})$/, (m, q, ctx) => core.team(Number(m[1]), ctx)],
  [/^\/api\/team\/(-?\d{1,12})\/squad$/, (m, q, ctx) => core.squad(Number(m[1]), ctx)],
  // Kilit ekranında takip: maçın APNs yayın kanalı. Yalnızca canlı ya da 6 saat içinde başlayacak maç için.
  [/^\/api\/live\/(-?\d{1,12})\/channel$/, async (m, q, ctx) => {
    if (!live) throw fail('config', 'Kilit ekranında canlı skor şu an kapalı.');
    const id = Number(m[1]);
    const f = await core.watchMatch(id, ctx);
    if (!(f.st === 'live' || (f.st === 'ns' && f.ts * 1000 - Date.now() < 6 * 3600000))) throw fail('bad', 'Bu maç için canlı takip henüz açılmadı.');
    return { channel: await live.channelFor(id), env: apnsCfg.env };
  }],
];
const STATUS = { quota: 429, busy: 429, bad: 400, notfound: 404, config: 500, plan: 403, blocked: 503, upstream: 502 };

// IP başına istek sınırı: dakikada 120 istek, en çok 60'lık patlama (uygulamanın normal kullanımı bunun çok altında).
const perIp = new Buckets({ rate: Number(process.env.RATE_PER_MIN || 120), burst: Number(process.env.RATE_BURST || 60) });
setInterval(() => perIp.sweep(), 5 * 60000).unref();
// Yanıt ne kadar süre önbellekte (telefon/ara sunucu) tutulabilir: canlı veri kısa, yavaş değişen veri uzun.
const cacheFor = (p) =>
  /^\/api\/(match\/[^/]+|results|mine|fixtures)$/.test(p) ? 'public, max-age=10'
  : /^\/api\/(league\/\d+\/fixtures|team\/[^/]+|match\/[^/]+\/(lineups|odds))$/.test(p) ? 'public, max-age=30'
  : /^\/api\/(standings\/\d+|league\/\d+\/teams|team\/[^/]+\/squad|national|meta)$/.test(p) ? 'public, max-age=300'
  : 'no-store';
// Universal Links: tribunapp.io/j/KOD bağlantısı uygulama kuruluysa doğrudan uygulamada açılır.
// Önizleme görseli: istek bilgisi + maç (logolar, lig, saat). Son 200 görsel bellekte tutulur.
// Görsel tasarımı değişince artırılır: WhatsApp görseli adresine göre sakladığı için yeni tasarım yeni adresle gelir.
const OG_DESIGN = 2;
const ogCache = new Map();
// Milli takım adları Türkçe (Belgium → Belçika); kulüp adları olduğu gibi kalır.
const trName = (n) => { const t = nationalName(n); return t.toLowerCase() === String(n || '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase() ? n : t; };
const DAY_FMT = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
// Grup daveti görseli: maç grubunda iki takımın logosu ve maç saati, takım grubunda 1–3 takımın logosu.
async function groupImage(code) {
  const info = await publicRpc('invite_info', { p_code: code });
  if (!info) throw new Error('yok');
  const key = `g:${code}:${info.members}`;
  if (ogCache.has(key)) return ogCache.get(key);
  const scope = info.scope || null;
  let logos = [], kicker = 'Tribün', when = '';
  if (scope?.type === 'match') {
    kicker = 'Maç tribünü';
    try {
      const f = (await core.match(Number(scope.ids[0]))).fixture;
      logos = [await logoUri(f.h.logo), await logoUri(f.a.logo)];
      when = DAY_FMT.format(f.ts * 1000).replace(/\s(\d{2}:\d{2})$/, ' · $1');
    } catch { logos = [await logoUri(info.team_logo)]; }
  } else {
    const ids = scope?.type === 'teams' ? scope.ids : [info.team_id];
    logos = await Promise.all(ids.slice(0, 3).map((id) => logoUri(`https://media.api-sports.io/football/teams/${id}.png`)));
    if (scope?.type === 'leagues') logos = [await logoUri(info.team_logo)];
  }
  const png = renderPng(groupSvg({ name: info.name, logos, kicker, when, members: info.members }));
  ogCache.set(key, png);
  if (ogCache.size > 200) ogCache.delete(ogCache.keys().next().value);
  return png;
}

async function askImage(token) {
  const info = await publicRpc('ask_info', { p_token: token });
  if (!info) throw new Error('yok');
  const key = `${token}:${info.pick ? `${info.pick.h}-${info.pick.a}` : 'x'}`;
  if (ogCache.has(key)) return ogCache.get(key);
  let f = null;
  try { f = (await core.match(Number(info.match_id))).fixture; } catch { /* adlar istekten gelir, logo olmaz */ }
  const lg = f && (CATALOG.find((c) => c.id === f.lg)?.name || f.lgName);
  const kick = f ? f.ts * 1000 : Date.parse(info.kickoff);
  const png = renderPng(matchSvg({
    home: trName(f?.h.name || info.home), away: trName(f?.a.name || info.away),
    homeLogo: await logoUri(f?.h.logo), awayLogo: await logoUri(f?.a.logo),
    pick: info.pick, sender: info.sender,
    // Lig ve tur birlikte sığmıyorsa yalnızca lig adı.
    league: lg && f?.round && `${lg} · ${f.round}`.length <= 28 ? `${lg} · ${f.round}` : lg || '',
    when: Number.isFinite(kick) ? DAY_FMT.format(kick).replace(/\s(\d{2}:\d{2})$/, ' · $1') : '',
  }));
  ogCache.set(key, png);
  if (ogCache.size > 200) ogCache.delete(ogCache.keys().next().value);
  return png;
}

const AASA = JSON.stringify({ applinks: { details: [{ appIDs: [`${process.env.APPLE_TEAM_ID || 'M93BM8ZSQH'}.com.sportvisor.tribun`], components: [{ '/': '/j/*' }, { '/': '/t/*' }, { '/': '/a/*' }, { '/': '/giris' }] }] } });
const PUBLIC_HOST = (process.env.PUBLIC_HOST || 'tribunapp.io').toLowerCase();
// Supabase: sunucu yetkili istemci (service role, ortam değişkeninden) ve herkese açık anahtarla çağrı (web sayfaları).
// Publishable anahtar gizli değildir; uygulamada da durur.
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://kbekepfgbgxlyqllkkuu.supabase.co').replace(/\/$/, '');
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_k85M5vAXnmMtReECuvCEqg_smrFYQxd';
const supa = createSupa({ url: SUPABASE_URL });
let apnsCfg = null;
try { apnsCfg = loadApnsConfig(process.env); } catch (e) { console.warn(`UYARI: APNs anahtarı okunamadı: ${e.message}`); }
if (apnsCfg && supa) live = createLive({ apns: createApns(apnsCfg), supa, watch: (id) => core.watchMatch(id) });
async function publicRpc(fn, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(args), signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`supabase ${fn}: ${r.status}`);
  return r.json();
}
const SECURITY_HEADERS = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
const LANDING = landingPage({ storeUrl: process.env.APP_STORE_URL });

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
  // Ana sayfa (tanıtım sayfası). Sunucu durumu /api/health adresinde.
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300', vary: 'accept-encoding', ...SECURITY_HEADERS, 'content-security-policy': LANDING_CSP, 'x-frame-options': 'DENY' };
    if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      res.writeHead(200, { ...headers, 'content-encoding': 'gzip' });
      return res.end(LANDING.gzip);
    }
    res.writeHead(200, headers);
    return res.end(LANDING.html);
  }
  if (url.pathname === '/api/health') return send(200, { name: 'Tribün API', ok: true, provider: provider.id });
  // Gizlilik politikası ve KVKK aydınlatma metni (App Store'a verilecek adres).
  if (url.pathname === '/gizlilik') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600', ...SECURITY_HEADERS, 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'" });
    return res.end(privacyPage({ contact: process.env.CONTACT_EMAIL }));
  }
  // E-postadaki giriş bağlantısı (uygulama Universal Link ile açmadıysa): /giris?h=…
  if (url.pathname === '/giris') {
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS,
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
    });
    return res.end(loginPage({ hash: url.searchParams.get('h') }));
  }
  // Arkadaş daveti: /a/KOD (sayfa) ve /a/KOD/og.png (WhatsApp kartı)
  const fr = /^\/a\/([A-Za-z0-9]{8})(\/og\.png)?$/.exec(url.pathname);
  if (fr && validFriendCode(fr[1])) {
    let info = null;
    try { info = await publicRpc('friend_invite_info', { p_code: fr[1].toUpperCase() }); } catch { /* ad olmadan */ }
    if (fr[2]) {
      if (!info) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS }); return res.end('Görsel yok'); }
      const key = `f:${fr[1].toUpperCase()}:${info.name}`;
      const png = ogCache.get(key) || renderPng(friendSvg({ name: info.name }));
      ogCache.set(key, png);
      res.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length, 'cache-control': 'public, max-age=3600', ...SECURITY_HEADERS });
      return res.end(png);
    }
    res.writeHead(info ? 200 : 404, {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300', ...SECURITY_HEADERS,
      'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src ${SUPABASE_URL}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      'x-frame-options': 'DENY',
    });
    const image = info ? `https://${PUBLIC_HOST}/a/${fr[1].toUpperCase()}/og.png?d=${OG_DESIGN}` : null;
    return res.end(friendPage({ code: fr[1], name: info?.name, storeUrl: process.env.APP_STORE_URL, image, supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_PUBLISHABLE_KEY }));
  }
  // Grup davetinin önizleme görseli: /j/KOD/og.png
  const gog = /^\/j\/([A-Za-z0-9]{6})\/og\.png$/.exec(url.pathname);
  if (gog && validCode(gog[1])) {
    try {
      const png = await groupImage(gog[1].toUpperCase());
      res.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length, 'cache-control': 'public, max-age=3600', ...SECURITY_HEADERS });
      return res.end(png);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
      return res.end('Görsel yok');
    }
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
    let info = null;
    try { info = await publicRpc('invite_info', { p_code: invite[1].toUpperCase() }); } catch { /* adı bağlantıdan */ }
    const image = info ? `https://${PUBLIC_HOST}/j/${invite[1].toUpperCase()}/og.png?d=${OG_DESIGN}&m=${info.members}` : null;
    return res.end(invitePage({ code: invite[1], name: info?.name || url.searchParams.get('n'), storeUrl: process.env.APP_STORE_URL, image }));
  }
  // Bağlantının önizleme görseli (WhatsApp vb.): /t/KOD8/og.png. Aynı istek için bellekte saklanır.
  const og = /^\/t\/([A-Za-z0-9]{8})\/og\.png$/.exec(url.pathname);
  if (og && validAskToken(og[1])) {
    try {
      const png = await askImage(og[1].toUpperCase());
      res.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length, 'cache-control': 'public, max-age=3600', ...SECURITY_HEADERS });
      return res.end(png);
    } catch (e) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
      return res.end('Görsel yok');
    }
  }
  // "Arkadaşına sor" bağlantısı: /t/KOD8 (uygulama kuruluysa Universal Link ile uygulamada açılır).
  const ask = /^\/t\/([A-Za-z0-9]{8})$/.exec(url.pathname);
  if (ask && validAskToken(ask[1])) {
    let info = null;
    try { info = await publicRpc('ask_info', { p_token: ask[1].toUpperCase() }); } catch { /* sayfa "bulunamadı" gösterir */ }
    if (info) info = { ...info, home: trName(info.home), away: trName(info.away) };
    res.writeHead(info ? 200 : 404, {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60', ...SECURITY_HEADERS,
      'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src ${SUPABASE_URL}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      'x-frame-options': 'DENY',
    });
    // Görsel adresinde tahmin de var: tahmin değişince WhatsApp eski görseli kullanmasın.
    const image = info ? `https://${PUBLIC_HOST}/t/${ask[1].toUpperCase()}/og.png?d=${OG_DESIGN}${info.pick ? `&p=${info.pick.h}-${info.pick.a}` : ''}` : null;
    return res.end(askPage({ token: ask[1], info, supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_PUBLISHABLE_KEY, storeUrl: process.env.APP_STORE_URL, image }));
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

// Kişiye özel bildirimler (tahmin istekleri): veritabanındaki kuyruktan 15 sn'de bir alınır ve FCM ile gönderilir.
if (supa && fcm && process.env.BACKGROUND_REFRESH !== '0') {
  let sending = false;
  setInterval(async () => {
    if (sending) return;
    sending = true;
    try { await sendPushes(supa, fcm); } catch (e) { console.warn('Kişisel bildirimler gönderilemedi:', e.message); } finally { sending = false; }
  }, 15000).unref();
}

// Puanlama: tahmin girilen maçların saatini ve sonucunu dakikada bir Supabase'e yazar; puanlar veritabanında hesaplanır.
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
  console.log(live ? `Live Activity: açık (APNs ${apnsCfg.env})` : 'Live Activity: kapalı (APNS_KEY / APNS_KEY_ID / APNS_TEAM_ID tanımlı değil)');
  console.log(fcm ? `Bildirimler: açık (Firebase projesi ${fcm.projectId})` : 'Bildirimler: kapalı (FIREBASE_SERVICE_ACCOUNT tanımlı değil)');
});
