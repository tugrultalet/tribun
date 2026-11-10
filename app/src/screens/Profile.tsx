import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useMyPicks } from '../game/hooks';
import { PicksList, SummaryCard } from '../game/PicksView';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Card, Crest, Empty, HAIR, Icon, Section } from '../ui';
import { Screen } from './Screen';
import { KeepAccountCard, RestoreBlock } from './SignIn';

// Profil: özet (sezon puanı, isabet, seri, rozetler), Tahminlerim ve Takımlarım. Ayarlar sağ üstteki dişliden açılır.
export default function Profile() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const picks = useMyPicks(60000);
  const gear = (
    <Pressable onPress={() => nav.navigate('Settings')} accessibilityRole="button" accessibilityLabel="Ayarlar" hitSlop={10} style={{ padding: 6 }}>
      <Icon.tabSettings color={t.fg} />
    </Pressable>
  );
  return (
    <Screen tab title={store.me?.name ?? 'Profil'} right={gear} onRefresh={picks.reload}>
      {store.me ? <SummaryCard picks={picks.data ?? []} /> : <Empty>Tahmin yapmak ve puan toplamak için Gruplar sekmesinden bir takma ad seç.</Empty>}
      {store.me && !store.me.provider && <KeepAccountCard />}
      {!store.me && <RestoreBlock />}
      {store.me && <PicksList picks={picks.data ?? []} />}
      <Section eyebrow="Takımlarım" right={
        <Pressable onPress={() => nav.navigate('MyTeams')} accessibilityRole="button" hitSlop={8}><Text style={{ color: t.accent, fontWeight: '600', fontSize: 14 }}>Düzenle</Text></Pressable>
      }>
        {store.teams.length ? (
          <Card>
            {[...store.teams].sort((a, b) => Number(b.id === store.main) - Number(a.id === store.main)).map((team, i) => (
              <Pressable key={team.id} onPress={() => nav.navigate('Team', { team })} accessibilityRole="button"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: i ? HAIR : 0, borderColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
                <Crest uri={team.logo} size={28} />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: t.fg }}>{team.name}</Text>
                {team.id === store.main && <Text style={{ color: t.accent, fontSize: 15 }}>★</Text>}
                <Icon.chevron color={t.fg} />
              </Pressable>
            ))}
          </Card>
        ) : <Empty>Henüz takım takip etmiyorsun.</Empty>}
      </Section>
    </Screen>
  );
}
