// API-Football bağdaştırıcısı. Tüm yanıtları uygulamanın ortak biçimine çevirir.
//
// ÖNEMLİ: Ücretsiz planda dakikada 10 istek sınırı vardır ve aşılırsa hesap askıya alınabilir (bir kez oldu).
// Bu yüzden her istek `Throttle` ile sınırın altında tutulur, istekler tek tek gönderilir ve hesabın askıya
// alındığı bildirilirse bir saat boyunca hiç istek gönderilmez.
import { HOUR, MIN, TZ, dayFmt, timeFmt, fail, roundLabel, sleep } from '../lib/common.js';
import { Throttle } from '../lib/throttle.js';
import { isSeniorMen } from '../lib/national.js';

const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']);
const DONE = new Set(['FT', 'AET', 'PEN']);
const OFF = new Set(['PST', 'CANC', 'ABD', 'AWD', 'WO']);
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

const team = (t) => ({ id: t.id, name: t.name, logo: t.logo || `https://media.api-sports.io/football/teams/${t.id}.png` });

export function fx(f) {
  const short = f.fixture.status.short;
  const st = LIVE.has(short) ? 'live' : DONE.has(short) ? 'ft' : OFF.has(short) ? 'off' : 'ns';
  const when = new Date(f.fixture.timestamp * 1000);
  const pen = f.score?.penalty;
  return {
    id: f.fixture.id,
    lg: f.league.id,
    lgName: f.league.name || null,
    lgLogo: f.league.logo || null,
    round: roundLabel(f.league.round),
    ts: f.fixture.timestamp,
    date: dayFmt.format(when),
    time: timeFmt.format(when),
    st,
    short,
    min: f.fixture.status.elapsed ?? null,
    extra: f.fixture.status.extra ?? null,
    h: team(f.teams.home),
    a: team(f.teams.away),
    s: f.goals?.home == null ? null : [f.goals.home, f.goals.away],
    pen: pen && pen.home != null ? [pen.home, pen.away] : null,
  };
}

export function event(e, homeId) {
  const type = e.type, detail = e.detail || '';
  const base = { min: e.time?.elapsed ?? 0, extra: e.time?.extra ?? null, side: e.team?.id === homeId ? 'h' : 'a' };
  const p = e.player?.name || '';
  if (type === 'subst') return { ...base, k: 'sub', p: e.assist?.name || '', x: p ? `Çıkan: ${p}` : null };
  if (type === 'Card') {
    const second = detail.includes('Second');
    return { ...base, k: detail.includes('Yellow') && !second ? 'y' : 'r', p, x: second ? 'İkinci sarı' : null };
  }
  if (type === 'Goal') {
    if (detail === 'Missed Penalty') return { ...base, k: 'miss', p, x: 'Penaltı kaçtı' };
    const x = detail === 'Own Goal' ? 'Kendi kalesine' : detail === 'Penalty' ? 'Penaltı' : e.assist?.name ? `Asist: ${e.assist.name}` : null;
    return { ...base, k: 'goal', p, x };
  }
  if (type === 'Var') return { ...base, k: 'var', p, x: `VAR: ${detail}` };
  return { ...base, k: 'other', p, x: detail || null };
}

export function lineup(l) {
  const player = (p) => {
    const [row, col] = (p.player.grid || '').split(':').map(Number);
    return { id: p.player.id, no: p.player.number ?? null, name: p.player.name, pos: p.player.pos || null, row: row || null, col: col || null };
  };
  const c = l.team.colors?.player;
  return {
    teamId: l.team.id,
    formation: l.formation || null,
    coach: l.coach?.name || null,
    color: c?.primary ? `#${c.primary}` : null,
    numColor: c?.number ? `#${c.number}` : null,
    xi: (l.startXI || []).map(player),
    subs: (l.substitutes || []).map(player),
  };
}

export function stats(list, homeId) {
  const of = (side) => Object.fromEntries((side?.statistics || []).map((s) => [s.type, s.value]));
  const h = of(list.find((s) => s.team.id === homeId));
  const a = of(list.find((s) => s.team.id !== homeId));
  const num = (v) => (v == null ? 0 : Number.parseFloat(v) || 0);
  return STAT_LABELS.filter(([key]) => h[key] != null || a[key] != null).map(([key, label, unit]) => ({ label, unit, h: num(h[key]), a: num(a[key]) }));
}

export function zone(description = '') {
  const d = (description || '').toLowerCase();
  if (d.includes('relegation')) return 'rel';
  if (d.includes('conference')) return 'ecl';
  if (d.includes('europa')) return 'el';
  if (d.includes('champions')) return 'cl';
  return null;
}

// "U. Çakır" + ilk ad "Uğurcan" → "Uğurcan Çakır". İlk ad baş harfle uyuşmazsa ya da ad kısaltılmamışsa olduğu gibi kalır.
export function fullName(name, firstname) {
  const m = /^(\p{Lu})\.\s+(.+)$/u.exec(name || '');
  const given = (firstname || '').trim().split(/\s+/)[0];
  if (!m || !given || given[0].toLocaleUpperCase('tr') !== m[1].toLocaleUpperCase('tr')) return name;
  return `${given} ${m[2]}`;
}

export function createApiFootball({ key, baseUrl, fetchImpl = fetch, sleepImpl = sleep } = {}) {
  const base = baseUrl || 'https://v3.football.api-sports.io/';
  const state = { plan: null, limitDay: null, remaining: null };
  // Dakikalık limit yanıt başlığından öğrenilene kadar ücretsiz plan (10) varsayılır; iki istek pay bırakılır.
  const throttle = new Throttle(8);
  let chain = Promise.resolve();
  let hold = null; // { until, kind, message }: bu süre dolana kadar hiç istek gönderilmez
  let coolUntil = 0;
  const provider = { id: 'apifootball', name: 'API-Football', state, onState: null };

  // Kadro uç noktası adları kısaltılmış verir ("U. Çakır"); oyuncu uç noktasındaki ilk adla açılır. Sezon başına
  // en çok 3 sayfa (60 oyuncu); hata olursa kısaltılmış adlarla devam edilir.
  async function firstNames(teamId) {
    const out = new Map();
    const now = new Date();
    const season = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    try {
      for (let page = 1; page <= 3; page++) {
        const rows = await request(`players?team=${teamId}&season=${season}&page=${page}`);
        if (!Array.isArray(rows)) break;
        for (const r of rows) if (r?.player?.id && r.player.firstname) out.set(r.player.id, r.player.firstname);
        if (rows.length < 20) break;
      }
    } catch { /* kısaltılmış adlar kalır */ }
    return out;
  }

  function request(pathAndQuery) {
    const run = () => requestNow(pathAndQuery);
    const p = chain.then(run, run); // istekler tek tek ve sıraya girerek gider
    chain = p.catch(() => {});
    return p;
  }
  async function requestNow(pathAndQuery) {
    if (!key) throw fail('config', 'Sunucuda API_FOOTBALL_KEY tanımlı değil.');
    if (hold && Date.now() < hold.until) throw fail(hold.kind, hold.message);
    if (state.remaining != null && state.remaining <= 2 && pathAndQuery !== 'status') throw fail('quota', 'API-Football günlük istek limiti doldu.');
    if (coolUntil > Date.now()) await sleepImpl(coolUntil - Date.now());
    await throttle.wait();
    let res;
    try {
      res = await fetchImpl(base + pathAndQuery, { headers: { 'x-apisports-key': key }, signal: AbortSignal.timeout(20000) });
    } catch (e) {
      throw fail('upstream', `API-Football'a ulaşılamadı: ${e.cause?.code || e.message}`);
    }
    const perMinute = Number(res.headers.get('x-ratelimit-limit'));
    if (perMinute > 0) throttle.setLimit(perMinute - 2);
    const perMinuteLeft = res.headers.get('x-ratelimit-remaining');
    if (perMinuteLeft != null && Number(perMinuteLeft) <= 1) coolUntil = Date.now() + 15e3;
    const dayLeft = res.headers.get('x-ratelimit-requests-remaining');
    const dayLimit = res.headers.get('x-ratelimit-requests-limit');
    if (dayLeft != null) state.remaining = Number(dayLeft);
    if (dayLimit != null) state.limitDay = Number(dayLimit);
    provider.onState?.();

    const body = await res.json().catch(() => null);
    if (res.status === 429) {
      hold = { until: Date.now() + MIN, kind: 'quota', message: 'API-Football istek sınırına takıldı; bir dakika beklenecek.' };
      throw fail(hold.kind, hold.message);
    }
    if (!res.ok || body == null) throw fail('upstream', `API-Football HTTP ${res.status}`);
    const errors = Array.isArray(body.errors) ? Object.fromEntries(body.errors.map((e, i) => [i, e])) : body.errors || {};
    const [name, message] = Object.entries(errors)[0] || [];
    if (name) {
      if (name === 'access') {
        hold = { until: Date.now() + HOUR, kind: 'blocked', message: 'API-Football hesabı askıya alınmış. Hesap açılana kadar istek gönderilmeyecek.' };
        throw fail(hold.kind, hold.message);
      }
      if (name === 'token') throw fail('config', 'API-Football anahtarı geçersiz ya da eksik.');
      if (name === 'plan') throw fail('plan', `Bu veri API-Football planında kapalı: ${message}`);
      if (name === 'rateLimit' || name === 'requests') {
        hold = { until: Date.now() + (name === 'rateLimit' ? MIN : 15 * MIN), kind: 'quota', message: `API-Football limiti doldu: ${message}` };
        throw fail(hold.kind, hold.message);
      }
      throw fail('upstream', String(message));
    }
    return body.response;
  }

  return Object.assign(provider, {
    leagueLogo: (id) => `https://media.api-sports.io/football/leagues/${id}.png`,
    teamLogo: (id) => `https://media.api-sports.io/football/teams/${id}.png`,
    configError: () => (key ? null : 'Sunucuda API_FOOTBALL_KEY tanımlı değil.'),
    // Kaynak canlı veriyi 15 saniyede bir yeniler; belgesi canlı maç için dakikada bir sorgu önerir.
    liveTtl: (free) => (free ? 3 * MIN : 15e3),

    // Hesap durumu. Günlük kotadan düşmez.
    async status() {
      const r = await request('status');
      state.plan = r.subscription?.plan ?? null;
      state.limitDay = r.requests?.limit_day ?? null;
      if (state.limitDay != null && r.requests?.current != null) state.remaining = state.limitDay - r.requests.current;
      provider.onState?.();
      return { plan: state.plan, active: r.subscription?.active !== false };
    },
    async seasonFixtures(lg, season) {
      return (await request(`fixtures?league=${lg}&season=${season}&timezone=${TZ}`)).map(fx);
    },
    // Bir günün dünya genelindeki tüm maçları tek istekte (katalogdaki liglere çekirdek süzer).
    async day(date) {
      return (await request(`fixtures?date=${date}&timezone=${TZ}`)).map(fx);
    },
    // Tek istekte en çok 20 maç sorulabilir; kaç lig olursa olsun canlı maçlar birlikte gelir.
    async refresh(fixtures) {
      const ids = [...new Set(fixtures.map((f) => f.id))];
      const out = [];
      for (let i = 0; i < ids.length; i += 20) {
        out.push(...(await request(`fixtures?ids=${ids.slice(i, i + 20).join('-')}&timezone=${TZ}`)).map(fx));
      }
      return out;
    },
    // Olaylar, ilk 11'ler ve istatistikler maçla birlikte tek istekte gelir.
    async match(id) {
      const f = (await request(`fixtures?id=${id}&timezone=${TZ}`))[0];
      if (!f) throw fail('notfound', 'Maç bulunamadı.');
      const homeId = f.teams.home.id;
      return {
        fixture: fx(f),
        venue: f.fixture.venue?.name || null,
        referee: f.fixture.referee || null,
        events: (f.events || []).map((e) => event(e, homeId)),
        stats: stats(f.statistics || [], homeId),
        lineups: (f.lineups || []).map(lineup),
      };
    },
    async standings(lg, season) {
      const r = await request(`standings?league=${lg}&season=${season}`);
      return (r[0]?.league?.standings || []).map((g) => ({
        name: g[0]?.group || '',
        rows: g.map((x) => ({
          rank: x.rank, team: team(x.team), pts: x.points, gd: x.goalsDiff,
          p: x.all.played, w: x.all.win, d: x.all.draw, l: x.all.lose, gf: x.all.goals.for, ga: x.all.goals.against,
          form: (x.form || '').slice(-5), zone: zone(x.description),
        })),
      }));
    },
    // Takımın tüm yarışmalardaki sezon maçları tek istekte gelir.
    async teamSeason(id, season) {
      return (await request(`fixtures?team=${id}&season=${season}&timezone=${TZ}`)).map(fx);
    },
    // Turnuvanın en güncel sezonu (milli takım turnuvalarında sezon yılı değişkendir).
    async seasonOf(lg) {
      const current = (await request(`leagues?id=${lg}&current=true`))[0]?.seasons?.[0]?.year;
      if (current) return current;
      const years = ((await request(`leagues?id=${lg}`))[0]?.seasons || []).map((x) => x.year);
      return years.length ? Math.max(...years) : null;
    },
    // Milli takımlar: Dünya Kupası, Avrupa Şampiyonası ve Uluslar Ligi katılımcılarının birleşimi (tek istekte lig başına).
    async nationalTeams() {
      const seen = new Map();
      for (const [league, season] of [[1, 2026], [5, 2024], [4, 2024]]) {
        for (const x of await request(`teams?league=${league}&season=${season}`)) {
          if (x.team.national && isSeniorMen(x.team.name) && !seen.has(x.team.id)) seen.set(x.team.id, team(x.team));
        }
      }
      return [...seen.values()];
    },
    async squad(id) {
      const s = (await request(`players/squads?team=${id}`))[0];
      if (!s) throw fail('notfound', 'Kadro bulunamadı.');
      const first = await firstNames(id);
      return { team: team(s.team), players: s.players.map((p) => ({ id: p.id, name: fullName(p.name, first.get(p.id)), age: p.age ?? null, no: p.number ?? null, pos: p.position })) };
    },
  });
}
