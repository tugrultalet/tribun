// Tribün API: Highlightly Football API anahtarını tutan, yanıtları sadeleştirip önbelleğe alan küçük sunucu.
// Bağımlılık yok; Node 20.12+ yeterli. Çalıştırma: `node index.js`
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(DIR, '.env')); } catch { /* .env isteğe bağlı */ }

const KEY = process.env.HIGHLIGHTLY_KEY;
const PORT = Number(process.env.PORT || 8787);
const TZ = 'Europe/Istanbul';
const UPSTREAM = process.env.HIGHLIGHTLY_URL || 'https://soccer.highlightly.net/';
const CACHE_DIR = process.env.CACHE_DIR || path.join(DIR, '.cache');
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;

// Lig kimlikleri Highlightly'nin kimlikleridir.
// `tv`: ligin 2026/27 sezonundaki Türkiye yayıncısı. Yayın hakları lig bazında satıldığı için elle tutulur;
// sezon başında güncellenmelidir. Maç bazında tam kanal (ör. beIN Sports 2) veri kaynağında yok.
const LEAGUES = [
  { id: 173537, name: 'Süper Lig', country: 'Türkiye', type: 'main', tv: 'beIN Sports' },
  { id: 33973, name: 'Premier League', country: 'İngiltere', type: 'main', tv: 'beIN Sports' },
  { id: 119924, name: 'La Liga', country: 'İspanya', type: 'main', tv: 'S Sport' },
  { id: 115669, name: 'Serie A', country: 'İtalya', type: 'main', tv: 'S Sport' },
  { id: 67162, name: 'Bundesliga', country: 'Almanya', type: 'main', tv: 'S Sport' },
  { id: 52695, name: 'Ligue 1', country: 'Fransa', type: 'main', tv: 'beIN Sports' },
  { id: 75672, name: 'Eredivisie', country: 'Hollanda', type: 'main', tv: 'S Sport' },
  { id: 80778, name: 'Primeira Liga', country: 'Portekiz', type: 'main', tv: 'S Sport' },
  { id: 2486, name: 'Şampiyonlar Ligi', country: 'UEFA', type: 'cup', tv: 'TRT' },
  { id: 3337, name: 'Avrupa Ligi', country: 'UEFA', type: 'cup', tv: 'TRT' },
  { id: 722432, name: 'Konferans Ligi', country: 'UEFA', type: 'cup', tv: 'TRT' },
].map((l) => ({ ...l, logo: `https://highlightly.net/soccer/images/leagues/${l.id}.png` }));
const LEAGUE_IDS = new Set(LEAGUES.map((l) => l.id));
const MAIN_IDS = new Set(LEAGUES.filter((l) => l.type === 'main').map((l) => l.id));

// Kaynak bazı Türk takımlarını Türkçe karakter olmadan veriyor.
const TEAM_NAMES = {
  Besiktas: 'Beşiktaş', Fenerbahce: 'Fenerbahçe', Goztepe: 'Göztepe', Genclerbirligi: 'Gençlerbirliği',
  Kasimpasa: 'Kasımpaşa', Eyupspor: 'Eyüpspor', 'Istanbul Basaksehir': 'İstanbul Başakşehir', 'Erzurum BB': 'Erzurumspor FK',
  'Gazişehir Gaziantep': 'Gaziantep FK', 'Kocaelispor FK': 'Kocaelispor', 'Yeni Çorumspor': 'Çorum FK', Amed: 'Amedspor',
};

/* ---------- Zaman ---------- */
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
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
function persist(key, entry) {
  mem.set(key, entry);
  fs.promises.writeFile(fileOf(key), JSON.stringify(entry)).catch(() => {});
}
const save = (key, data, ttl) => persist(key, { exp: Date.now() + ttl, data });
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
      if (entry) return { ...entry.data, stale: true };
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/* ---------- Highlightly ---------- */
const state = { remaining: null, limitDay: null, plan: null, ...(load('state')?.data || {}) };
let chain = Promise.resolve();
function api(pathAndQuery) {
  const run = () => apiNow(pathAndQuery);
  const p = chain.then(run, run); // istekleri sıraya koy
  chain = p.catch(() => {});
  return p;
}
async function apiNow(pathAndQuery) {
  if (!KEY) throw fail('config', 'Sunucuda HIGHLIGHTLY_KEY tanımlı değil.');
  let res;
  try {
    res = await fetch(UPSTREAM + pathAndQuery, { headers: { 'x-rapidapi-key': KEY }, signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw fail('upstream', `Veri kaynağına ulaşılamadı: ${e.cause?.code || e.message}`);
  }
  const remaining = res.headers.get('x-ratelimit-requests-remaining');
  const limit = res.headers.get('x-ratelimit-requests-limit');
  if (remaining != null) state.remaining = Number(remaining);
  if (limit != null) state.limitDay = Number(limit);
  const body = await res.json().catch(() => null);
  if (body?.plan?.tier) state.plan = body.plan.tier;
  save('state', state, 3650 * DAY);
  if (res.status === 429) throw fail('quota', 'Günlük istek limiti doldu.');
  if (res.status === 401 || res.status === 403) throw fail('config', 'Veri kaynağı anahtarı kabul etmedi.');
  if (!res.ok || body == null) throw fail('upstream', `Veri kaynağı HTTP ${res.status}${body?.message ? `: ${body.message}` : ''}`);
  return body;
}
// Sayfalı listelerin tamamını çeker (sayfa başına en çok 100 kayıt).
async function apiAll(pathAndQuery) {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const body = await api(`${pathAndQuery}&limit=100&offset=${offset}`);
    out.push(...(body.data || []));
    const total = body.pagination?.totalCount ?? out.length;
    if (out.length >= total || !(body.data || []).length) return out;
  }
}

const isFree = () => (state.limitDay ?? 100) <= 100;
// Canlı veri yenileme aralığı. Ücretsiz planda günlük 100 isteği korumak için seyrek.
const liveTtl = () => (process.env.LIVE_TTL ? Number(process.env.LIVE_TTL) * 1000 : isFree() ? 3 * MIN : 30e3);
const slowTtl = () => (isFree() ? 24 * HOUR : 6 * HOUR); // sezon fikstürü
const tableTtl = () => (isFree() ? 3 * HOUR : 15 * MIN);

/* ---------- Sadeleştirme ---------- */
const LIVE = { 'First half': '1H', 'Half time': 'HT', 'Second half': '2H', 'Extra time': 'ET', 'Break time': 'BT', Penalties: 'P', Suspended: 'SUSP', Interrupted: 'INT', 'In progress': 'LIVE' };
const DONE = { Finished: 'FT', 'Finished after penalties': 'PEN', 'Finished after extra time': 'AET' };
const OFF = { Postponed: 'PST', Cancelled: 'CANC', Abandoned: 'ABD', Awarded: 'AWD' };
const ROUNDS = { 'Round of 16': 'Son 16', 'Quarter-finals': 'Çeyrek final', 'Semi-finals': 'Yarı final', Final: 'Final' };
function roundLabel(round = '') {
  const m = /^(Regular Season|League Stage) - (\d+)$/.exec(round || '');
  if (m) return `${m[2]}. hafta`;
  return ROUNDS[round] || round || '';
}
const pair = (text) => {
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(text || '');
  return m ? [Number(m[1]), Number(m[2])] : null;
};

// Takım → ana lig eşlemesi; gördükçe öğrenilir, takım sayfasında puan durumunu bulmak için kullanılır.
const teamIndex = load('teams')?.data || {};
let indexDirty = false;
function learn(t, leagueId) {
  if (!t?.id || !MAIN_IDS.has(leagueId)) return;
  const known = teamIndex[t.id];
  if (known && known.lg === leagueId && known.name === t.name) return;
  teamIndex[t.id] = { name: t.name, lg: leagueId };
  indexDirty = true;
}
setInterval(() => {
  if (indexDirty) { indexDirty = false; save('teams', teamIndex, 3650 * DAY); }
}, 5000).unref();

const teamLogo = (id) => `https://highlightly.net/soccer/images/teams/${id}.png`;
const team = (t) => ({ id: t.id, name: TEAM_NAMES[t.name] || t.name, logo: t.logo || teamLogo(t.id) });
function fx(m) {
  const desc = m.state?.description || '';
  const st = LIVE[desc] ? 'live' : DONE[desc] ? 'ft' : OFF[desc] ? 'off' : 'ns';
  const when = new Date(m.date);
  const h = team(m.homeTeam), a = team(m.awayTeam);
  learn(h, m.league.id);
  learn(a, m.league.id);
  return {
    id: m.id,
    lg: m.league.id,
    round: roundLabel(m.round),
    ts: Math.floor(when.getTime() / 1000),
    date: dayFmt.format(when),
    time: timeFmt.format(when),
    st,
    short: LIVE[desc] || DONE[desc] || OFF[desc] || 'NS',
    min: m.state?.clock ?? null,
    extra: null,
    h,
    a,
    s: pair(m.state?.score?.current),
    pen: pair(m.state?.score?.penalties),
  };
}
const byTime = (a, b) => a.ts - b.ts;
// Önbellekteki kayda göre hâlâ sonuçlanmamış ama başlamış (ya da başlamak üzere) olması gereken maç.
const unsettled = (f) => (f.st === 'live' || f.st === 'ns') && f.ts * 1000 <= Date.now() + 5 * MIN && f.ts * 1000 > Date.now() - 2 * DAY;

function event(e, homeId) {
  const [min, extra] = String(e.time ?? '').split('+').map((n) => Number.parseInt(n, 10));
  const type = (e.type || '').toLowerCase();
  const base = { min: min || 0, extra: extra || null, side: e.team?.id === homeId ? 'h' : 'a' };
  if (type.includes('substitution')) return { ...base, k: 'sub', p: e.substituted || '', x: e.player ? `Çıkan: ${e.player}` : null };
  if (type.includes('yellow') && !type.includes('second')) return { ...base, k: 'y', p: e.player || '', x: null };
  if (type.includes('red') || type.includes('second yellow')) return { ...base, k: 'r', p: e.player || '', x: type.includes('second') ? 'İkinci sarı' : null };
  if (type.includes('missed')) return { ...base, k: 'miss', p: e.player || '', x: 'Penaltı kaçtı' };
  if (type.includes('var')) return { ...base, k: 'var', p: e.player || '', x: `VAR: ${e.type}` };
  if (type.includes('goal') || type.includes('penalty')) {
    const x = type.includes('own') ? 'Kendi kalesine' : type.includes('penalty') ? 'Penaltı' : e.assist ? `Asist: ${e.assist}` : null;
    return { ...base, k: 'goal', p: e.player || '', x };
  }
  return { ...base, k: 'other', p: e.player || '', x: e.type || null };
}
const POS = { Goalkeeper: 'G', Defender: 'D', Midfielder: 'M', Forward: 'F', Attacker: 'F' };
function lineup(side) {
  if (!side?.initialLineup?.length) return null;
  const player = (p, row, col) => ({ id: p.id, no: p.number ?? null, name: p.name, pos: POS[p.position] || null, row, col });
  return {
    teamId: side.id,
    formation: side.formation || null,
    coach: null,
    color: null,
    numColor: null,
    xi: side.initialLineup.flatMap((line, i) => line.map((p, j) => player(p, i + 1, j + 1))),
    subs: (side.substitutes || []).map((p) => player(p, null, null)),
  };
}
function stats(list, homeId) {
  const of = (side) => Object.fromEntries((side?.statistics || []).map((s) => [s.displayName, s.value]));
  const h = of(list.find((s) => s.team?.id === homeId));
  const a = of(list.find((s) => s.team?.id !== homeId));
  const num = (v) => (v == null ? 0 : Number(v) || 0);
  const pct = (v) => Math.round(num(v) * 100);
  const shots = (o) => num(o['Shots on target']) + num(o['Shots off target']) + num(o['Blocked shots']);
  const has = (key) => h[key] != null || a[key] != null;
  const row = (label, hv, av, unit = '') => ({ label, unit, h: hv, a: av });
  const out = [];
  if (has('Possession')) out.push(row('Topa sahip olma', pct(h.Possession), pct(a.Possession), '%'));
  if (has('Expected Goals')) out.push(row('Gol beklentisi (xG)', num(h['Expected Goals']), num(a['Expected Goals'])));
  if (has('Shots on target')) out.push(row('Şut', shots(h), shots(a)), row('İsabetli şut', num(h['Shots on target']), num(a['Shots on target'])));
  for (const [key, label] of [['Corners', 'Korner'], ['Fouls', 'Faul'], ['Offsides', 'Ofsayt'], ['Yellow cards', 'Sarı kart'], ['Goalkeeper saves', 'Kurtarış']]) {
    if (has(key)) out.push(row(label, num(h[key]), num(a[key])));
  }
  if (has('Total passes') && has('Successful passes')) {
    const acc = (o) => (num(o['Total passes']) ? Math.round((num(o['Successful passes']) / num(o['Total passes'])) * 100) : 0);
    out.push(row('Pas isabeti', acc(h), acc(a), '%'));
  }
  return out;
}

/* ---------- Veri ---------- */
// Bir ligin tüm sezon fikstürü. Günlük maç listeleri buradan süzülür; böylece tarih başına istek harcanmaz.
function getSeason(lg) {
  return cached(`season:${lg}`, slowTtl, async () => {
    const list = await apiAll(`matches?leagueId=${lg}&season=${currentSeason()}`);
    return { league: lg, updated: Date.now(), fixtures: list.map(fx).sort(byTime) };
  });
}
// Canlı ya da yeni bitmiş maçlar için ligin o günkü maçlarını tazeler ve sezon önbelleğine işler.
function refreshDay(lg, date) {
  return cached(`fresh:${lg}:${date}`, (d) => (d.fixtures.some(unsettled) ? liveTtl() : 6 * HOUR), async () => {
    const body = await api(`matches?leagueId=${lg}&date=${date}&timezone=${TZ}&limit=100`);
    const fixtures = (body.data || []).map(fx);
    const entry = load(`season:${lg}`);
    if (entry) {
      const fresh = new Map(fixtures.map((f) => [f.id, f]));
      const merged = entry.data.fixtures.map((f) => fresh.get(f.id) || f);
      for (const f of fixtures) if (!merged.some((x) => x.id === f.id)) merged.push(f);
      persist(`season:${lg}`, { exp: entry.exp, data: { ...entry.data, fixtures: merged.sort(byTime) } });
    }
    return { fixtures };
  });
}
async function leagueFixtures(lg, { from, to } = {}) {
  let season = await getSeason(lg);
  const dates = [...new Set(season.fixtures.filter(unsettled).map((f) => f.date))];
  if (dates.length) {
    await Promise.all(dates.map((d) => refreshDay(lg, d).catch(() => null)));
    season = load(`season:${lg}`)?.data || season;
  }
  return season.fixtures.filter((f) => (!from || f.date >= from) && (!to || f.date <= to));
}
// `teamIds`: takip edilen takımların, istenen liglerin dışında kalan maçlarını da ekler (ör. Avrupa kupaları).
async function getDay(date, leagueIds, teamIds = []) {
  const lists = await Promise.all(leagueIds.map((lg) => leagueFixtures(lg, { from: date, to: date }).catch((e) => ({ error: e }))));
  const failed = lists.find((l) => l.error);
  if (failed && lists.length && lists.every((l) => l.error)) throw failed.error;
  const fixtures = lists.flatMap((l) => (l.error ? [] : l));
  for (const id of teamIds) {
    const data = await getTeam(id).catch(() => null);
    for (let f of data?.fixtures || []) {
      if (f.date !== date || leagueIds.includes(f.lg) || fixtures.some((x) => x.id === f.id)) continue;
      if (unsettled(f)) f = (await refreshDay(f.lg, date).catch(() => null))?.fixtures.find((x) => x.id === f.id) || f;
      fixtures.push(f);
    }
  }
  return { date, stale: !!failed || undefined, fixtures: fixtures.sort(byTime) };
}

function getMatch(id) {
  const ttl = (d) => {
    const f = d.fixture, age = Date.now() - f.ts * 1000;
    if (f.st === 'live') return liveTtl();
    if (f.st === 'ft') return age > 6 * HOUR ? 30 * DAY : 30 * MIN;
    return age > -90 * MIN ? Math.max(liveTtl(), 5 * MIN) : 6 * HOUR;
  };
  return cached(`match:${id}`, ttl, async () => {
    const body = await api(`matches/${id}`);
    const m = Array.isArray(body) ? body[0] : body;
    if (!m?.id) throw fail('notfound', 'Maç bulunamadı.');
    return {
      updated: Date.now(),
      fixture: fx(m),
      venue: m.venue?.name || null,
      referee: m.referee?.name || null,
      events: (m.events || []).map((e) => event(e, m.homeTeam.id)),
      stats: stats(m.statistics || [], m.homeTeam.id),
    };
  });
}
// İlk 11'ler ayrı bir istektir; maç saatine yakın değilse boş döner ve istek harcanmaz.
async function getLineups(id) {
  const match = await getMatch(id);
  const f = match.fixture;
  if (f.st === 'off' || (f.st === 'ns' && f.ts * 1000 - Date.now() > 75 * MIN)) return { lineups: [] };
  return cached(`lineups:${id}`, (d) => (d.lineups.length ? (f.st === 'ft' ? 30 * DAY : HOUR) : 10 * MIN), async () => {
    const body = await api(`lineups/${id}`);
    return { updated: Date.now(), lineups: [lineup(body?.homeTeam), lineup(body?.awayTeam)].filter(Boolean) };
  });
}

function getStandings(lg) {
  return cached(`std:${lg}`, tableTtl, async () => {
    const season = currentSeason();
    const body = await api(`standings?leagueId=${lg}&season=${season}`);
    const groups = (body.groups || []).map((g) => ({
      name: g.name || '',
      rows: (g.standings || []).map((r) => {
        const t = team(r.team);
        learn(t, lg);
        const all = r.total || {};
        return {
          rank: r.position, team: t, pts: r.points, gd: (all.scoredGoals ?? 0) - (all.receivedGoals ?? 0),
          p: all.games ?? 0, w: all.wins ?? 0, d: all.draws ?? 0, l: all.loses ?? 0, gf: all.scoredGoals ?? 0, ga: all.receivedGoals ?? 0,
          form: '', zone: null,
        };
      }).sort((x, y) => x.rank - y.rank),
    }));
    return { league: lg, season, current: true, updated: Date.now(), groups };
  });
}

async function getLeagueFixtures(lg) {
  return { league: lg, limited: false, fixtures: await leagueFixtures(lg, { from: today(-14), to: today(28) }) };
}

// Takım listesi puan durumundan türetilir (kaynakta lige göre takım listesi yok).
async function getTeams(lg) {
  const table = await getStandings(lg);
  const seen = new Map();
  for (const g of table.groups) for (const r of g.rows) seen.set(r.team.id, r.team);
  return { league: lg, season: table.season, current: true, teams: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr')) };
}

function teamSeason(id) {
  return cached(`teamfx:${id}`, slowTtl, async () => {
    const season = currentSeason();
    const home = await apiAll(`matches?homeTeamId=${id}&season=${season}`);
    const away = await apiAll(`matches?awayTeamId=${id}&season=${season}`);
    const fixtures = [...home, ...away].filter((m) => LEAGUE_IDS.has(m.league?.id)).map(fx).sort(byTime);
    return { updated: Date.now(), fixtures };
  });
}
async function getTeam(id) {
  const base = await teamSeason(id);
  // Aynı maçın lig önbelleğindeki kaydı daha taze olabilir (canlı skor).
  const fixtures = base.fixtures.map((f) => load(`season:${f.lg}`)?.data.fixtures.find((x) => x.id === f.id) || f);
  const sample = fixtures.find((f) => f.h.id === id) || fixtures.find((f) => f.a.id === id);
  const info = sample ? (sample.h.id === id ? sample.h : sample.a) : { id, name: teamIndex[id]?.name || '', logo: teamLogo(id) };
  return { team: info, league: teamIndex[id]?.lg ?? null, limited: false, stale: base.stale, fixtures };
}
// Ana ekran: takip edilen takımların tüm maçları, tek listede. Başlamış ama sonuçlanmamış maçlar tazelenir.
async function getMine(teamIds) {
  const byId = new Map();
  for (const id of teamIds) {
    const data = await getTeam(id).catch(() => null);
    for (const f of data?.fixtures || []) byId.set(f.id, f);
  }
  const pending = [...byId.values()].filter(unsettled);
  const days = [...new Set(pending.map((f) => `${f.lg}|${f.date}`))];
  for (const key of days) {
    const [lg, date] = key.split('|');
    const fresh = await refreshDay(Number(lg), date).catch(() => null);
    for (const f of fresh?.fixtures || []) if (byId.has(f.id)) byId.set(f.id, f);
  }
  if (days.length) {
    // Tazelenen sonuçları takım önbelleğine de işle ki biten maç yeniden sorulmasın.
    for (const id of teamIds) {
      const entry = load(`teamfx:${id}`);
      if (entry) persist(`teamfx:${id}`, { exp: entry.exp, data: { ...entry.data, fixtures: entry.data.fixtures.map((f) => byId.get(f.id) || f) } });
    }
  }
  return { today: today(), fixtures: [...byId.values()].sort(byTime) };
}

// Kaynakta kadro ucu yok; takımın oynadığı son maçın ilk 11'i ve yedekleri gösterilir.
async function getSquad(id) {
  const { team: info, fixtures } = await getTeam(id);
  const last = fixtures.filter((f) => f.st === 'ft').pop();
  if (!last) return { team: info, players: [], from: null };
  const { lineups } = await getLineups(last.id);
  const lu = lineups.find((l) => l.teamId === id);
  const NAMES = { G: 'Goalkeeper', D: 'Defender', M: 'Midfielder', F: 'Attacker' };
  const players = lu ? [...lu.xi, ...lu.subs].map((p) => ({ id: p.id, name: p.name, age: null, no: p.no, pos: NAMES[p.pos] || 'Midfielder' })) : [];
  return { team: info, players, from: { date: last.date, rival: last.h.id === id ? last.a.name : last.h.name } };
}

function getMeta() {
  return {
    plan: state.plan,
    limitDay: state.limitDay,
    used: state.limitDay != null && state.remaining != null ? state.limitDay - state.remaining : null,
    remaining: state.remaining,
    error: KEY ? undefined : 'Sunucuda HIGHLIGHTLY_KEY tanımlı değil.',
    today: today(),
    window: { from: -7, to: 14 },
    season: currentSeason(),
    liveTtl: liveTtl() / 1000,
    leagues: LEAGUES,
  };
}

/* ---------- HTTP ---------- */
function leagueParam(q) {
  const raw = q.get('leagues');
  if (raw == null) return [...LEAGUE_IDS];
  return [...new Set(raw.split(',').map(Number).filter((id) => LEAGUE_IDS.has(id)))];
}
const teamParam = (q) => [...new Set((q.get('teams') || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 12);
const knownLeague = (m) => {
  const id = Number(m[1]);
  if (!LEAGUE_IDS.has(id)) throw fail('notfound', 'Bu lig desteklenmiyor.');
  return id;
};
const routes = [
  [/^\/api\/meta$/, () => getMeta()],
  [/^\/api\/fixtures$/, (m, q) => {
    const date = q.get('date') || today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail('bad', 'Geçersiz tarih.');
    return getDay(date, leagueParam(q), teamParam(q));
  }],
  [/^\/api\/mine$/, (m, q) => getMine(teamParam(q))],
  [/^\/api\/match\/(\d+)$/, (m) => getMatch(Number(m[1]))],
  [/^\/api\/match\/(\d+)\/lineups$/, (m) => getLineups(Number(m[1]))],
  [/^\/api\/standings\/(\d+)$/, (m) => getStandings(knownLeague(m))],
  [/^\/api\/league\/(\d+)\/fixtures$/, (m) => getLeagueFixtures(knownLeague(m))],
  [/^\/api\/league\/(\d+)\/teams$/, (m) => getTeams(knownLeague(m))],
  [/^\/api\/team\/(\d+)$/, (m) => getTeam(Number(m[1]))],
  [/^\/api\/team\/(\d+)\/squad$/, (m) => getSquad(Number(m[1]))],
];
const STATUS = { quota: 429, bad: 400, notfound: 404, config: 500 };

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
  if (!KEY) console.warn('UYARI: HIGHLIGHTLY_KEY tanımlı değil. server/.env dosyasına ekleyin.');
});
