import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Fixture, Mine, useApi } from '../api';
import { dayLabel, daysBetween } from '../dates';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Button, Card, Crest, Empty, Icon, LiveDot, Loader, MatchList, statusText } from '../ui';
import { Screen } from './Screen';

const UPCOMING_LIMIT = 20;
const RESULTS_LIMIT = 5;

// Ana ekran: takip edilen takımların maçları (katıldıkları tüm yarışmalarda) ve takip edilen turnuvaların yakın maçları.
// En üstte canlı maç (yoksa sıradaki maç) büyük kartta; altında fikstür, en altta son sonuçlar.
export default function Home() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const ids = store.teams.map((x) => x.id).join(',');
  const leagueIds = store.leagues.join(',');
  const state = useApi<Mine>(ids || leagueIds ? `/api/mine?teams=${ids}&leagues=${leagueIds}` : null, 60000);
  const openMatch = (f: Fixture) => nav.navigate('Match', { id: f.id });
  const addButton = (
    <Pressable onPress={() => nav.navigate('Picker')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Takım ekle" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
      <Icon.plus color={t.accent} />
    </Pressable>
  );

  if (!ids && !leagueIds) {
    return (
      <Screen tab title="Maçlarım" right={addButton}>
        <Empty>Henüz takım ya da turnuva seçmedin. Takımını (kulüp ya da milli takım) ekle, burada yalnızca onun maçlarını gör.</Empty>
        <Button label="+ Takım ekle" onPress={() => nav.navigate('Picker')} />
      </Screen>
    );
  }
  return (
    <Screen tab title="Maçlarım" right={addButton} onRefresh={state.reload} refreshing={state.loading && state.data !== undefined}>
      <Loader state={state}>
        {(d) => {
          const live = d.fixtures.filter((f) => f.st === 'live');
          const upcoming = d.fixtures.filter((f) => f.st === 'ns').slice(0, UPCOMING_LIMIT);
          const results = d.fixtures.filter((f) => f.st === 'ft').slice(-RESULTS_LIMIT).reverse();
          // Canlı maç varsa hepsi büyük kartta; yoksa sıradaki ilk maç.
          const heroes = live.length ? live : upcoming.slice(0, 1);
          const rest = live.length ? upcoming : upcoming.slice(1);
          return (
            <>
              <View style={{ gap: 12, marginTop: 4 }}>
                {heroes.map((f) => <Hero key={f.id} f={f} today={d.today} onPress={() => openMatch(f)} />)}
              </View>
              {!heroes.length && <Empty>Takip ettiklerinin yaklaşan maçı yok.</Empty>}
              {rest.length > 0 && (
                <MatchList title="Fikstür" fixtures={rest} onMatch={openMatch} showLeague dated />
              )}
              {results.length > 0 && (
                <MatchList title="Son sonuçlar" fixtures={results} onMatch={openMatch} showLeague dated />
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

function Hero({ f, today, onPress }: { f: Fixture; today: string; onPress: () => void }) {
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
      </Card>
    </Pressable>
  );
}
