import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { LeagueTeams, National, Team, useApi } from '../api';
import { seasonLabel } from '../dates';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Crest, Empty, Icon, Loader, Note, Seg } from '../ui';
import { SearchBox } from './Leagues';
import { Screen } from './Screen';

// `kind`: kulüp ya da milli takım; `country`: kulüp seçilirken içinde bulunulan ligin ülkesi (milli takım önerisi için).
export type Toggle = (team: Team, kind: 'club' | 'national', country?: string) => void;

// Takım kutuları ızgarası.
function Cells({ teams, selected, onToggle }: { teams: Team[]; selected: (id: number) => boolean; onToggle: (team: Team) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, marginTop: 10 }}>
      {teams.map((team) => {
        const on = selected(team.id);
        return (
          <View key={team.id} style={{ width: '33.333%', padding: 5 }}>
            <Pressable onPress={() => onToggle(team)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={team.name}
              style={{ alignItems: 'center', gap: 7, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 4, borderRadius: 16, borderWidth: 1.5, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accentSoft : t.surface }}>
              {on && <View style={{ position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}><Icon.check color={t.accentInk} size={11} /></View>}
              <Crest uri={team.logo} size={40} />
              <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '600', color: t.fg }}>{team.name}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

// Kulüpler: lig seçip o ligin takımlarını gösterir.
function Clubs({ selected, onToggle }: { selected: (id: number) => boolean; onToggle: Toggle }) {
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
              <Cells teams={teams} selected={selected} onToggle={(tm) => onToggle(tm, 'club', leagues.find((l) => l.id === leagueId)?.country)} />
              {!teams.length && <Empty>Eşleşen takım yok.</Empty>}
            </>
          );
        }}
      </Loader>
    </View>
  );
}

const NATIONAL_PREVIEW = 60;

// Milli takımlar: tek liste, arama kutusuyla. Aramadan önce ilk takımlar (Türkiye başta) gösterilir.
export function NationalTeams({ selected, onToggle }: { selected: (id: number) => boolean; onToggle: Toggle }) {
  const [q, setQ] = useState('');
  const state = useApi<National>('/api/national');
  const needle = q.trim().toLocaleLowerCase('tr');
  return (
    <View>
      <SearchBox value={q} onChange={setQ} placeholder="Milli takım ara (ör. Türkiye)" />
      <Loader state={state}>
        {(d) => {
          const all = d.teams.filter((x) => !needle || x.name.toLocaleLowerCase('tr').includes(needle));
          const teams = needle ? all : all.slice(0, NATIONAL_PREVIEW);
          return (
            <>
              <Cells teams={teams} selected={selected} onToggle={(tm) => onToggle(tm, 'national')} />
              {!needle && all.length > NATIONAL_PREVIEW && <Note>Listede {all.length} milli takım var. Diğerlerini bulmak için yukarıya adını yaz.</Note>}
              {!teams.length && <Empty>Eşleşen milli takım yok.</Empty>}
            </>
          );
        }}
      </Loader>
    </View>
  );
}

// Kulüp ya da milli takım seçimi. İlk açılışta ve "Takım ekle"de kullanılır.
export function TeamGrid({ selected, onToggle }: { selected: (id: number) => boolean; onToggle: Toggle }) {
  const [kind, setKind] = useState<'club' | 'national'>('club');
  return (
    <View>
      <Seg style={{ marginBottom: 12 }} value={kind} onChange={setKind} options={[['club', 'Kulüpler'], ['national', 'Milli takımlar']]} />
      {kind === 'club' ? <Clubs selected={selected} onToggle={onToggle} /> : <NationalTeams selected={selected} onToggle={onToggle} />}
    </View>
  );
}

export default function Picker() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  return (
    <Screen bottomInset title="Takım ekle" right={Platform.OS === 'ios' ? <Pressable onPress={nav.goBack} hitSlop={8} accessibilityRole="button"><Text style={{ fontSize: 17, fontWeight: '600', color: t.accent }}>Bitti</Text></Pressable> : undefined}>
      <TeamGrid selected={store.followsTeam} onToggle={(team, kind) => store.toggleTeam(team, kind)} />
    </Screen>
  );
}
