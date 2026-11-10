// Highlightly Football API bağdaştırıcısı. Tüm yanıtları uygulamanın ortak biçimine çevirir.
// Belgesine göre maç ve olay verisi dakikada bir, istatistikler 5 dakikada bir, ilk 11'ler 15 dakikada bir yenilenir.
import { MIN, TZ, dayFmt, timeFmt, fail, pair, roundLabel } from '../lib/common.js';
import { Throttle } from '../lib/throttle.js';
import { fromCommon, toCommon } from '../lib/ids.js';
import { isSeniorMen } from '../lib/national.js';

// Kaynak bazı Türk takımlarını Türkçe karakter olmadan veriyor.
const TEAM_NAMES = {
  Besiktas: 'Beşiktaş', Fenerbahce: 'Fenerbahçe', Goztepe: 'Göztepe', Genclerbirligi: 'Gençlerbirliği',
  Kasimpasa: 'Kasımpaşa', Eyupspor: 'Eyüpspor', 'Istanbul Basaksehir': 'İstanbul Başakşehir', 'Erzurum BB': 'Erzurumspor FK',
  'Gazişehir Gaziantep': 'Gaziantep FK', 'Kocaelispor FK': 'Kocaelispor', 'Yeni Çorumspor': 'Çorum FK', Amed: 'Amedspor',
};
const LIVE = { 'First half': '1H', 'Half time': 'HT', 'Second half': '2H', 'Extra time': 'ET', 'Break time': 'BT', Penalties: 'P', Suspended: 'SUSP', Interrupted: 'INT', 'In progress': 'LIVE' };
const DONE = { Finished: 'FT', 'Finished after penalties': 'PEN', 'Finished after extra time': 'AET' };
const OFF = { Postponed: 'PST', Cancelled: 'CANC', Abandoned: 'ABD', Awarded: 'AWD' };
const POS = { Goalkeeper: 'G', Defender: 'D', Midfielder: 'M', Forward: 'F', Attacker: 'F' };

// Dışarıya verilen numaralar ortak numaralardır (bkz. lib/ids.js); kaynağın kendi numaraları yalnızca içeride kalır.
const teamLogo = (hlId) => `https://highlightly.net/soccer/images/teams/${hlId}.png`;
const team = (t) => ({ id: toCommon(t.id), name: TEAM_NAMES[t.name] || t.name, logo: t.logo || teamLogo(t.id) });

export function fx(m) {
  const desc = m.state?.description || '';
  const st = LIVE[desc] ? 'live' : DONE[desc] ? 'ft' : OFF[desc] ? 'off' : 'ns';
  const when = new Date(m.date);
  return {
    id: toCommon(m.id),
    lg: toCommon(m.league.id),
    lgName: m.league.name || null,
    lgLogo: m.league.logo || null,
    round: roundLabel(m.round),
    ts: Math.floor(when.getTime() / 1000),
    date: dayFmt.format(when),
    time: timeFmt.format(when),
    st,
    short: LIVE[desc] || DONE[desc] || OFF[desc] || 'NS',
    min: m.state?.clock ?? null,
    extra: null,
    h: team(m.homeTeam),
    a: team(m.awayTeam),
    s: pair(m.state?.score?.current),
    pen: pair(m.state?.score?.penalties),
  };
}

export function event(e, homeId) {
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

export function lineup(side) {
  if (!side?.initialLineup?.length) return null;
  const player = (p, row, col) => ({ id: p.id, no: p.number ?? null, name: p.name, pos: POS[p.position] || null, row, col });
  return {
    teamId: toCommon(side.id),
    formation: side.formation || null,
    coach: null,
    color: null,
    numColor: null,
    xi: side.initialLineup.flatMap((line, i) => line.map((p, j) => player(p, i + 1, j + 1))),
    subs: (side.substitutes || []).map((p) => player(p, null, null)),
  };
}

export function stats(list, homeId) {
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

export function createHighlightly({ key, baseUrl, fetchImpl = fetch } = {}) {
  const base = baseUrl || 'https://soccer.highlightly.net/';
  const state = { plan: null, limitDay: null, remaining: null };
  const throttle = new Throttle(60);
  // Aynı anda en çok 3 istek (hız sınırı ayrıca throttle'da): yavaş bir istek herkesi bekletmesin.
  let active = 0;
  const waiting = [];
  const provider = { id: 'highlightly', name: 'Highlightly', state, onState: null };

  async function api(pathAndQuery) {
    if (active >= 3) await new Promise((resolve) => waiting.push(resolve));
    active++;
    try { return await apiNow(pathAndQuery); } finally { active--; waiting.shift()?.(); }
  }
  async function apiNow(pathAndQuery) {
    if (!key) throw fail('config', 'Sunucuda HIGHLIGHTLY_KEY tanımlı değil.');
    await throttle.wait();
    let res;
    try {
      res = await fetchImpl(base + pathAndQuery, { headers: { 'x-rapidapi-key': key }, signal: AbortSignal.timeout(20000) });
    } catch (e) {
      throw fail('upstream', `Veri kaynağına ulaşılamadı: ${e.cause?.code || e.message}`);
    }
    const remaining = res.headers.get('x-ratelimit-requests-remaining');
    const limit = res.headers.get('x-ratelimit-requests-limit');
    if (remaining != null) state.remaining = Number(remaining);
    if (limit != null) state.limitDay = Number(limit);
    const body = await res.json().catch(() => null);
    if (body?.plan?.tier) state.plan = body.plan.tier;
    provider.onState?.();
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

  return Object.assign(provider, {
    leagueLogo: (id) => `https://highlightly.net/soccer/images/leagues/${fromCommon(id)}.png`,
    teamLogo: (id) => teamLogo(fromCommon(id)),
    configError: () => (key ? null : 'Sunucuda HIGHLIGHTLY_KEY tanımlı değil.'),
    // Canlı veriyi kaynak dakikada bir yeniler; ücretli planda daha sık sormak aynı yanıtı tekrar almaktır.
    liveTtl: (free) => (free ? 3 * MIN : MIN),

    async seasonFixtures(lg, season) {
      return (await apiAll(`matches?leagueId=${fromCommon(lg)}&season=${season}`)).map(fx);
    },
    // Bir günün tüm maçları (sayfa sayfa; katalogdaki liglere çekirdek süzer). Lig başına sezon çekmekten çok daha ucuzdur.
    async day(date) {
      return (await apiAll(`matches?date=${date}&timezone=${TZ}`)).map(fx);
    },
    // Başlamış ya da başlamak üzere olan maçların güncel hali. Lig ve güne göre gruplanır.
    async refresh(fixtures) {
      const groups = [...new Set(fixtures.map((f) => `${fromCommon(f.lg)}|${f.date}`))];
      const out = [];
      for (const g of groups) {
        const [lg, date] = g.split('|');
        const body = await api(`matches?leagueId=${lg}&date=${date}&timezone=${TZ}&limit=100`);
        out.push(...(body.data || []).map(fx));
      }
      return out;
    },
    async match(id) {
      const body = await api(`matches/${fromCommon(id)}`);
      const m = Array.isArray(body) ? body[0] : body;
      if (!m?.id) throw fail('notfound', 'Maç bulunamadı.');
      return {
        fixture: fx(m),
        venue: m.venue?.name || null,
        referee: m.referee?.name || null,
        events: (m.events || []).map((e) => event(e, m.homeTeam.id)),
        stats: stats(m.statistics || [], m.homeTeam.id),
      };
    },
    // İlk 11'ler ayrı bir istektir.
    async lineups(id) {
      const body = await api(`lineups/${fromCommon(id)}`);
      return [lineup(body?.homeTeam), lineup(body?.awayTeam)].filter(Boolean);
    },
    // Puan durumunda form ve Avrupa/küme düşme bölgesi bilgisi yoktur.
    async standings(lg, season) {
      const body = await api(`standings?leagueId=${fromCommon(lg)}&season=${season}`);
      return (body.groups || []).map((g) => ({
        name: g.name || '',
        rows: (g.standings || []).map((r) => {
          const all = r.total || {};
          return {
            rank: r.position, team: team(r.team), pts: r.points, gd: (all.scoredGoals ?? 0) - (all.receivedGoals ?? 0),
            p: all.games ?? 0, w: all.wins ?? 0, d: all.draws ?? 0, l: all.loses ?? 0, gf: all.scoredGoals ?? 0, ga: all.receivedGoals ?? 0,
            form: '', zone: null,
          };
        }).sort((x, y) => x.rank - y.rank),
      }));
    },
    // Takımın sezon boyunca oynadığı tüm maçlar (ev sahibi ve deplasman ayrı sorulur).
    async teamSeason(id, season) {
      const home = await apiAll(`matches?homeTeamId=${fromCommon(id)}&season=${season}`);
      const away = await apiAll(`matches?awayTeamId=${fromCommon(id)}&season=${season}`);
      return [...home, ...away].map(fx);
    },
    // Turnuvanın en güncel sezonu: kaynağın bildirdiği sezonlardan, bugünkü sezonu aşmayan en büyüğü.
    async seasonOf(lg, current) {
      const body = await api(`leagues/${fromCommon(lg)}`);
      const l = Array.isArray(body) ? body[0] : body;
      const seasons = (l?.seasons || []).map((x) => x.season).filter((y) => y <= current);
      return seasons.length ? Math.max(...seasons) : null;
    },
    // Tüm milli takımlar (İngilizce adlarıyla); kadın ve gençlik takımları çıkarılır.
    async nationalTeams() {
      const out = [];
      for (let offset = 0; ; offset += 500) {
        const body = await api(`teams?type=national&limit=500&offset=${offset}`);
        for (const t of body.data || []) if (isSeniorMen(t.name)) out.push({ id: toCommon(t.id), name: t.name, logo: t.logo || teamLogo(t.id) });
        const total = body.pagination?.totalCount ?? 0;
        if (offset + 500 >= total || !(body.data || []).length) return out;
      }
    },
    // Kaynakta kadro ucu yok; sunucu son maçın ilk 11'inden türetir.
    squad: null,
  });
}
