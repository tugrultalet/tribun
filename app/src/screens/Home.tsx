import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Day, Fixture, get, TeamData, useApi } from '../api';
import { addDays, dayLabel, dayOfMonth, weekday } from '../dates';
import { useNav } from '../nav';
import { useStore } from '../store';
import { font, useTheme } from '../theme';
import { Card, Crest, Empty, Icon, LeagueBadge, LiveDot, Loader, MatchList, Note, ScreenTitle, Section, Seg, statusText } from '../ui';
import { Screen } from './Screen';

export default function Home() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const { meta } = store;
  const [date, setDate] = useState(meta.today);
  const [filter, setFilter] = useState<'follow' | 'all'>('follow');
  const isToday = date === meta.today;
  // Takiplerim'de yalnızca takip edilen ligler ve takımlar istenir; sunucu gereksiz lig için istek harcamaz.
  const scope = filter === 'follow' ? `&leagues=${store.leagues.join(',')}&teams=${store.teams.map((x) => x.id).join(',')}` : '';
  const state = useApi<Day>(`/api/fixtures?date=${date}${scope}`, isToday ? 60000 : undefined);

  const days = useMemo(() => {
    const list: string[] = [];
    for (let o = meta.window.from; o <= meta.window.to; o++) list.push(addDays(meta.today, o));
    return list;
  }, [meta]);
  const openMatch = (f: Fixture) => nav.navigate('Match', { id: f.id });

  return (
    <Screen
      onRefresh={state.reload}
      refreshing={state.loading && state.data !== undefined}
      header={<ScreenTitle title="Maçlar" right={
        <Pressable onPress={() => nav.navigate('Picker')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Takım ekle" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
          <Icon.search color={t.fg} />
        </Pressable>} />}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
        {days.map((d) => {
          const on = d === date;
          return (
            <Pressable key={d} onPress={() => setDate(d)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={dayLabel(d, meta.today)}
              style={{ width: 54, paddingVertical: 8, borderRadius: 14, alignItems: 'center', gap: 2, backgroundColor: on ? t.fg : 'transparent' }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: on ? t.bg : t.muted }}>{d === meta.today ? 'Bugün' : weekday(d)}</Text>
              <Text style={{ fontFamily: font.scoreMid, fontSize: 21, lineHeight: 23, color: on ? t.bg : t.fg }}>{dayOfMonth(d)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Seg style={{ marginTop: 12 }} value={filter} onChange={setFilter} options={[['follow', 'Takiplerim'], ['all', 'Tüm ligler']]} />

      <Loader state={state}>
        {(day) => {
          const list = filter === 'follow' ? day.fixtures.filter(store.followsMatch) : day.fixtures;
          const heroes = list.filter((f) => f.st === 'live' && (store.followsTeam(f.h.id) || store.followsTeam(f.a.id)));
          const rest = list.filter((f) => !heroes.includes(f));
          const groups = meta.leagues.map((l) => ({ league: l, fixtures: rest.filter((f) => f.lg === l.id) })).filter((g) => g.fixtures.length);
          return (
            <>
              {day.stale && <Note>Veri yenilenemedi; son alınan skorlar gösteriliyor.</Note>}
              {heroes.map((f) => <Hero key={f.id} f={f} onPress={() => openMatch(f)} />)}
              {isToday && <NextMatch onMatch={openMatch} />}
              {groups.map(({ league, fixtures }) => (
                <Section key={league.id} title={league.name} left={<LeagueBadge id={league.id} />}
                  right={<Pressable onPress={() => nav.navigate('League', { id: league.id })} hitSlop={8}><Text style={{ fontSize: 12.5, fontWeight: '600', color: t.accent }}>Puan durumu</Text></Pressable>}>
                  <MatchList fixtures={fixtures} onMatch={openMatch} />
                </Section>
              ))}
              {!groups.length && !heroes.length && (
                <View>
                  <Empty>{dayLabel(date, meta.today)} {filter === 'follow' ? 'takip ettiğin takım ve liglerde' : 'desteklenen liglerde'} maç yok.</Empty>
                  {filter === 'follow' && day.fixtures.length > 0 && (
                    <Pressable onPress={() => setFilter('all')} style={{ alignSelf: 'center' }}><Text style={{ color: t.accent, fontWeight: '700' }}>Tüm ligleri göster</Text></Pressable>
                  )}
                </View>
              )}
            </>
          );
        }}
      </Loader>
    </Screen>
  );
}

function Hero({ f, onPress }: { f: Fixture; onPress: () => void }) {
  const t = useTheme();
  const league = useStore().league(f.lg);
  const side = (team: Fixture['h']) => (
    <View style={{ flex: 1, alignItems: 'center', gap: 7 }}>
      <Crest uri={team.logo} size={52} />
      <Text numberOfLines={2} style={{ fontWeight: '700', fontSize: 14, textAlign: 'center', color: t.fg }}>{team.name}</Text>
    </View>
  );
  return (
    <Section title="" left={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.liveSoft, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 99 }}><LiveDot /><Text style={{ fontSize: 12, fontWeight: '700', color: t.live }}>CANLI</Text></View>}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${f.h.name} ${f.a.name} canlı`}>
        <Card style={{ borderRadius: 22, padding: 16, gap: 12, borderTopWidth: 4, borderTopColor: t.live }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.1, color: t.muted }}>{`${league?.name ?? ''} · ${f.round}`.toLocaleUpperCase('tr')}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: t.live }}>{statusText(f)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {side(f.h)}
            <Text style={{ fontFamily: font.score, fontSize: 58, lineHeight: 60, color: t.fg }}>{f.s ? `${f.s[0]} – ${f.s[1]}` : '–'}</Text>
            {side(f.a)}
          </View>
        </Card>
      </Pressable>
    </Section>
  );
}

// Takip edilen takımların bugünden sonraki ilk maçı.
function NextMatch({ onMatch }: { onMatch: (f: Fixture) => void }) {
  const t = useTheme();
  const { teams, meta } = useStore();
  const [next, setNext] = useState<Fixture | null>(null);
  const ids = teams.slice(0, 6).map((x) => x.id).join(',');
  useEffect(() => {
    let alive = true;
    if (!ids) { setNext(null); return; }
    Promise.all(ids.split(',').map((id) => get<TeamData>(`/api/team/${id}`).catch(() => null))).then((all) => {
      const upcoming = all.flatMap((d) => d?.fixtures ?? []).filter((f) => f.st === 'ns' && f.date > meta.today).sort((a, b) => a.ts - b.ts)[0];
      if (alive) setNext(upcoming ?? null);
    });
    return () => { alive = false; };
  }, [ids, meta.today]);
  if (!next) return null;
  return (
    <Section title="Sıradaki maçın">
      <Pressable onPress={() => onMatch(next)} accessibilityRole="button">
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
          <View style={{ minWidth: 58, paddingRight: 12, borderRightWidth: 1, borderColor: t.line, alignItems: 'center' }}>
            <Text style={{ fontFamily: font.scoreMid, fontSize: 22, lineHeight: 24, color: t.fg }}>{next.time}</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: t.muted, marginTop: 3 }}>{dayLabel(next.date, meta.today)}</Text>
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            {[next.h, next.a].map((team) => (
              <View key={team.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Crest uri={team.logo} size={22} />
                <Text numberOfLines={1} style={{ flexShrink: 1, fontWeight: '600', fontSize: 14, color: t.fg }}>{team.name}</Text>
              </View>
            ))}
          </View>
          <Icon.chevron color={t.fg} />
        </Card>
      </Pressable>
    </Section>
  );
}
