import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Team, TeamData, useApi } from '../api';
import { dayLabel } from '../dates';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Button, Card, Crest, Empty, Icon, ScreenTitle, statusText } from '../ui';
import { Screen } from './Screen';

export default function MyTeams() {
  const nav = useNav();
  const { teams } = useStore();
  return (
    <Screen header={<ScreenTitle title="Takımlarım" />}>
      {teams.length ? <Card style={{ marginTop: 4 }}>{teams.map((team, i) => <Row key={team.id} team={team} first={i === 0} />)}</Card> : <Empty>Henüz takım takip etmiyorsun.</Empty>}
      <View style={{ marginTop: 20 }}><Button kind="sec" label="+ Takım ekle" onPress={() => nav.navigate('Picker')} /></View>
      <Empty>Maçlarım sekmesinde yalnızca burada takip ettiğin takımların maçları görünür.</Empty>
    </Screen>
  );
}

function Row({ team, first }: { team: Team; first: boolean }) {
  const t = useTheme();
  const nav = useNav();
  const { meta, league } = useStore();
  const { data } = useApi<TeamData>(`/api/team/${team.id}`, 60000);
  const next = data?.fixtures.find((f) => f.st === 'live') || data?.fixtures.find((f) => f.st === 'ns');
  const rival = next && (next.h.id === team.id ? next.a : next.h);
  let sub: React.ReactNode = data?.league ? league(data.league)?.name : '';
  if (next && rival) {
    sub = next.st === 'live'
      ? <Text style={{ color: t.live, fontWeight: '700' }}>Canlı · {next.s ? `${next.s[0]}–${next.s[1]}` : ''} · {statusText(next)}</Text>
      : `Sıradaki: ${rival.name} · ${dayLabel(next.date, meta.today)} ${next.time}`;
  }
  return (
    <Pressable onPress={() => nav.navigate('Team', { team })} accessibilityRole="button" accessibilityLabel={team.name}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: first ? 0 : 1, borderColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
      <Crest uri={team.logo} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '600', fontSize: 15, color: t.fg }}>{team.name}</Text>
        <Text numberOfLines={1} style={{ fontSize: 12.5, color: t.muted }}>{sub}</Text>
      </View>
      <Icon.chevron color={t.fg} />
    </Pressable>
  );
}
