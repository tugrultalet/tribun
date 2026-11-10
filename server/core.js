// Sunucunun çekirdeği: önbellek, canlı maç tazeleme ve uygulamanın kullandığı tüm veri işlemleri.
// Veri kaynağına özgü her şey `provider` bağdaştırıcısındadır; burası kaynaktan bağımsızdır.
import { CATALOG, DAY, HOUR, MIN, currentSeason, fail, today } from './lib/common.js';
import { createCache } from './lib/cache.js';
import { nationalName } from './lib/national.js';

const byTime = (a, b) => a.ts - b.ts;
// Önbelleğe göre hâlâ sonuçlanmamış ama başlamış (ya da başlamak üzere) olması gereken maç.
const unsettled = (f) => (f.st === 'live' || f.st === 'ns') && f.ts * 1000 <= Date.now() + 5 * MIN && f.ts * 1000 > Date.now() - 2 * DAY;

export function createCore({ provider, cacheDir }) {
  const { load, persist, save, cached, keys } = createCache(cacheDir);

  const leagues = CATALOG.map((c) => ({ id: c.id, key: c.key, name: c.name, country: c.country, type: c.type, tv: c.tv, logo: provider.leagueLogo(c.id) }));
  const leagueIds = new Set(leagues.map((l) => l.id));
  const MAIN_IDS = new Set(leagues.filter((l) => l.type === 'main').map((l) => l.id));

  // Kota durumu yeniden başlatmada kaybolmasın.
  if (provider.state.limitDay == null) Object.assign(provider.state, load('state')?.data || {});
  provider.onState = () => save('state', provider.state, 3650 * DAY);

  const isFree = () => (provider.state.limitDay ?? 100) <= 100;
  // Canlı veri yenileme aralığı. Ücretsiz planda günlük 100 isteği korumak için seyrek.
  const liveTtl = () => (process.env.LIVE_TTL ? Number(process.env.LIVE_TTL) * 1000 : provider.liveTtl(isFree()));
  const slowTtl = () => (isFree() ? 24 * HOUR : 6 * HOUR); // lig sezon fikstürü
  // Takım fikstürü her planda günde bir kez yenilenir: maç saati değişirse canlı yenileme zaten düzeltir. Takım başına 2 istek/gün.
  const teamTtl = () => 24 * HOUR;
  // Bir günün tüm maçları: geçmiş gün değişmez, bugün için sık yenilemeye gerek yok (canlı olanlar ayrıca tazelenir).
  const dayTtl = (date) => (date < today() ? 30 * DAY : date === today() ? 30 * MIN : 6 * HOUR);
  const tableTtl = () => (isFree() ? 3 * HOUR : 15 * MIN);

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
  // Milli takımların Türkçe adları (milli takım listesi yüklenince bilinir; önbellekte duruyorsa baştan bilinir).
  const nationalNames = new Map();
  const indexNational = (teams) => { for (const t of teams) nationalNames.set(t.id, t.name); };
  indexNational(load('national')?.data.teams || []);
  const localized = (t) => (nationalNames.has(t.id) ? { ...t, name: nationalNames.get(t.id) } : t);
  const norm = (list) => {
    for (const f of list) {
      f.h = localized(f.h);
      f.a = localized(f.a);
      learn(f.h, f.lg);
      learn(f.a, f.lg);
    }
    return list;
  };
  // Milli takım maçı içeren bir liste yüklenirken Türkçe adlar için milli takım listesi gerekir. Yoksa (örneğin önbellek
  // boşken) bir kez yüklenir; böylece adlar, takım seçici hiç açılmasa da Türkçe gelir.
  const intlIds = new Set(leagues.filter((l) => l.type === 'intl').map((l) => l.id));
  const isNationalFixture = (f) => intlIds.has(f.lg) || /^friendlies$/i.test(f.lgName || '');
  async function withNationalNames(list) {
    if (!nationalNames.size && list.some(isNationalFixture)) await getNational().catch(() => {});
    return norm(list);
  }
  // Kulüp hazırlık maçları takım ekranlarını doldurmasın; milli takım hazırlık maçları kalır.
  const keepFixture = (f) => !/^(friendlies clubs?|club friendlies)$/i.test(f.lgName || '');

  // Turnuvanın güncel sezonu. Ülke ligleri ve UEFA kupaları için takvim yılından bulunur; milli takım
  // turnuvalarında sezon yılı değişken olduğundan kaynağa sorulur.
  async function seasonFor(lg) {
    if (!provider.seasonOf || leagues.find((l) => l.id === lg)?.type !== 'intl') return currentSeason();
    const r = await cached(`seasonof:${lg}`, 12 * HOUR, async () => ({ season: await provider.seasonOf(lg, currentSeason()) }));
    return r.season ?? currentSeason();
  }

  /* ---------- Fikstür önbellekleri ---------- */
  // Bir ligin tüm sezon fikstürü. Günlük maç listeleri buradan süzülür; böylece tarih başına istek harcanmaz.
  function getSeason(lg) {
    touch(`season:${lg}`);
    return cached(`season:${lg}`, slowTtl, async () => ({
      league: lg, updated: Date.now(), fixtures: (await withNationalNames(await provider.seasonFixtures(lg, await seasonFor(lg)))).sort(byTime),
    }));
  }
  // Takımın katıldığı tüm yarışmalardaki sezon maçları (lig, kupalar, milli takımlarda turnuvalar ve hazırlıklar).
  function teamSeason(id) {
    touch(`teamfx:${id}`);
    return cached(`teamfx:${id}`, teamTtl, async () => ({
      updated: Date.now(),
      fixtures: (await withNationalNames((await provider.teamSeason(id, currentSeason())).filter(keepFixture))).sort(byTime),
    }));
  }

  // Başlamış ya da başlamak üzere olan, henüz sonuçlanmamış tüm maçları tek seferde tazeler ve
  // yüklü bütün fikstür önbelleklerine (lig ve takım) işler. `liveTtl`den sık istek göndermez.
  let lastRefresh = 0, refreshing = null, refreshError = null;
  // Canlı yenileme yalnızca son 24 saatte istenen önbellekler için yapılır; kimsenin bakmadığı takım ve ligler kota harcamaz.
  const seenAt = new Map();
  function touch(key) { seenAt.set(key, Date.now()); }
  const recent = (k) => Date.now() - (seenAt.get(k) || 0) < DAY;
  const fixtureCaches = () => [...keys('season:'), ...keys('teamfx:'), ...keys('day:')].filter(recent);
  function pendingFixtures() {
    const byId = new Map();
    for (const k of fixtureCaches()) for (const f of load(k)?.data.fixtures || []) if (unsettled(f)) byId.set(f.id, f);
    return [...byId.values()];
  }
  function refreshUnsettled() {
    if (refreshing) return refreshing;
    const pending = pendingFixtures();
    if (!pending.length || Date.now() - lastRefresh < liveTtl()) return Promise.resolve();
    lastRefresh = Date.now();
    refreshing = (async () => {
      try {
        const fresh = new Map(norm(await provider.refresh(pending)).map((f) => [f.id, f]));
        for (const k of fixtureCaches()) {
          const entry = load(k);
          if (!entry) continue;
          let changed = false;
          const fixtures = entry.data.fixtures.map((f) => {
            const n = fresh.get(f.id);
            if (!n) return f;
            changed = true;
            return n;
          });
          if (changed) persist(k, { exp: entry.exp, data: { ...entry.data, fixtures } });
        }
        refreshError = null;
      } catch (e) {
        refreshError = e.message; // eldeki veri gösterilmeye devam eder
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  /* ---------- Uygulamanın kullandığı işlemler ---------- */
  async function leagueFixtures(lg, { from, to } = {}) {
    await getSeason(lg);
    await refreshUnsettled();
    return (load(`season:${lg}`)?.data.fixtures || []).filter((f) => (!from || f.date >= from) && (!to || f.date <= to));
  }

  // Bir günün tüm maçları (katalogdaki ligler): kaynağın günlük listesiyle tek önbellekte tutulur.
  function dayAll(date) {
    touch(`day:${date}`);
    return cached(`day:${date}`, () => dayTtl(date), async () => {
      const list = (await provider.day(date)).filter((f) => leagueIds.has(f.lg) && keepFixture(f));
      return { date, updated: Date.now(), fixtures: (await withNationalNames(list)).sort(byTime) };
    });
  }

  // `teamIds`: takip edilen takımların, istenen liglerin dışında kalan maçlarını da ekler (ör. Avrupa kupaları).
  async function getDay(date, leagueList, teamIds = []) {
    // Tüm ligler istendiyse gün listesi tek seferde çekilir; lig başına sezon çekmek yüzlerce istek tutardı.
    if (provider.day && !teamIds.length && leagueList.length === leagues.length) {
      try {
        const base = await dayAll(date);
        await refreshUnsettled();
        return { date, fixtures: (load(`day:${date}`)?.data || base).fixtures };
      } catch { /* gün listesi alınamazsa lig lig yola düşülür */ }
    }
    const seasons = await Promise.all(leagueList.map((lg) => getSeason(lg).catch((error) => ({ error }))));
    const failed = seasons.find((s) => s.error);
    if (failed && seasons.length && seasons.every((s) => s.error)) throw failed.error;
    for (const id of teamIds) await teamSeason(id).catch(() => null);
    await refreshUnsettled();
    const byId = new Map();
    for (const lg of leagueList) for (const f of load(`season:${lg}`)?.data.fixtures || []) if (f.date === date) byId.set(f.id, f);
    for (const id of teamIds) for (const f of load(`teamfx:${id}`)?.data.fixtures || []) if (f.date === date && !byId.has(f.id)) byId.set(f.id, f);
    return { date, stale: !!failed || undefined, fixtures: [...byId.values()].sort(byTime) };
  }

  async function getTeam(id) {
    const base = await teamSeason(id);
    await refreshUnsettled();
    const fixtures = (load(`teamfx:${id}`)?.data || base).fixtures;
    const sample = fixtures.find((f) => f.h.id === id) || fixtures.find((f) => f.a.id === id);
    const info = sample ? (sample.h.id === id ? sample.h : sample.a) : { id, name: teamIndex[id]?.name || '', logo: provider.teamLogo?.(id) || '' };
    return { team: info, league: teamIndex[id]?.lg ?? null, limited: false, stale: base.stale, fixtures };
  }

  // Ana ekran: takip edilen takımların tüm maçları (katıldıkları bütün yarışmalarda). Hangi turnuvaların gösterileceği
  // istemcide süzülür; böylece takım fikstürü herkes için tek ortak önbellekten gelir. Lig takibi yoktur.
  async function getMine(teamIds) {
    let failures = 0, lastError = null;
    for (const id of teamIds) {
      try { await teamSeason(id); } catch (e) { failures++; lastError = e; }
    }
    const sources = teamIds.length;
    if (sources && failures === sources) throw lastError;
    await refreshUnsettled();
    const byId = new Map();
    for (const id of teamIds) for (const f of load(`teamfx:${id}`)?.data.fixtures || []) byId.set(f.id, f);
    return { today: today(), fixtures: [...byId.values()].sort(byTime) };
  }

  // Tüm milli takımlar, Türkçe adlarıyla (Türkiye başta). Haftada bir yenilenir.
  function getNational() {
    return cached('national', 7 * DAY, async () => {
      const seen = new Map();
      for (const t of await provider.nationalTeams()) if (!seen.has(t.id)) seen.set(t.id, { id: t.id, name: nationalName(t.name), logo: t.logo });
      const teams = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      const turkey = teams.findIndex((t) => t.id === 777);
      if (turkey > 0) teams.unshift(...teams.splice(turkey, 1));
      indexNational(teams);
      return { updated: Date.now(), teams };
    });
  }

  function getMatch(id) {
    const ttl = (d) => {
      const f = d.fixture, age = Date.now() - f.ts * 1000;
      if (f.st === 'live') return liveTtl();
      if (f.st === 'ft') return age > 6 * HOUR ? 30 * DAY : 30 * MIN;
      return age > -90 * MIN ? Math.max(liveTtl(), 5 * MIN) : 6 * HOUR;
    };
    return cached(`match:${id}`, ttl, async () => {
      const data = await provider.match(id);
      norm([data.fixture]);
      return { updated: Date.now(), ...data };
    });
  }
  // İlk 11'ler. Kaynak maçla birlikte veriyorsa ekstra istek gitmez; vermiyorsa ayrı sorulur ve maç saatine
  // yakın değilse hiç sorulmaz.
  async function getLineups(id) {
    const match = await getMatch(id);
    const f = match.fixture;
    if (f.st === 'off' || (f.st === 'ns' && f.ts * 1000 - Date.now() > 75 * MIN)) return { lineups: [] };
    if (match.lineups) return { lineups: match.lineups };
    return cached(`lineups:${id}`, (d) => (d.lineups.length ? (f.st === 'ft' ? 30 * DAY : HOUR) : 10 * MIN), async () => ({
      updated: Date.now(), lineups: await provider.lineups(id),
    }));
  }

  function getStandings(lg) {
    return cached(`std:${lg}`, tableTtl, async () => {
      const season = await seasonFor(lg);
      const groups = await provider.standings(lg, season);
      for (const g of groups) for (const r of g.rows) learn(r.team, lg);
      return { league: lg, season, current: true, updated: Date.now(), groups };
    });
  }

  async function getLeagueFixtures(lg) {
    return { league: lg, limited: false, fixtures: await leagueFixtures(lg, { from: today(-14), to: today(28) }) };
  }

  // Takım listesi puan durumundan türetilir.
  async function getTeams(lg) {
    const table = await getStandings(lg);
    const seen = new Map();
    for (const g of table.groups) for (const r of g.rows) seen.set(r.team.id, r.team);
    return { league: lg, season: table.season, current: true, teams: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr')) };
  }

  // Kaynak kadro veriyorsa onu, vermiyorsa takımın son maçının ilk 11'ini ve yedeklerini gösterir.
  async function getSquad(id) {
    if (provider.squad) return { ...(await cached(`squad:${id}`, DAY, () => provider.squad(id))), from: null };
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
    const s = provider.state;
    return {
      provider: provider.id,
      providerName: provider.name,
      plan: s.plan,
      limitDay: s.limitDay,
      used: s.limitDay != null && s.remaining != null ? s.limitDay - s.remaining : null,
      remaining: s.remaining,
      error: provider.configError() || refreshError || undefined,
      today: today(),
      window: { from: -7, to: 14 },
      season: currentSeason(),
      liveTtl: liveTtl() / 1000,
      leagues,
    };
  }

  // Biten maçların sonuçları (tahmin puanları için). Önce önbellekteki fikstürlere bakılır; bulunamayan maç için maç
  // önbelleği (biten maç 30 gün saklanır) kullanılır ve tek çağrıda en çok 8 maç kaynağa sorulur, kalanı sonraki çağrıya
  // kalır. Böylece bir sonuç herkes için yalnızca bir kez istek tutar.
  const slim = (f) => ({ id: f.id, st: f.st, s: f.s, ts: f.ts, date: f.date, lg: f.lg, h: { id: f.h.id, name: f.h.name }, a: { id: f.a.id, name: f.a.name } });
  async function getResults(ids) {
    const want = new Set(ids);
    const found = new Map();
    for (const k of [...keys('season:'), ...keys('teamfx:'), ...keys('day:')]) {
      for (const f of load(k)?.data.fixtures || []) if (want.has(f.id) && f.st === 'ft' && f.s) found.set(f.id, slim(f));
    }
    let asked = 0;
    for (const id of ids) {
      if (found.has(id) || asked >= 8) continue;
      asked++;
      try {
        const m = await getMatch(id);
        if (m.fixture.st === 'ft' && m.fixture.s) found.set(id, slim(m.fixture));
      } catch { /* sonuç şimdilik alınamadı; sonraki çağrıda yeniden denenir */ }
    }
    return { results: [...found.values()], pending: ids.filter((id) => !found.has(id)) };
  }

  return {
    leagueIds,
    results: getResults,
    meta: getMeta,
    day: getDay,
    mine: getMine,
    national: getNational,
    match: async (id) => { const { lineups, ...rest } = await getMatch(id); return rest; }, // ilk 11'ler ayrı uçtan gelir
    lineups: getLineups,
    standings: getStandings,
    leagueFixtures: getLeagueFixtures,
    teams: getTeams,
    team: getTeam,
    squad: getSquad,
  };
}
