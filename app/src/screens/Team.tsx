import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Fixture, Squad, Standings, TeamData, useApi } from '../api';
import { RootParams, useNav } from '../nav';
import { useStore } from '../store';
import { font, useTheme } from '../theme';
import { BackBar, Card, Crest, Empty, Loader, Section, StandingsTable, Tabs } from '../ui';
import { FixtureDays } from './League';
import { Screen } from './Screen';

const GROUPS: [string, string][] = [['Goalkeeper', 'Kaleci'], ['Defender', 'Defans'], ['Midfielder', 'Orta saha'], ['Attacker', 'Forvet']];

export default function Team({ route }: NativeStackScreenProps<RootParams, 'Team'>) {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const { team } = route.params;
  const [tab, setTab] = useState<'matches' | 'squad' | 'table'>('matches');
  const info = useApi<TeamData>(`/api/team/${team.id}`, 60000);
  const squad = useApi<Squad>(tab === 'squad' ? `/api/team/${team.id}/squad` : null);
  const leagueId = info.data?.league ?? null;
  const table = useApi<Standings>(tab === 'table' && leagueId ? `/api/standings/${leagueId}` : null);
  const league = leagueId ? store.league(leagueId) : undefined;
  const on = store.followsTeam(team.id);
  const openMatch = (f: Fixture) => nav.navigate('Match', { id: f.id });
  return (
    <Screen header={<BackBar onBack={nav.goBack} />}>
      <View style={{ alignItems: 'center', gap: 8, paddingTop: 4, paddingBottom: 18 }}>
        <Crest uri={team.logo} size={76} />
        <Text style={{ fontFamily: font.score, fontSize: 34, lineHeight: 36, color: t.fg, textAlign: 'center' }}>{team.name.toLocaleUpperCase('tr')}</Text>
        {league && <Text style={{ fontSize: 13, color: t.muted }}>{league.name}</Text>}
        <Pressable onPress={() => store.toggleTeam(team)} accessibilityRole="button" accessibilityState={{ selected: on }}
          style={{ marginTop: 6, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 99, backgroundColor: on ? t.accent : 'transparent', borderWidth: 1, borderColor: t.accent }}>
          <Text style={{ fontWeight: '700', fontSize: 13, color: on ? t.accentInk : t.accent }}>{on ? '✓ Takip ediliyor' : '+ Takip et'}</Text>
        </Pressable>
      </View>
      <Tabs value={tab} onChange={setTab} options={[['matches', 'Maçlar'], ['squad', 'Kadro'], ['table', 'Puan durumu']]} />
      {tab === 'matches' && <Loader state={info}>{(d) => <FixtureDays data={d} today={store.meta.today} onMatch={openMatch} showLeague />}</Loader>}
      {tab === 'squad' && (
        <Loader state={squad}>
          {(d) => (
            <>
              {GROUPS.map(([key, label]) => {
                const players = d.players.filter((p) => p.pos === key);
                if (!players.length) return null;
                return (
                  <Section key={key} eyebrow={label} right={<Text style={{ fontSize: 12.5, color: t.muted }}>{players.length} oyuncu</Text>}>
                    <Card>
                      {players.map((p, i) => (
                        <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderColor: t.line }}>
                          <Text style={{ width: 28, textAlign: 'center', fontFamily: font.scoreMid, fontSize: 19, color: t.muted }}>{p.no ?? '–'}</Text>
                          <Text style={{ flex: 1, fontWeight: '600', fontSize: 15, color: t.fg }}>{p.name}</Text>
                          {p.age != null && <Text style={{ fontSize: 12.5, color: t.muted }}>{p.age} yaş</Text>}
                        </View>
                      ))}
                    </Card>
                  </Section>
                );
              })}
            </>
          )}
        </Loader>
      )}
      {tab === 'table' && (
        info.data && !leagueId
          ? <Empty>Bu takımın ligi henüz bilinmiyor.</Empty>
          : <Loader state={table}>{(d) => <StandingsTable data={d} highlight={[team.id]} onTeam={(r) => nav.push('Team', { team: r.team })} />}</Loader>
      )}
    </Screen>
  );
}
