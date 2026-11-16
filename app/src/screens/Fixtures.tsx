import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Fixture, Mine, useApi } from '../api';
import { dayLabel } from '../dates';
import { euroIds, followedFixtures } from '../follow';
import { RootParams, useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Card, Crest, Empty, Loader, MatchRow, Seg } from '../ui';
import { Screen } from './Screen';

// Takip edilen takımların tüm fikstürü (Maçlarım'daki "Tüm fikstür ›" / "Tüm sonuçlar ›"). Üstte Fikstür | Sonuçlar,
// altında takım süzgeci (Tümü ya da tek takım); maçlar günlere ayrılır, satırlar tek satırlık ve dar.
export default function Fixtures({ route }: NativeStackScreenProps<RootParams, 'Fixtures'>) {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const [tab, setTab] = useState<'next' | 'past'>(route.params?.tab ?? 'next');
  const [team, setTeam] = useState<number | null>(null);
  const ids = store.teams.map((x) => x.id);
  const state = useApi<Mine>(ids.length ? `/api/mine?teams=${ids.join(',')}` : null, 120000);
  const euro = useMemo(() => euroIds(store.meta.leagues), [store.meta.leagues]);
  const list = useMemo(() => {
    const all = followedFixtures(state.data?.fixtures ?? [], store.teams, store.main, euro)
      .filter((f) => team == null || f.h.id === team || f.a.id === team);
    return tab === 'next'
      ? all.filter((f) => f.st === 'ns' || f.st === 'live').sort((a, b) => a.ts - b.ts)
      : all.filter((f) => f.st === 'ft').sort((a, b) => b.ts - a.ts);
  }, [state.data, store.teams, store.main, euro, team, tab]);
  const days = useMemo(() => {
    const out: { date: string; items: Fixture[] }[] = [];
    for (const f of list) {
      const last = out[out.length - 1];
      if (last && last.date === f.date) last.items.push(f); else out.push({ date: f.date, items: [f] });
    }
    return out;
  }, [list]);
  const chip = (key: number | null, label: string, logo?: string) => {
    const on = team === key;
    return (
      <Pressable key={String(key)} onPress={() => setTeam(key)} accessibilityRole="button" accessibilityState={{ selected: on }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 99, backgroundColor: on ? t.fg : t.surface2 }}>
        {logo ? <Crest uri={logo} size={16} /> : null}
        <Text style={{ fontSize: 13, fontWeight: '600', color: on ? t.bg : t.fg }}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <Screen title="Fikstür" onRefresh={state.reload}>
      <Seg style={{ marginTop: 4 }} value={tab} onChange={setTab} options={[['next', 'Fikstür'], ['past', 'Sonuçlar']]} />
      {store.teams.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {chip(null, 'Tümü')}
          {store.teams.map((x) => chip(x.id, x.name, x.logo))}
        </View>
      )}
      {!store.teams.length ? <Empty>Henüz takım takip etmiyorsun.</Empty> : <Loader state={state}>
        {() => days.length ? (
          <>
            {days.map((d) => (
              <View key={d.date}>
                <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: t.muted, marginTop: 14, marginBottom: 6, marginHorizontal: 4 }}>
                  {dayLabel(d.date, store.meta.today).toLocaleUpperCase('tr')}
                </Text>
                <Card style={{ paddingVertical: 2 }}>
                  {d.items.map((f) => <MatchRow key={f.id} f={f} compact onPress={() => nav.navigate('Match', { id: f.id })} />)}
                </Card>
              </View>
            ))}
          </>
        ) : <Empty>{tab === 'next' ? 'Takip ettiğin takımların yaklaşan maçı yok.' : 'Henüz sonuç yok.'}</Empty>}
      </Loader>}
    </Screen>
  );
}
