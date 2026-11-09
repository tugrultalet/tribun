import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Team, TeamData, useApi } from '../api';
import { dayLabel } from '../dates';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Button, Card, Crest, Empty, Icon, LeagueBadge, Section, StarButton, statusText, HAIR } from '../ui';
import { Screen } from './Screen';

export default function MyTeams() {
  const nav = useNav();
  const { teams, leagues, league, toggleLeague } = useStore();
  const t = useTheme();
  return (
    <Screen title="Takımlarım">
      {teams.length ? <Card style={{ marginTop: 4 }}>{teams.map((team, i) => <Row key={team.id} team={team} first={i === 0} />)}</Card> : <Empty>Henüz takım takip etmiyorsun.</Empty>}
      <View style={{ marginTop: 20 }}><Button kind="sec" label="+ Takım ekle (kulüp ya da milli takım)" onPress={() => nav.navigate('Picker')} /></View>
      <Section eyebrow="Takip ettiğin turnuvalar">
        {leagues.length ? (
          <Card>
            {leagues.map((id, i) => {
              const l = league(id);
              return (
                <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 14, paddingRight: 8, borderTopWidth: i ? HAIR : 0, borderColor: t.line }}>
                  <LeagueBadge id={id} size={34} />
                  <Text style={{ flex: 1, fontWeight: '600', fontSize: 15, color: t.fg }}>{l?.name ?? 'Turnuva'}</Text>
                  <StarButton on onPress={() => toggleLeague(id)} label={`${l?.name} takibi bırak`} />
                </View>
              );
            })}
          </Card>
        ) : <Text style={{ color: t.muted, fontSize: 13, lineHeight: 19, paddingHorizontal: 2 }}>Henüz turnuva takip etmiyorsun. Turnuva sekmesinde yıldıza dokunursan o turnuvanın yakın tarihli tüm maçları ana ekranda görünür.</Text>}
        <View style={{ marginTop: 12 }}><Button kind="sec" label="+ Turnuva ekle" onPress={() => nav.navigate('Tabs', { screen: 'Leagues' })} /></View>
      </Section>
      <Empty>Maçlarım sekmesinde takip ettiğin takımların bütün yarışmalardaki maçları ve takip ettiğin turnuvaların yakın maçları görünür.</Empty>
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
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: first ? 0 : HAIR, borderColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
      <Crest uri={team.logo} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '600', fontSize: 15, color: t.fg }}>{team.name}</Text>
        <Text numberOfLines={1} style={{ fontSize: 12.5, color: t.muted }}>{sub}</Text>
      </View>
      <Icon.chevron color={t.fg} />
    </Pressable>
  );
}
