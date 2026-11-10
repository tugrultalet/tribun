import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Fixture, Mine, useApi } from '../api';
import { dayLabel, daysBetween } from '../dates';
import { euroIds, followedFixtures } from '../follow';
import { inScope, scopeLeagues, useLeagueFixtures } from '../groups/scope';
import { sameWeek } from '../groups/standings';
import { useNav } from '../nav';
import { Group, rpc, useRpc } from '../social';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Button, Card, Crest, Empty, Icon, LiveDot, Loader, MatchList, RowNote, Seg, statusText } from '../ui';
import { Screen } from './Screen';

// Bir takımın sezon boyunca tüm yarışmalardaki maçları rahatça sığar.
const UPCOMING_LIMIT = 100;
const RESULTS_LIMIT = 10;
const GROUP_WINDOW_DAYS = 7;

type Status = { group_id: string; match_id: number; entered: number; h: number | null; a: number | null };

// Ana ekranın tek kuralı: "takımlarımın seçili turnuvalardaki maçları + gruplarımın tahmin maçları".
// Grup maçlarının üstünde küçük bir etiket durur ("Hoppa · 3/5 girdi · tahminin 2–1" ya da "Hoppa · tahmin bekliyor").
// "Tüm ligler" filtresi o günün bütün maçlarını gösterir.
export default function Home() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const secret = store.me?.secret;
  const euro = useMemo(() => euroIds(store.meta.leagues), [store.meta.leagues]);
  const groups = useRpc<Group[]>('my_groups', secret ? { p_secret: secret } : null, 60000).data ?? [];

  // Takip edilen takımlara, takip edilmeyen grup takımları da eklenir (grup maçları ana ekranda görünsün).
  const teamIds = [...new Set([...store.teams.map((x) => x.id), ...groups.map((g) => g.team.id)])];
  const query = scope === 'mine' && teamIds.length ? `/api/mine?teams=${teamIds.join(',')}` : null;
  const state = useApi<Mine>(query, 60000);
  const day = useApi<{ date: string; fixtures: Fixture[] }>(scope === 'all' ? `/api/fixtures?date=${store.meta.today}` : null, 60000);
  const openMatch = (f: Fixture) => nav.navigate('Match', { id: f.id });

  // Turnuva kapsamlı gruplar ve "tüm maçlarını takip et" turnuvaları için turnuva fikstürleri (sunucu önbelleğinden).
  const full = store.full ?? [];
  const leagueIds = useMemo(() => [...new Set([...groups.flatMap((g) => scopeLeagues(g) ?? []), ...full])], [groups, full]);
  const leagueFx = useLeagueFixtures(scope === 'mine' ? leagueIds : []);
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
    const load = () => rpc<Status[]>('group_prediction_status', { p_secret: secret, p_matches: candidates.map((f) => f.id).slice(0, 200) }).then((r) => alive && setStatus(r), () => {});
    load();
    const timer = setInterval(load, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [secret, matchKey]);

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
      out.set(f.id, { wait: first.wait, text: items.length > 1 ? `${first.text} · +${items.length - 1} grup` : first.text });
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

  const addButton = (
    <Pressable onPress={() => nav.navigate('Picker')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Takım ekle" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
      <Icon.plus color={t.accent} />
    </Pressable>
  );
  const filter = <View style={{ marginTop: 4 }}><Seg value={scope} onChange={setScope} options={[['mine', 'Takiplerim'], ['all', 'Tüm ligler']]} /></View>;
  const dropped = (store.droppedLeagues ?? []).map((id) => store.league(id)?.name).filter(Boolean) as string[];
  const notice = dropped.length ? (
    <Card style={{ marginTop: 12, padding: 14, gap: 10 }}>
      <Text style={{ fontSize: 14, lineHeight: 20, color: t.fg }}>Lig takibi kalktı ({dropped.join(', ')}). Artık takımlarının maçları gösteriliyor; ligleri Keşfet sekmesinde yine bulabilirsin.</Text>
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
      <Screen tab title="Maçlarım" right={addButton} team={store.mainTeam?.name} onRefresh={day.reload} refreshing={day.loading && day.data !== undefined}>
        {filter}
        <Loader state={day}>
          {(d) => d.fixtures.length ? <MatchList title="Bugünün maçları" fixtures={d.fixtures} onMatch={openMatch} showLeague /> : <Empty>Bugün katalogdaki liglerde maç yok.</Empty>}
        </Loader>
      </Screen>
    );
  }
  return (
    <Screen tab title="Maçlarım" right={addButton} team={store.mainTeam?.name} onRefresh={state.reload} refreshing={state.loading && state.data !== undefined}>
      {filter}
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
              <View style={{ gap: 12, marginTop: 4 }}>
                {heroes.map((f) => <Hero key={f.id} f={f} today={d.today} note={notes.get(f.id)} onPress={() => openMatch(f)} />)}
              </View>
              {!heroes.length && <Empty>Takip ettiklerinin yaklaşan maçı yok.</Empty>}
              {rest.length > 0 && (
                <MatchList title="Fikstür" fixtures={rest} onMatch={openMatch} showLeague today={d.today} notes={notes} />
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
  const side = (team: Fixture['h']) => (
    <View style={{ flex: 1, alignItems: 'center', gap: 10 }}>
      <Crest uri={team.logo} size={56} />
      <Text numberOfLines={2} style={{ fontWeight: '600', fontSize: 15, textAlign: 'center', color: t.fg }}>{team.name}</Text>
    </View>
  );
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${f.h.name} ${f.a.name}${live ? ' canlı' : ''}`}>
      <Card style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 20, gap: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
          {live && <LiveDot />}
          <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: live ? t.live : t.fg }}>{live ? `Canlı · ${statusText(f)}` : countdown(f.date, today)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {side(f.h)}
          <View style={{ alignItems: 'center', minWidth: 104, gap: 2 }}>
            <Text style={{ fontWeight: '600', fontSize: 38, lineHeight: 44, letterSpacing: -0.8, color: t.fg, fontVariant: ['tabular-nums'] }}>{live && f.s ? `${f.s[0]} – ${f.s[1]}` : f.time}</Text>
            {!live && <Text style={{ fontSize: 13, color: t.muted }}>{dayLabel(f.date, today)}</Text>}
          </View>
          {side(f.a)}
        </View>
        <Text style={{ textAlign: 'center', fontSize: 13, color: t.muted }}>{[league?.name ?? f.lgName, f.round, league?.tv && `Yayın: ${league.tv}`].filter(Boolean).join(' · ')}</Text>
        {note ? <Text numberOfLines={1} style={{ textAlign: 'center', fontSize: 12.5, marginTop: -8, fontWeight: note.wait ? '700' : '500', color: note.wait ? t.accent : t.muted }}>{note.text}</Text> : null}
      </Card>
    </Pressable>
  );
}
