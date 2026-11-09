// Tribün API: veri kaynağının anahtarını tutan, yanıtları sadeleştirip önbelleğe alan küçük sunucu.
// Bağımlılık yok; Node 20.12+ yeterli. Çalıştırma: `node index.js`
//
// Veri kaynağı: API_FOOTBALL_KEY tanımlı ve hesap ücretli plandaysa API-Football, aksi halde Highlightly.
// `DATA_PROVIDER=highlightly` ile API-Football devre dışı bırakılabilir.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail, today } from './lib/common.js';
import { createCore } from './core.js';
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
const core = createCore({ provider, cacheDir: path.join(CACHE_DIR, provider.id) });

/* ---------- HTTP ---------- */
function leagueParam(q) {
  const raw = q.get('leagues');
  if (raw == null) return [...core.leagueIds];
  return [...new Set(raw.split(',').map(Number).filter((id) => core.leagueIds.has(id)))];
}
const teamParam = (q) => [...new Set((q.get('teams') || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 12);
const knownLeague = (m) => {
  const id = Number(m[1]);
  if (!core.leagueIds.has(id)) throw fail('notfound', 'Bu lig desteklenmiyor.');
  return id;
};
const routes = [
  [/^\/api\/meta$/, () => core.meta()],
  [/^\/api\/fixtures$/, (m, q) => {
    const date = q.get('date') || today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail('bad', 'Geçersiz tarih.');
    return core.day(date, leagueParam(q), teamParam(q));
  }],
  [/^\/api\/mine$/, (m, q) => core.mine(teamParam(q))],
  [/^\/api\/match\/(\d+)$/, (m) => core.match(Number(m[1]))],
  [/^\/api\/match\/(\d+)\/lineups$/, (m) => core.lineups(Number(m[1]))],
  [/^\/api\/standings\/(\d+)$/, (m) => core.standings(knownLeague(m))],
  [/^\/api\/league\/(\d+)\/fixtures$/, (m) => core.leagueFixtures(knownLeague(m))],
  [/^\/api\/league\/(\d+)\/teams$/, (m) => core.teams(knownLeague(m))],
  [/^\/api\/team\/(\d+)$/, (m) => core.team(Number(m[1]))],
  [/^\/api\/team\/(\d+)\/squad$/, (m) => core.squad(Number(m[1]))],
];
const STATUS = { quota: 429, bad: 400, notfound: 404, config: 500, plan: 403, blocked: 503 };

const server = http.createServer(async (req, res) => {
  const send = (code, body) => {
    res.writeHead(code, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') return send(204, {});
  if (req.method !== 'GET') return send(405, { error: { kind: 'bad', message: 'Yalnızca GET.' } });
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') return send(200, { name: 'Tribün API', ok: true, provider: provider.id });
  for (const [re, handler] of routes) {
    const m = re.exec(url.pathname);
    if (!m) continue;
    try {
      return send(200, await handler(m, url.searchParams));
    } catch (e) {
      if (!e.kind) console.error(e);
      return send(STATUS[e.kind] || 502, { error: { kind: e.kind || 'server', message: e.message } });
    }
  }
  send(404, { error: { kind: 'notfound', message: 'Bulunamadı.' } });
});

server.listen(PORT, () => {
  const s = provider.state;
  console.log(`Tribün API http://localhost:${PORT}`);
  console.log(`Veri kaynağı: ${provider.name}${s.plan ? ` (plan ${s.plan}${s.limitDay ? `, günlük limit ${s.limitDay}` : ''})` : ''}`);
  const problem = provider.configError();
  if (problem) console.warn(`UYARI: ${problem} server/.env dosyasına ekleyin.`);
});
