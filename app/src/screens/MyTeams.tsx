import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { TeamData, useApi } from '../api';
import { dayLabel } from '../dates';
import { Competition, FollowedTeam, competitionsOf, euroIds, selectionOf } from '../follow';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Button, Card, Crest, Empty, Icon, StarButton, SwipeRow, statusText, HAIR } from '../ui';
import { Screen } from './Screen';

// Takımlarım: ana takım (★) en üstte; her takımın altında o takımın turnuvaları çip olarak, tek dokunuşla açılıp kapanır.
// Sola kaydırınca takipten çıkar. Başka bir takımın ★'ına dokunmak onu ana takım yapar.
export default function MyTeams() {
  const nav = useNav();
  const { teams, main } = useStore();
  const ordered = [...teams].sort((a, b) => Number(b.id === main) - Number(a.id === main));
  return (
    <Screen title="Takımlarım">
      {ordered.length ? <Card style={{ marginTop: 4 }}>{ordered.map((team, i) => <Row key={team.id} team={team} first={i === 0} />)}</Card> : <Empty>Henüz takım takip etmiyorsun.</Empty>}
      <View style={{ marginTop: 20 }}><Button kind="sec" label="+ Takım ekle (kulüp ya da milli takım)" onPress={() => nav.navigate('Picker')} /></View>
      <Empty>Maçlarım sekmesinde takımlarının seçili turnuvalardaki maçları görünür. Ana takım ★: renk teması ve öncelikli bildirimler onundur. Takımı sola kaydırarak takipten çıkarabilirsin.</Empty>
    </Screen>
  );
}

function Row({ team, first }: { team: FollowedTeam; first: boolean }) {
  const t = useTheme();
  const nav = useNav();
  const { meta, league, main, setMain, setTeamSel, toggleTeam } = useStore();
  const isMain = team.id === main;
  const { data } = useApi<TeamData>(`/api/team/${team.id}`);
  const euro = React.useMemo(() => euroIds(meta.leagues), [meta.leagues]);
  const next = data?.fixtures.find((f) => f.st === 'live') || data?.fixtures.find((f) => f.st === 'ns');
  const rival = next && (next.h.id === team.id ? next.a : next.h);
  let sub: React.ReactNode = isMain ? 'Ana takım' : team.kind === 'national' ? 'Milli takım' : '';
  if (next && rival) {
    sub = next.st === 'live'
      ? <Text style={{ color: t.live, fontWeight: '700' }}>Canlı · {next.s ? `${next.s[0]}–${next.s[1]}` : ''} · {statusText(next)}</Text>
      : `Sıradaki: ${rival.name} · ${dayLabel(next.date, meta.today)} ${next.time}`;
  }
  const comps: Competition[] = data ? competitionsOf(team.id, data.fixtures) : [];
  const sel = selectionOf(team, isMain, comps.map((c) => c.id), euro);
  const toggle = (id: number) => setTeamSel(team.id, sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);

  return (
    <View style={{ borderTopWidth: first ? 0 : HAIR, borderColor: t.line }}>
      <SwipeRow label="Çıkar" onAction={() => toggleTeam(team)}>
        <View>
          <Pressable onPress={() => nav.navigate('Team', { team })} accessibilityRole="button" accessibilityLabel={team.name}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: comps.length ? 6 : 12, paddingLeft: 14, paddingRight: 4, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
            <Crest uri={team.logo} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', fontSize: 15, color: t.fg }}>{team.name}</Text>
              <Text numberOfLines={1} style={{ fontSize: 12.5, color: t.muted }}>{sub}</Text>
            </View>
            <StarButton on={isMain} onPress={() => setMain(team.id)} label={isMain ? `${team.name} ana takım` : `${team.name} takımını ana takım yap`} />
            <Icon.chevron color={t.fg} />
          </Pressable>
          {comps.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingBottom: 12 }}>
              {comps.map((c) => {
                const on = sel.includes(c.id);
                const name = league(c.id)?.name ?? c.name;
                return (
                  <Pressable key={c.id} onPress={() => toggle(c.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${team.name}: ${name}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 99, backgroundColor: on ? t.accentSoft : t.surface2, borderWidth: 1, borderColor: on ? t.accent : 'transparent' }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? t.fg : t.muted }}>{name}</Text>
                    {on && <Icon.check color={t.accent} size={11} />}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </SwipeRow>
    </View>
  );
}
