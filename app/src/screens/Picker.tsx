import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { LeagueTeams, Team, useApi } from '../api';
import { seasonLabel } from '../dates';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { BackBar, Crest, Empty, Icon, Loader, Note } from '../ui';
import { SearchBox } from './Leagues';
import { Screen } from './Screen';

// Lig seçip takımları ızgarada gösterir. İlk açılışta ve "Takım ekle"de kullanılır.
export function TeamGrid({ selected, onToggle }: { selected: (id: number) => boolean; onToggle: (team: Team, leagueId: number) => void }) {
  const t = useTheme();
  const { meta } = useStore();
  const leagues = meta.leagues.filter((l) => l.type === 'main');
  const [leagueId, setLeagueId] = useState(leagues[0].id);
  const [q, setQ] = useState('');
  const state = useApi<LeagueTeams>(`/api/league/${leagueId}/teams`);
  const needle = q.trim().toLocaleLowerCase('tr');
  return (
    <View>
      <SearchBox value={q} onChange={setQ} placeholder="Takım ara" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginTop: 12 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
        {leagues.map((l) => {
          const on = l.id === leagueId;
          return (
            <Pressable key={l.id} onPress={() => setLeagueId(l.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 99, backgroundColor: on ? t.fg : t.surface2 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: on ? t.bg : t.fg }}>{l.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Loader state={state}>
        {(d) => {
          const teams = d.teams.filter((x) => !needle || x.name.toLocaleLowerCase('tr').includes(needle));
          return (
            <>
              {!d.current && <Note>Ücretsiz API planı güncel sezonun takım listesini vermiyor; {seasonLabel(d.season)} listesi gösteriliyor. Listede olmayan bir takımı maç sayfasından takip edebilirsin.</Note>}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, marginTop: 10 }}>
                {teams.map((team) => {
                  const on = selected(team.id);
                  return (
                    <View key={team.id} style={{ width: '33.333%', padding: 5 }}>
                      <Pressable onPress={() => onToggle(team, leagueId)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={team.name}
                        style={{ alignItems: 'center', gap: 7, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 4, borderRadius: 16, borderWidth: 1.5, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accentSoft : t.surface }}>
                        {on && <View style={{ position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}><Icon.check color={t.accentInk} size={11} /></View>}
                        <Crest uri={team.logo} size={40} />
                        <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '600', color: t.fg }}>{team.name}</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
              {!teams.length && <Empty>Eşleşen takım yok.</Empty>}
            </>
          );
        }}
      </Loader>
    </View>
  );
}

export default function Picker() {
  const nav = useNav();
  const store = useStore();
  return (
    <Screen bottomInset header={<BackBar onBack={nav.goBack} title="Takım ekle" />}>
      <TeamGrid selected={store.followsTeam} onToggle={(team) => store.toggleTeam(team)} />
    </Screen>
  );
}
