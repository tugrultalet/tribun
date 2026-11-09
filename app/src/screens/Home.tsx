import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Fixture, Mine, useApi } from '../api';
import { dayLabel, daysBetween } from '../dates';
import { useNav } from '../nav';
import { useStore } from '../store';
import { font, useTheme } from '../theme';
import { Button, Crest, Empty, Glass, Icon, LiveDot, Loader, MatchList, Section, statusText } from '../ui';
import { Screen } from './Screen';

const UPCOMING_LIMIT = 20;
const RESULTS_LIMIT = 5;

// Ana ekran: yalnızca takip edilen takımların maçları.
// En üstte canlı maç (yoksa sıradaki maç) büyük kartta; altında fikstür, en altta son sonuçlar.
export default function Home() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const ids = store.teams.map((x) => x.id).join(',');
  const state = useApi<Mine>(ids ? `/api/mine?teams=${ids}` : null, 60000);
  const openMatch = (f: Fixture) => nav.navigate('Match', { id: f.id });
  const addButton = (
    <Pressable onPress={() => nav.navigate('Picker')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Takım ekle" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
      <Icon.plus color={t.accent} />
    </Pressable>
  );

  if (!ids) {
    return (
      <Screen tab title="Maçlarım" right={addButton}>
        <Empty>Henüz takım seçmedin. Takımını ekle, burada yalnızca onun maçlarını gör.</Empty>
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
              {!heroes.length && <Empty>Takip ettiğin takımların yaklaşan maçı yok.</Empty>}
              {rest.length > 0 && (
                <Section eyebrow="Fikstür">
                  <MatchList fixtures={rest} onMatch={openMatch} showLeague dated />
                </Section>
              )}
              {results.length > 0 && (
                <Section eyebrow="Son sonuçlar">
                  <MatchList fixtures={results} onMatch={openMatch} showLeague dated />
                </Section>
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
    <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
      <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center' }}>
        <Crest uri={team.logo} size={48} />
      </View>
      <Text numberOfLines={2} style={{ fontWeight: '700', fontSize: 14, textAlign: 'center', color: '#fff' }}>{team.name}</Text>
    </View>
  );
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${f.h.name} ${f.a.name}${live ? ' canlı' : ''}`}>
      <LinearGradient colors={t.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 28, borderCurve: 'continuous', padding: 18, gap: 16, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, color: 'rgba(255,255,255,0.8)' }}>{`${league?.name ?? ''} · ${f.round}`.toLocaleUpperCase('tr')}</Text>
          <Glass style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 11, borderRadius: 99, overflow: 'hidden' }}>
            {live && <LiveDot />}
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{live ? `CANLI · ${statusText(f)}` : countdown(f.date, today)}</Text>
          </Glass>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {side(f.h)}
          <View style={{ alignItems: 'center', minWidth: 96 }}>
            <Text style={{ fontFamily: font.score, fontSize: 56, lineHeight: 58, color: '#fff' }}>{live && f.s ? `${f.s[0]} – ${f.s[1]}` : f.time}</Text>
            {!live && <Text style={{ fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.8)' }}>{dayLabel(f.date, today)}</Text>}
          </View>
          {side(f.a)}
        </View>
        {league?.tv && <Text style={{ textAlign: 'center', fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.85)' }}>Yayın: {league.tv}</Text>}
      </LinearGradient>
    </Pressable>
  );
}
