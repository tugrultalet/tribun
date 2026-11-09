import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Fixture, Squad, Standings, TeamData, useApi } from '../api';
import { dayLabel } from '../dates';
import { RootParams, useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Card, Crest, Empty, Loader, Note, Section, StandingsTable, Tabs, HAIR } from '../ui';
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
    <Screen team={team.name}>
      <View style={{ alignItems: 'center', gap: 8, paddingTop: 4, paddingBottom: 18 }}>
        <Crest uri={team.logo} size={64} />
        <Text style={{ fontWeight: '700', fontSize: 26, lineHeight: 30, letterSpacing: -0.3, color: t.fg, textAlign: 'center' }}>{team.name}</Text>
        {league && <Text style={{ fontSize: 13, color: t.muted }}>{league.name}</Text>}
        <Pressable onPress={() => store.toggleTeam(team)} accessibilityRole="button" accessibilityState={{ selected: on }}
          style={{ marginTop: 6, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 99, backgroundColor: on ? t.accent : 'transparent', borderWidth: 1, borderColor: t.accent }}>
          <Text style={{ fontWeight: '700', fontSize: 13, color: on ? t.accentInk : t.accent }}>{on ? '✓ Takip ediliyor' : '+ Takip et'}</Text>
        </Pressable>
      </View>
      <Tabs value={tab} onChange={setTab} options={[['matches', 'Maçlar'], ['squad', 'Kadro'], ['table', 'Tablo']]} />
      {tab === 'matches' && (
        <Loader state={info}>
          {(d) => {
            // Önce canlı ve yaklaşan maçlar (yakından uzağa), sonra oynananlar (yeniden eskiye).
            const upcoming = d.fixtures.filter((f) => f.st === 'live' || f.st === 'ns');
            const played = d.fixtures.filter((f) => f.st !== 'live' && f.st !== 'ns').reverse();
            return <FixtureDays data={{ ...d, fixtures: [...upcoming, ...played] }} today={store.meta.today} onMatch={openMatch} showLeague />;
          }}
        </Loader>
      )}
      {tab === 'squad' && (
        <Loader state={squad}>
          {(d) => (
            <>
              {d.from && <Note>Son maç kadrosu: {dayLabel(d.from.date, store.meta.today)}, {d.from.rival} maçının ilk 11'i ve yedekleri.</Note>}
              {!d.players.length && <Empty>Bu takım için henüz kadro bilgisi yok.</Empty>}
              {GROUPS.map(([key, label]) => {
                const players = d.players.filter((p) => p.pos === key);
                if (!players.length) return null;
                return (
                  <Section key={key} eyebrow={label} right={<Text style={{ fontSize: 12.5, color: t.muted }}>{players.length} oyuncu</Text>}>
                    <Card>
                      {players.map((p, i) => (
                        <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: i ? HAIR : 0, borderColor: t.line }}>
                          <Text style={{ width: 28, textAlign: 'center', fontWeight: '600', fontSize: 19, color: t.muted }}>{p.no ?? '–'}</Text>
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
