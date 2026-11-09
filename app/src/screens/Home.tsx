import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Fixture, Mine, useApi } from '../api';
import { dayLabel } from '../dates';
import { useNav } from '../nav';
import { useStore } from '../store';
import { font, useTheme } from '../theme';
import { Button, Card, Crest, Empty, Icon, LiveDot, Loader, MatchList, ScreenTitle, Section, statusText } from '../ui';
import { Screen } from './Screen';

const UPCOMING_LIMIT = 20;
const RESULTS_LIMIT = 5;

// Ana ekran: yalnızca takip edilen takımların maçları. Önce canlı, sonra sıradaki maçlar, en altta son sonuçlar.
export default function Home() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const ids = store.teams.map((x) => x.id).join(',');
  const state = useApi<Mine>(ids ? `/api/mine?teams=${ids}` : null, 60000);
  const openMatch = (f: Fixture) => nav.navigate('Match', { id: f.id });
  const addButton = (
    <Pressable onPress={() => nav.navigate('Picker')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Takım ekle" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
      <Icon.search color={t.fg} />
    </Pressable>
  );

  if (!ids) {
    return (
      <Screen header={<ScreenTitle title="Maçlarım" right={addButton} />}>
        <Empty>Henüz takım seçmedin. Takımını ekle, burada yalnızca onun maçlarını gör.</Empty>
        <Button label="+ Takım ekle" onPress={() => nav.navigate('Picker')} />
      </Screen>
    );
  }
  return (
    <Screen onRefresh={state.reload} refreshing={state.loading && state.data !== undefined} header={<ScreenTitle title="Maçlarım" right={addButton} />}>
      <Loader state={state}>
        {(d) => {
          const live = d.fixtures.filter((f) => f.st === 'live');
          const upcoming = d.fixtures.filter((f) => f.st === 'ns').slice(0, UPCOMING_LIMIT);
          const results = d.fixtures.filter((f) => f.st === 'ft').slice(-RESULTS_LIMIT).reverse();
          const dates = [...new Set(upcoming.map((f) => f.date))];
          return (
            <>
              {live.map((f) => <Hero key={f.id} f={f} onPress={() => openMatch(f)} />)}
              {dates.map((date) => (
                <Section key={date} title={dayLabel(date, d.today)}>
                  <MatchList fixtures={upcoming.filter((f) => f.date === date)} onMatch={openMatch} showLeague />
                </Section>
              ))}
              {!live.length && !upcoming.length && <Empty>Takip ettiğin takımların yaklaşan maçı yok.</Empty>}
              {results.length > 0 && (
                <Section eyebrow="Son sonuçlar">
                  <MatchList fixtures={results} onMatch={openMatch} showLeague />
                </Section>
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
