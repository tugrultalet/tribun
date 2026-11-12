import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Fixture, Match, Mine, useApi } from '../api';
import { autoStartAvailable, followOnLockScreen, liveMatches, liveSupported, saveWidget, stopFollowing, syncAutoStart, widgetSnapshot, type WidgetRank } from '../live';
import { dayLabel, daysBetween } from '../dates';
import { euroIds, followedFixtures } from '../follow';
import { useMyPicks } from '../game/hooks';
import { inScope, scopeLeagues, scopeTeams, useLeagueFixtures } from '../groups/scope';
import { sameWeek } from '../groups/standings';
import { useNav } from '../nav';
import { Group, rpc, useRpc } from '../social';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Button, Card, Crest, Empty, GAP, Icon, LiveDot, Loader, RedCard, MatchList, RowNote, Seg, statusText } from '../ui';
import { resolveTeam } from '../healTeams';
import { useAppActive } from '../appState';
import { firebaseAvailable } from '../fb';
import { useRemote } from '../remoteConfig';
import { Screen } from './Screen';

// Bir takımın sezon boyunca tüm yarışmalardaki maçları rahatça sığar.
const UPCOMING_LIMIT = 100;
const RESULTS_LIMIT = 10;
const GROUP_WINDOW_DAYS = 7;
// Yenileme aralığı: canlı ya da 2 saat içinde başlayacak maç varken 1 dk, yoksa 5 dk.
const FAST_MS = 60000, SLOW_MS = 5 * 60000;
const hot = (fixtures: Fixture[] | undefined) => !!fixtures?.some((f) => f.st === 'live' || (f.st === 'ns' && f.ts * 1000 - Date.now() < 2 * 3600000 && f.ts * 1000 > Date.now() - 3 * 3600000));

type Status = { group_id: string; match_id: number; entered: number; h: number | null; a: number | null };

// Ana ekranın tek kuralı: "takımlarımın seçili turnuvalardaki maçları + gruplarımın tahmin maçları".
// Grup maçlarının üstünde küçük bir etiket durur ("Hoppa · 3/5 girdi · tahminin 2–1" ya da "Hoppa · tahmin bekliyor").
// "Tüm maçlar" filtresi o günün bütün maçlarını gösterir.
export default function Home() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const secret = store.me?.secret;
  const active = useAppActive();
  const euro = useMemo(() => euroIds(store.meta.leagues), [store.meta.leagues]);
  const groupsRaw = useRpc<Group[]>('my_groups', secret ? { p_secret: secret } : null, SLOW_MS).data;
  const groups = Array.isArray(groupsRaw) ? groupsRaw : [];

  // Takip edilen takımlara, takip edilmeyen grup takımları da eklenir (grup maçları ana ekranda görünsün).
  const teamIds = [...new Set([...store.teams.map((x) => x.id), ...groups.flatMap((g) => scopeTeams(g) ?? [])])];
  const query = scope === 'mine' && teamIds.length ? `/api/mine?teams=${teamIds.join(',')}` : null;
  const [fast, setFast] = useState(true);
  const state = useApi<Mine>(query, fast ? FAST_MS : SLOW_MS, true);
  useEffect(() => { if (state.data) setFast(hot(state.data.fixtures)); }, [state.data]);
  const day = useApi<{ date: string; fixtures: Fixture[] }>(scope === 'all' ? `/api/fixtures?date=${store.meta.today}` : null, fast ? FAST_MS : SLOW_MS);
  const openMatch = (f: Fixture) => nav.navigate('Match', { id: f.id });

  // Hiç maçı gelmeyen takip (numarası sunucuyla eşleşmiyor) adından yeniden eşleştirilir; her takım oturumda bir kez denenir.
  const tried = React.useRef(new Set<number>());
  useEffect(() => {
    const data = state.data;
    if (!data || state.loading) return;
    const have = new Set(data.fixtures.flatMap((f) => [f.h.id, f.a.id]));
    const orphans = store.teams.filter((x) => !have.has(x.id) && !tried.current.has(x.id));
    if (!orphans.length) return;
    orphans.forEach((x) => tried.current.add(x.id));
    (async () => {
      for (const x of orphans) {
        const found = await resolveTeam(x, store.meta.leagues);
        if (found && found.id !== x.id) store.replaceTeam(x.id, found);
      }
    })();
  }, [state.data, state.loading]);

  // Ana takımın canlı / sıradaki maçı: ana ekran widget'ının verisi ve (Ayarlar'da açıksa) kilit ekranında otomatik canlı skor.
  const ranks = useRpc<WidgetRank[]>('my_group_ranks', secret ? { p_secret: secret } : null, SLOW_MS).data;
  const autoStarted = React.useRef(new Set<number>());
  useEffect(() => {
    const main = store.main;
    if (!main || !state.data) return;
    const own = state.data.fixtures.filter((f) => f.h.id === main || f.a.id === main).sort((a, b) => a.ts - b.ts);
    const next = own.find((f) => f.st === 'live') ?? own.find((f) => f.st === 'ns');
    saveWidget(widgetSnapshot(next, next ? store.league(next.lg)?.name ?? '' : '', Array.isArray(ranks) ? ranks[0] : undefined));
    // Kilit ekranında otomatik canlı skor: takip edilen ve Ayarlar'da kapatılmamış takımların canlı ya da 1 saat içinde
    // başlayacak maçları (aynı anda en çok 2; iOS'ta açık etkinlik sayısı sınırlı).
    if (!liveSupported()) return;
    const followed = new Set(store.teams.map((x) => x.id));
    // Uygulama kapalıyken de açılsın: maçlar sunucuya kaydedilir, sunucu 1 saat kala başlatır (push-to-start).
    const mineFx = state.data.fixtures.filter((f) => [f.h.id, f.a.id].some((id) => followed.has(id) && store.liveFor(id)));
    syncAutoStart(store.liveOn === false ? [] : mineFx, (lg) => store.league(lg)?.name ?? '');
    const wanted = state.data.fixtures
      // Sunucu 1 saat kala başlatıyorsa uygulama ilk 5 dakikayı ona bırakır (aynı maç için iki kart açılmasın).
      .filter((f) => (f.st === 'live' || (f.st === 'ns' && f.ts * 1000 - Date.now() < (autoStartAvailable() ? 55 : 60) * 60000 && f.ts * 1000 > Date.now() - 3 * 3600000)))
      .filter((f) => [f.h.id, f.a.id].some((id) => followed.has(id) && store.liveFor(id)))
      .sort((a, b) => a.ts - b.ts);
    // Ayarlar'dan kapatılan takımın kendiliğinden açılmış kartı kapanır.
    for (const f of state.data.fixtures) {
      if (autoStarted.current.has(f.id) && liveMatches().includes(f.id) && !wanted.some((w) => w.id === f.id)
          && ![f.h.id, f.a.id].some((id) => followed.has(id) && store.liveFor(id))) {
        autoStarted.current.delete(f.id);
        stopFollowing(f.id).catch(() => {});
      }
    }
    const active = liveMatches();
    for (const f of wanted) {
      if (active.length >= 2) break;
      if (active.includes(f.id) || autoStarted.current.has(f.id)) continue;
      autoStarted.current.add(f.id);
      active.push(f.id);
      followOnLockScreen(f, store.league(f.lg)?.name ?? '', null).catch(() => {});
    }
  }, [state.data, ranks, store.main, store.liveOn, store.teams]);

  // Turnuva kapsamlı gruplar ve "tüm maçlarını takip et" turnuvaları için turnuva fikstürleri (sunucu önbelleğinden).
  const full = store.full ?? [];
  const leagueIds = useMemo(() => [...new Set([...groups.flatMap((g) => scopeLeagues(g) ?? []), ...full])], [groups, full]);
  const leagueFx = useLeagueFixtures(scope === 'mine' ? leagueIds : [], fast ? FAST_MS : SLOW_MS);
  const teamFx = state.data?.fixtures ?? [];

  // Grup maçları: grubun kapsamındaki, bugünden bir hafta içindeki başlamamış / canlı maçlar (takım ya da turnuva kapsamı).
  const candidates = useMemo(() => {
    const seen = new Set<number>();
    return [...teamFx, ...(leagueFx.data ?? [])].filter((f) => {
      if (seen.has(f.id)) return false;
      seen.add(f.id);
      const n = daysBetween(store.meta.today, f.date);
      return (f.st === 'ns' || f.st === 'live') && n <= GROUP_WINDOW_DAYS && (n >= 0 || sameWeek(f.date, store.meta.today)) && groups.some((g) => inScope(g, f));
    });
  }, [groups, teamFx, leagueFx.data, store.meta.today]);
  const matchKey = candidates.map((f) => f.id).join(',');
  const [status, setStatus] = useState<Status[]>([]);
  useEffect(() => {
    if (!secret || !candidates.length) { setStatus([]); return; }
    let alive = true;
    const load = () => rpc<Status[]>('group_prediction_status', { p_secret: secret, p_matches: candidates.map((f) => f.id).slice(0, 200) }).then((r) => alive && setStatus(Array.isArray(r) ? r : []), () => {});
    load();
    if (!active) return () => { alive = false; };
    const timer = setInterval(load, fast ? FAST_MS : SLOW_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [secret, matchKey, active, fast]);

  const notes = useMemo(() => {
    const out = new Map<number, RowNote>();
    for (const f of candidates) {
      const items = groups.filter((g) => inScope(g, f)).map((g) => {
        const row = status.find((x) => x.group_id === g.id && x.match_id === f.id);
        const mine = row && row.h != null && row.a != null ? `${row.h}–${row.a}` : null;
        const wait = !mine && f.st === 'ns';
        const text = mine ? `${g.name} · ${row!.entered}/${g.members} girdi · tahminin ${mine}` : wait ? `${g.name} · tahmin bekliyor` : `${g.name} · ${row?.entered ?? 0}/${g.members} girdi`;
        return { text, wait };
      });
      if (!items.length) continue;
      const first = items.find((i) => i.wait) ?? items[0];
      out.set(f.id, { wait: first.wait, text: items.length > 1 ? `${first.text} · +${items.length - 1} tribün` : first.text });
    }
    return out;
  }, [candidates, groups, status]);

  // Gösterilecekler: takip edilen takımların seçili turnuva maçları + "tüm maçlarını takip et" turnuvalarının yakın maçları
  // + takip edilmeyen ama grubun tahmin edeceği maçlar.
  const shown = useMemo(() => {
    const mine = followedFixtures(teamFx, store.teams, store.main, euro);
    const from = store.meta.today, soon = (f: Fixture) => daysBetween(from, f.date) >= -3 && daysBetween(from, f.date) <= 14;
    const fullFx = (leagueFx.data ?? []).filter((f) => full.includes(f.lg) && soon(f));
    const ids = new Set<number>();
    const out: Fixture[] = [];
    for (const f of [...mine, ...fullFx, ...candidates]) if (!ids.has(f.id)) { ids.add(f.id); out.push(f); }
    return out.sort((x, y) => x.ts - y.ts);
  }, [teamFx, leagueFx.data, store.teams, store.main, store.meta.today, euro, candidates, full]);

  // Grup etiketi olmayan maçlarda kendi tahminim gösterilir (takip edilmeyen takım olsa da, her maça tahmin girilebilir).
  const myPicksRaw = useMyPicks(SLOW_MS).data;
  // Beklenmeyen bir yanıt (dizi olmayan) ana ekranı çökertmesin.
  const myPicks = Array.isArray(myPicksRaw) ? myPicksRaw : undefined;
  const displayNotes = useMemo(() => {
    const out = new Map(notes);
    const byId = new Map((myPicks ?? []).map((p) => [p.match_id, p]));
    for (const f of [...shown, ...(day.data?.fixtures ?? [])]) {
      const p = byId.get(f.id);
      if (p && !out.has(f.id) && (f.st === 'ns' || f.st === 'live')) out.set(f.id, { wait: false, text: `Tahminin ${p.h}–${p.a}` });
    }
    return out;
  }, [notes, shown, myPicks, day.data]);

  const addButton = (
    <Pressable onPress={() => nav.navigate('Picker')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Takım ekle" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
      <Icon.plus color={t.accent} />
    </Pressable>
  );
  const filter = <View style={{ marginTop: 4 }}><Seg value={scope} onChange={setScope} options={[['mine', 'Takımlarım'], ['all', 'Tüm maçlar']]} /></View>;
  // Uzak ayarlardan gelen bakım/duyuru bandı ve (bir kez) ana takım bildirim izni kartı.
  const rc = useRemote();
  const bannerText = rc.maintenance || rc.announcement;
  const banner = bannerText ? (
    <Card style={{ marginTop: GAP, padding: 14, borderColor: rc.maintenance ? t.live : t.line }}>
      <Text style={{ fontSize: 14, lineHeight: 20, color: t.fg }}>{bannerText}</Text>
    </Card>
  ) : null;
  const askNotify = firebaseAvailable() && store.notify === undefined && store.mainTeam ? (
    <Card style={{ marginTop: GAP, padding: 14, gap: 10 }}>
      <Text style={{ fontSize: 14, lineHeight: 20, color: t.fg }}>{store.mainTeam.name} maçlarında gol, maç başlangıcı ve maç sonucunu bildirelim mi?</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Button label="Bildirimleri aç" onPress={() => { store.setNotify(true); }} /></View>
        <View style={{ flex: 1 }}><Button kind="sec" label="Şimdi değil" onPress={() => { store.setNotify(false); }} /></View>
      </View>
    </Card>
  ) : null;
  const dropped = (store.droppedLeagues ?? []).map((id) => store.league(id)?.name).filter(Boolean) as string[];
  const notice = dropped.length ? (
    <Card style={{ marginTop: GAP, padding: 14, gap: 10 }}>
      <Text style={{ fontSize: 14, lineHeight: 20, color: t.fg }}>Lig takibi kalktı ({dropped.join(', ')}). Artık takımlarının maçları gösteriliyor; ligleri Ligler sekmesinde yine bulabilirsin.</Text>
      <Button kind="sec" label="Tamam" onPress={store.dismissNotice} />
    </Card>
  ) : null;

  if (!store.teams.length) {
    return (
      <Screen tab title="Maçlarım" right={addButton}>
        {notice}
        <Empty>Henüz takım seçmedin. Takımını (kulüp ya da milli takım) ekle, burada onun maçlarını gör.</Empty>
        <Button label="+ Takım ekle" onPress={() => nav.navigate('Picker')} />
      </Screen>
    );
  }
  if (scope === 'all') {
    return (
      <Screen tab title="Maçlarım" right={addButton} team={store.mainTeam?.name} onRefresh={day.reload}>
        {filter}
        <Loader state={day}>
          {(d) => d.fixtures.length ? <MatchList title="Bugünün maçları" fixtures={d.fixtures} onMatch={openMatch} showLeague notes={displayNotes} /> : <Empty>Bugün katalogdaki liglerde maç yok.</Empty>}
        </Loader>
      </Screen>
    );
  }
  return (
    <Screen tab title="Maçlarım" right={addButton} team={store.mainTeam?.name} onRefresh={state.reload}>
      {filter}
      {banner}
      {askNotify}
      {notice}
      <Loader state={state}>
        {(d) => {
          const live = shown.filter((f) => f.st === 'live');
          const upcoming = shown.filter((f) => f.st === 'ns').slice(0, UPCOMING_LIMIT);
          const results = shown.filter((f) => f.st === 'ft').slice(-RESULTS_LIMIT).reverse();
          // Canlı maç varsa hepsi büyük kartta; yoksa sıradaki ilk maç.
          const heroes = live.length ? live : upcoming.slice(0, 1);
          const rest = live.length ? upcoming : upcoming.slice(1);
          return (
            <>
              <View style={{ gap: GAP, marginTop: GAP }}>
                {heroes.map((f) => <Hero key={f.id} f={f} today={d.today} note={displayNotes.get(f.id)} onPress={() => openMatch(f)} />)}
              </View>
              {!heroes.length && <Empty>Takip ettiklerinin yaklaşan maçı yok.</Empty>}
              {rest.length > 0 && (
                <MatchList title="Fikstür" fixtures={rest} onMatch={openMatch} showLeague today={d.today} notes={displayNotes} />
              )}
              {results.length > 0 && (
                <MatchList title="Son sonuçlar" fixtures={results} onMatch={openMatch} showLeague today={d.today} />
              )}
            </>
          );
        }}
      </Loader>
    </Screen>
  );
}

function countdown(date: string, today: string): string {
  const n = daysBetween(today, date);
  return n <= 0 ? 'Bugün' : n === 1 ? 'Yarın' : `${n} gün sonra`;
}

function Hero({ f, today, note, onPress }: { f: Fixture; today: string; note?: RowNote; onPress: () => void }) {
  const t = useTheme();
  const league = useStore().league(f.lg);
  const live = f.st === 'live';
  // Canlı maçta golü atanlar her takımın altında küçük yazıyla (maç ayrıntısı sunucu önbelleğinden, 30 sn'de bir).
  const detail = useApi<Match>(live ? `/api/match/${f.id}` : null, 30000);
  const goals = (s: 'h' | 'a') => (detail.data?.events ?? []).filter((e) => e.k === 'goal' && e.side === s)
    .map((e) => `${e.p} ${e.min}${e.extra ? `+${e.extra}` : ''}'${e.x === 'Penaltı' ? ' (P)' : e.x === 'Kendi kalesine' ? ' (K.K.)' : ''}`);
  const side = (team: Fixture['h'], s: 'h' | 'a') => (
    <View style={{ flex: 1, alignItems: 'center', gap: 10 }}>
      <Crest uri={team.logo} size={56} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, maxWidth: '100%' }}>
        <Text numberOfLines={2} style={{ fontWeight: '600', fontSize: 15, textAlign: 'center', color: t.fg, flexShrink: 1 }}>{team.name}</Text>
        <RedCard n={f.rc?.[s === 'h' ? 0 : 1]} />
      </View>
      {live && goals(s).length > 0 && (
        // Ev sahibinin golleri sola, deplasmanınkiler sağa dayalı; toplar dış kenarda aynı hizada.
        <View style={{ alignSelf: 'stretch', alignItems: s === 'h' ? 'flex-start' : 'flex-end', marginTop: -4, gap: 1 }}>
          {goals(s).slice(0, 5).map((g, i) => (
            <View key={i} style={{ flexDirection: s === 'h' ? 'row' : 'row-reverse', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
              <Text style={{ fontSize: 11 }}>⚽</Text>
              <Text numberOfLines={1} style={{ fontSize: 11.5, lineHeight: 15, color: t.muted, flexShrink: 1, textAlign: s === 'h' ? 'left' : 'right' }}>{g}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${f.h.name} ${f.a.name}${live ? ' canlı' : ''}`}>
      <Card style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 20, gap: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
          {live && <LiveDot />}
          <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: live ? t.live : t.fg }}>{live ? `Canlı · ${statusText(f)}` : countdown(f.date, today)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
          {side(f.h, 'h')}
          <View style={{ alignItems: 'center', minWidth: 104, gap: 2, paddingTop: 6 }}>
            <Text style={{ fontWeight: '600', fontSize: 38, lineHeight: 44, letterSpacing: -0.8, color: t.fg, fontVariant: ['tabular-nums'] }}>{live && f.s ? `${f.s[0]} – ${f.s[1]}` : f.time}</Text>
            {!live && <Text style={{ fontSize: 13, color: t.muted }}>{dayLabel(f.date, today)}</Text>}
          </View>
          {side(f.a, 'a')}
        </View>
        <Text style={{ textAlign: 'center', fontSize: 13, color: t.muted }}>{[league?.name ?? f.lgName, f.round, league?.tv && `Yayın: ${league.tv}`].filter(Boolean).join(' · ')}</Text>
        {note ? <Text numberOfLines={1} style={{ textAlign: 'center', fontSize: 12.5, marginTop: -8, fontWeight: note.wait ? '700' : '500', color: note.wait ? t.accent : t.muted }}>{note.text}</Text> : null}
      </Card>
    </Pressable>
  );
}
