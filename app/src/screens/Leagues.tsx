import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { League } from '../api';
import { useNav } from '../nav';
import { useStore } from '../store';
import { LEAGUE_GROUPS } from '../leagueGroups';
import { useTheme } from '../theme';
import { Card, Empty, Icon, LeagueBadge, Section, StarButton, HAIR } from '../ui';
import { Screen } from './Screen';

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.surface2, borderRadius: 12, paddingHorizontal: 12, height: 40 }}>
      <Icon.search color={t.muted} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={t.muted} autoCorrect={false} accessibilityLabel={placeholder}
        style={{ flex: 1, fontSize: 15, color: t.fg, paddingVertical: 0 }} />
    </View>
  );
}

export default function Leagues() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const [q, setQ] = useState('');
  const needle = q.trim().toLocaleLowerCase('tr');
  const match = (l: League) => !needle || l.name.toLocaleLowerCase('tr').includes(needle) || l.country.toLocaleLowerCase('tr').includes(needle);
  const all = store.meta.leagues.filter(match);
  const row = (l: League, i: number) => (
    <Pressable key={l.id} onPress={() => nav.navigate('League', { id: l.id })} accessibilityRole="button" accessibilityLabel={l.name}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 14, paddingRight: 8, borderTopWidth: i ? HAIR : 0, borderColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
      <LeagueBadge id={l.id} size={34} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '600', fontSize: 15, color: t.fg }}>{l.name}</Text>
        <Text style={{ fontSize: 12.5, color: t.muted }}>{l.country}</Text>
      </View>
      <Icon.chevron color={t.muted} />
    </Pressable>
  );
  const group = (title: string, list: League[]) => list.length > 0 && <Section eyebrow={title}><Card>{list.map(row)}</Card></Section>;
  return (
    <Screen tab title="Keşfet">
      <SearchBox value={q} onChange={setQ} placeholder="Lig, kupa veya ülke ara" />
      {LEAGUE_GROUPS.map(([type, title]) => <React.Fragment key={type}>{group(title, all.filter((l) => l.type === type))}</React.Fragment>)}
      {!all.length && <Empty>Eşleşen lig yok.</Empty>}
    </Screen>
  );
}
