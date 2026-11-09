// Tribün API: API-Football anahtarını tutan, yanıtları sadeleştirip önbelleğe alan küçük sunucu.
// Bağımlılık yok; Node 20.12+ yeterli. Çalıştırma: `node index.js`
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(DIR, '.env')); } catch { /* .env isteğe bağlı */ }

const KEY = process.env.API_FOOTBALL_KEY;
const PORT = Number(process.env.PORT || 8787);
const TZ = 'Europe/Istanbul';
const UPSTREAM = process.env.API_FOOTBALL_URL || 'https://v3.football.api-sports.io/';
const CACHE_DIR = process.env.CACHE_DIR || path.join(DIR, '.cache');
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;

const LEAGUES = [
  { id: 203, name: 'Süper Lig', country: 'Türkiye', flag: '🇹🇷', type: 'main' },
  { id: 39, name: 'Premier League', country: 'İngiltere', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', type: 'main' },
  { id: 140, name: 'La Liga', country: 'İspanya', flag: '🇪🇸', type: 'main' },
  { id: 135, name: 'Serie A', country: 'İtalya', flag: '🇮🇹', type: 'main' },
  { id: 78, name: 'Bundesliga', country: 'Almanya', flag: '🇩🇪', type: 'main' },
  { id: 61, name: 'Ligue 1', country: 'Fransa', flag: '🇫🇷', type: 'main' },
  { id: 88, name: 'Eredivisie', country: 'Hollanda', flag: '🇳🇱', type: 'main' },
  { id: 94, name: 'Primeira Liga', country: 'Portekiz', flag: '🇵🇹', type: 'main' },
  { id: 2, name: 'Şampiyonlar Ligi', country: 'UEFA', flag: '★', type: 'cup' },
  { id: 3, name: 'Avrupa Ligi', country: 'UEFA', flag: '☆', type: 'cup' },
  { id: 848, name: 'Konferans Ligi', country: 'UEFA', flag: '◇', type: 'cup' },
].map((l) => ({ ...l, logo: `https://media.api-sports.io/football/leagues/${l.id}.png` }));
const LEAGUE_IDS = new Set(LEAGUES.map((l) => l.id));
const MAIN_IDS = new Set(LEAGUES.filter((l) => l.type === 'main').map((l) => l.id));

/* ---------- Zaman ---------- */
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const today = (offset = 0) => dayFmt.format(Date.now() + offset * DAY);
function currentSeason() {
  const [y, m] = today().split('-').map(Number);
  return m >= 7 ? y : y - 1;
}

/* ---------- Hata ---------- */
function fail(kind, message) {
  return Object.assign(new Error(message), { kind });
}

/* ---------- Önbellek (bellek + disk) ---------- */
fs.mkdirSync(CACHE_DIR, { recursive: true });
const mem = new Map();
const inflight = new Map();
const fileOf = (key) => path.join(CACHE_DIR, crypto.createHash('sha1').update(key).digest('hex') + '.json');
function load(key) {
  if (mem.has(key)) return mem.get(key);
  try {
    const entry = JSON.parse(fs.readFileSync(fileOf(key), 'utf8'));
    mem.set(key, entry);
    return entry;
  } catch {
    return null;
  }
}
function save(key, data, ttl) {
  const entry = { exp: Date.now() + ttl, data };
  mem.set(key, entry);
  fs.promises.writeFile(fileOf(key), JSON.stringify(entry)).catch(() => {});
}
// Taze ise önbellekten döner; değilse üretir. Üretim başarısız olursa eski veriyi `stale` işaretiyle döner.
function cached(key, ttl, produce) {
  const entry = load(key);
  if (entry && Date.now() < entry.exp) return Promise.resolve(entry.data);
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const data = await produce();
      save(key, data, typeof ttl === 'function' ? ttl(data) : ttl);
      return data;
    } catch (err) {
      if (entry && err.kind !== 'plan') return { ...entry.data, stale: true };
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/* ---------- API-Football ---------- */
const state = { remaining: null, limitDay: null, plan: null, seasonCap: null };
{
  const saved = load('state');
  if (saved && Date.now() < saved.exp) Object.assign(state, saved.data);
}
let chain = Promise.resolve();
function api(pathAndQuery) {
  const run = () => apiNow(pathAndQuery);
  const p = chain.then(run, run); // istekleri sıraya koy: dakikalık limite takılmamak için
  chain = p.catch(() => {});
  return p;
}
async function apiNow(pathAndQuery) {
  if (!KEY) throw fail('config', 'Sunucuda API_FOOTBALL_KEY tanımlı değil.');
  let res;
  try {
    res = await fetch(UPSTREAM + pathAndQuery, {
      headers: { 'x-apisports-key': KEY },
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    throw fail('upstream', `API-Football'a ulaşılamadı: ${e.cause?.code || e.message}`);
  }
  const remaining = res.headers.get('x-ratelimit-requests-remaining');
  if (remaining != null) state.remaining = Number(remaining);
  if (!res.ok) throw fail('upstream', `API-Football HTTP ${res.status}`);
  const body = await res.json();
  const errs = Array.isArray(body.errors) ? Object.fromEntries(body.errors.map((e, i) => [i, e])) : body.errors || {};
  const first = Object.entries(errs)[0];
  if (first) {
    const [name, message] = first;
    const cap = /try from \d{4} to (\d{4})/.exec(String(message));
    if (name === 'plan' && cap) {
      state.seasonCap = Number(cap[1]);
      save('state', { seasonCap: state.seasonCap }, 6 * HOUR);
    }
    const kind = name === 'plan' ? 'plan' : name === 'rateLimit' || name === 'requests' ? 'quota' : 'upstream';
    throw fail(kind, String(message));
  }
  return body.response;
}

function getStatus() {
  return cached('status', MIN, async () => {
    const r = await api('status');
    state.plan = r.subscription?.plan ?? null;
    state.limitDay = r.requests?.limit_day ?? null;
    return { plan: state.plan, limitDay: state.limitDay, used: r.requests?.current ?? null };
  });
}
const isFree = () => (state.limitDay ?? 100) <= 100;
// Canlı veri yenileme aralığı. Ücretsiz planda günlük 100 isteği korumak için seyrek.
const liveTtl = () => (process.env.LIVE_TTL ? Number(process.env.LIVE_TTL) * 1000 : isFree() ? 10 * MIN : 30e3);
// Tarihe göre fikstür penceresi (bugüne göre gün). Ücretsiz plan yalnızca dün/bugün/yarın verir.
const dayWindow = () => (isFree() ? [-1, 1] : [-7, 14]);
const seasonAvailable = () => !(state.seasonCap && state.seasonCap < currentSeason());

// Güncel sezonu dener; plan izin vermiyorsa izin verilen son sezona düşer.
async function withSeason(call) {
  const cur = currentSeason();
  let season = state.seasonCap ? Math.min(cur, state.seasonCap) : cur;
  try {
    return { season, current: season === cur, data: await call(season) };
  } catch (e) {
    if (e.kind === 'plan' && state.seasonCap && state.seasonCap < season) {
      season = state.seasonCap;
      return { season, current: false, data: await call(season) };
    }
    throw e;
  }
}

/* ---------- Sadeleştirme ---------- */
const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']);
const DONE = new Set(['FT', 'AET', 'PEN']);
const OFF = new Set(['PST', 'CANC', 'ABD', 'AWD', 'WO']);
const ROUNDS = { 'Round of 16': 'Son 16', 'Quarter-finals': 'Çeyrek final', 'Semi-finals': 'Yarı final', Final: 'Final' };
function roundLabel(round = '') {
  const m = /^(Regular Season|League Stage) - (\d+)$/.exec(round);
  if (m) return `${m[2]}. hafta`;
  return ROUNDS[round] || round;
}

// Takım → ana lig eşlemesi; gördükçe öğrenilir, takım sayfasında puan durumunu bulmak için kullanılır.
const teamIndex = load('teams')?.data || {};
let indexDirty = false;
function learn(team, leagueId) {
  if (!team?.id || !MAIN_IDS.has(leagueId)) return;
  const known = teamIndex[team.id];
  if (known && known.lg === leagueId && known.name === team.name) return;
  teamIndex[team.id] = { name: team.name, lg: leagueId };
  indexDirty = true;
}
setInterval(() => {
  if (indexDirty) { indexDirty = false; save('teams', teamIndex, 3650 * DAY); }
}, 5000).unref();

// API bazı oyuncu adlarını çift kodlanmış UTF-8 olarak döndürüyor ("MimoviÄ\x87"); onar.
const fixText = (s) => (typeof s === 'string' && /[\u00C2-\u00C5][\u0080-\u00BF]/.test(s) ? Buffer.from(s, 'latin1').toString('utf8') : s);
const teamLogo = (id) => `https://media.api-sports.io/football/teams/${id}.png`;
const team = (t) => ({ id: t.id, name: t.name, logo: t.logo || teamLogo(t.id) });
function fx(f) {
  const short = f.fixture.status.short;
  const st = LIVE.has(short) ? 'live' : DONE.has(short) ? 'ft' : OFF.has(short) ? 'off' : 'ns';
  learn(f.teams.home, f.league.id);
  learn(f.teams.away, f.league.id);
  const pen = f.score?.penalty;
  return {
    id: f.fixture.id,
    lg: f.league.id,
    round: roundLabel(f.league.round),
    ts: f.fixture.timestamp,
    date: f.fixture.date.slice(0, 10),
    time: f.fixture.date.slice(11, 16),
    st,
    short,
    min: f.fixture.status.elapsed,
    extra: f.fixture.status.extra,
    h: team(f.teams.home),
    a: team(f.teams.away),
    s: f.goals.home == null ? null : [f.goals.home, f.goals.away],
    pen: pen && pen.home != null ? [pen.home, pen.away] : null,
  };
}
const byTime = (a, b) => a.ts - b.ts;
const anyLive = (list) => list.some((f) => f.st === 'live');

function event(e, homeId) {
  const type = e.type, detail = e.detail || '';
  let k = 'other', x = null;
  if (type === 'Goal') {
    if (detail === 'Missed Penalty') { k = 'miss'; x = 'Penaltı kaçtı'; }
    else {
      k = 'goal';
      x = detail === 'Own Goal' ? 'Kendi kalesine' : detail === 'Penalty' ? 'Penaltı' : e.assist?.name ? `Asist: ${e.assist.name}` : null;
    }
  } else if (type === 'Card') {
    k = detail.includes('Yellow') && !detail.includes('Second') ? 'y' : 'r';
    if (detail.includes('Second')) x = 'İkinci sarı';
  } else if (type === 'subst') {
    k = 'sub';
    return { min: e.time.elapsed, extra: e.time.extra, side: e.team.id === homeId ? 'h' : 'a', k, p: e.assist?.name || '', x: e.player?.name ? `Çıkan: ${e.player.name}` : null };
  } else if (type === 'Var') {
    k = 'var'; x = `VAR: ${detail}`;
  }
  return { min: e.time.elapsed, extra: e.time.extra, side: e.team.id === homeId ? 'h' : 'a', k, p: e.player?.name || '', x };
}
function lineup(l) {
  const player = (p) => {
    const [row, col] = (p.player.grid || '').split(':').map(Number);
    return { no: p.player.number, name: p.player.name, pos: p.player.pos, row: row || null, col: col || null };
  };
  const c = l.team.colors?.player;
  return {
    teamId: l.team.id,
    formation: l.formation,
    coach: l.coach?.name || null,
    color: c?.primary ? `#${c.primary}` : null,
    numColor: c?.number ? `#${c.number}` : null,
    xi: (l.startXI || []).map(player),
    subs: (l.substitutes || []).map(player),
  };
}
const STAT_LABELS = [
  ['Ball Possession', 'Topa sahip olma', '%'],
  ['expected_goals', 'Gol beklentisi (xG)', ''],
  ['Total Shots', 'Şut', ''],
  ['Shots on Goal', 'İsabetli şut', ''],
  ['Corner Kicks', 'Korner', ''],
  ['Fouls', 'Faul', ''],
  ['Offsides', 'Ofsayt', ''],
  ['Yellow Cards', 'Sarı kart', ''],
  ['Goalkeeper Saves', 'Kurtarış', ''],
  ['Passes %', 'Pas isabeti', '%'],
];
function stats(list, homeId) {
  const of = (side) => Object.fromEntries((side?.statistics || []).map((s) => [s.type, s.value]));
  const h = of(list.find((s) => s.team.id === homeId));
  const a = of(list.find((s) => s.team.id !== homeId));
  const num = (v) => (v == null ? 0 : Number.parseFloat(v) || 0);
  return STAT_LABELS.filter(([key]) => h[key] != null || a[key] != null).map(([key, label, unit]) => ({ label, unit, h: num(h[key]), a: num(a[key]) }));
}
function zone(description = '') {
  const d = (description || '').toLowerCase();
  if (d.includes('relegation')) return 'rel';
  if (d.includes('conference')) return 'ecl';
  if (d.includes('europa')) return 'el';
  if (d.includes('champions')) return 'cl';
  return null;
}

/* ---------- Veri ---------- */
function dayTtl(date, d) {
  if (anyLive(d.fixtures)) return liveTtl();
  const t = today();
  if (date < t) return date === today(-1) ? 6 * HOUR : 7 * DAY;
  if (date > t) return 6 * HOUR;
  const next = d.fixtures.filter((f) => f.st === 'ns').map((f) => f.ts * 1000).sort((a, b) => a - b)[0];
  if (!next) return 2 * HOUR;
  return Math.min(2 * HOUR, Math.max(liveTtl(), next - Date.now() + 2 * MIN));
}
function getDay(date) {
  return cached(`day:${date}`, (d) => dayTtl(date, d), async () => {
    const r = await api(`fixtures?date=${date}&timezone=${TZ}`);
    return { date, updated: Date.now(), fixtures: r.filter((f) => LEAGUE_IDS.has(f.league.id)).map(fx).sort(byTime) };
  });
}
// Plan sezon bazlı fikstüre izin vermediğinde: tarih penceresindeki günlerden derle.
async function windowFixtures(filter) {
  const [from, to] = dayWindow();
  const days = [];
  for (let o = from; o <= to; o++) days.push(getDay(today(o)).catch(() => null));
  return (await Promise.all(days)).flatMap((d) => (d ? d.fixtures.filter(filter) : [])).sort(byTime);
}
async function seasonFixtures(param, id) {
  if (!seasonAvailable()) return null;
  try {
    return await cached(`sfx:${param}:${id}`, (d) => (anyLive(d.fixtures) ? liveTtl() : 30 * MIN), async () => {
      const r = await api(`fixtures?${param}=${id}&season=${currentSeason()}&timezone=${TZ}`);
      return { updated: Date.now(), fixtures: r.map(fx).sort(byTime) };
    });
  } catch (e) {
    if (e.kind === 'plan') return null;
    throw e;
  }
}

function getMatch(id) {
  const ttl = (d) => {
    const f = d.fixture, age = Date.now() - f.ts * 1000;
    if (f.st === 'live') return liveTtl();
    if (f.st === 'ft') return age > 6 * HOUR ? 30 * DAY : 30 * MIN;
    return age > -90 * MIN ? Math.max(liveTtl(), 5 * MIN) : HOUR;
  };
  return cached(`match:${id}`, ttl, async () => {
    const r = await api(`fixtures?id=${id}&timezone=${TZ}`);
    const f = r[0];
    if (!f) throw fail('notfound', 'Maç bulunamadı.');
    const homeId = f.teams.home.id;
    return {
      updated: Date.now(),
      fixture: fx(f),
      venue: f.fixture.venue?.name || null,
      referee: f.fixture.referee || null,
      events: (f.events || []).map((e) => event(e, homeId)),
      lineups: (f.lineups || []).map(lineup),
      stats: stats(f.statistics || [], homeId),
    };
  });
}

function getStandings(lg) {
  return cached(`std:${lg}`, (d) => (d.current ? 30 * MIN : 12 * HOUR), async () => {
    const { season, current, data } = await withSeason((s) => api(`standings?league=${lg}&season=${s}`));
    const groups = (data[0]?.league?.standings || []).map((g) => ({
      name: g[0]?.group || '',
      rows: g.map((r) => {
        learn(r.team, lg);
        return {
          rank: r.rank, team: team(r.team), pts: r.points, gd: r.goalsDiff,
          p: r.all.played, w: r.all.win, d: r.all.draw, l: r.all.lose, gf: r.all.goals.for, ga: r.all.goals.against,
          form: (r.form || '').slice(-5), zone: zone(r.description),
        };
      }),
    }));
    return { league: lg, season, current, updated: Date.now(), groups };
  });
}

async function getLeagueFixtures(lg) {
  const full = await seasonFixtures('league', lg);
  if (!full) return { league: lg, limited: true, fixtures: await windowFixtures((f) => f.lg === lg) };
  const from = Date.now() / 1000 - 14 * 86400, to = Date.now() / 1000 + 28 * 86400;
  return { league: lg, limited: false, stale: full.stale, fixtures: full.fixtures.filter((f) => f.ts >= from && f.ts <= to) };
}

function getSquad(id) {
  return cached(`squad:${id}`, DAY, async () => {
    const r = await api(`players/squads?team=${id}`);
    const s = r[0];
    if (!s) throw fail('notfound', 'Kadro bulunamadı.');
    return {
      updated: Date.now(),
      team: team(s.team),
      players: s.players.map((p) => ({ id: p.id, name: fixText(p.name), age: p.age, no: p.number, pos: p.position })),
    };
  });
}

async function getTeam(id) {
  const full = await seasonFixtures('team', id);
  const fixtures = full ? full.fixtures : await windowFixtures((f) => f.h.id === id || f.a.id === id);
  const sample = fixtures.find((f) => f.h.id === id) || fixtures.find((f) => f.a.id === id);
  let info = sample ? (sample.h.id === id ? sample.h : sample.a) : null;
  if (!info && teamIndex[id]) info = { id, name: teamIndex[id].name, logo: teamLogo(id) };
  if (!info) info = (await getSquad(id).catch(() => null))?.team || { id, name: '', logo: teamLogo(id) };
  return { team: info, league: teamIndex[id]?.lg ?? null, limited: !full, fixtures };
}

function getTeams(lg) {
  return cached(`teams:${lg}`, (d) => (d.current ? 7 * DAY : 12 * HOUR), async () => {
    const { season, current, data } = await withSeason((s) => api(`teams?league=${lg}&season=${s}`));
    const teams = data.map((t) => team(t.team)).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    if (current) teams.forEach((t) => learn(t, lg));
    return { league: lg, season, current, updated: Date.now(), teams };
  });
}

async function getMeta() {
  const status = await getStatus().catch((e) => ({ error: e.message }));
  const [from, to] = dayWindow();
  return {
    ...status,
    remaining: state.remaining,
    today: today(),
    window: { from, to },
    season: currentSeason(),
    seasonAvailable: seasonAvailable(),
    liveTtl: liveTtl() / 1000,
    leagues: LEAGUES,
  };
}

/* ---------- HTTP ---------- */
const routes = [
  [/^\/api\/meta$/, () => getMeta()],
  [/^\/api\/fixtures$/, (m, q) => {
    const date = q.get('date') || today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail('bad', 'Geçersiz tarih.');
    return getDay(date);
  }],
  [/^\/api\/match\/(\d+)$/, (m) => getMatch(Number(m[1]))],
  [/^\/api\/standings\/(\d+)$/, (m) => getStandings(Number(m[1]))],
  [/^\/api\/league\/(\d+)\/fixtures$/, (m) => getLeagueFixtures(Number(m[1]))],
  [/^\/api\/league\/(\d+)\/teams$/, (m) => getTeams(Number(m[1]))],
  [/^\/api\/team\/(\d+)$/, (m) => getTeam(Number(m[1]))],
  [/^\/api\/team\/(\d+)\/squad$/, (m) => getSquad(Number(m[1]))],
];
const STATUS = { plan: 403, quota: 429, bad: 400, notfound: 404, config: 500 };

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
  if (url.pathname === '/') return send(200, { name: 'Tribün API', ok: true });
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
  console.log(`Tribün API http://localhost:${PORT}`);
  if (!KEY) console.warn('UYARI: API_FOOTBALL_KEY tanımlı değil. server/.env dosyasına ekleyin.');
  else getStatus().then((s) => console.log(`Plan: ${s.plan}, günlük limit: ${s.limitDay}, kullanılan: ${s.used}`), (e) => console.warn('Durum alınamadı:', e.message));
});
