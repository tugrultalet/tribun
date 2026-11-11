import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { providerName } from '../auth';
import { useMyPicks, useOpenMatches, usePoints, useResults } from '../game/hooks';
import { ActivePicks, SummaryCard, splitPicks } from '../game/PicksView';
import { FriendsSection } from '../game/Friends';
import { summary } from '../game/profile';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Card, Crest, Empty, HAIR, Icon, Section } from '../ui';
import { Screen } from './Screen';
import { RestoreBlock } from './SignIn';

// Profil: hesap kartı, özet, aktif tahminler, geçmiş tahminlere giriş ve Takımlarım. Ayarlar sağ üstteki dişliden açılır.
export default function Profile() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const picks = useMyPicks(60000);
  const all = picks.data ?? [];
  const results = useResults(all);
  const open = useOpenMatches(all);
  const ledger = usePoints();
  const { active, past } = useMemo(() => splitPicks(all, results, open), [all, results.size, open.size]);
  const exact = useMemo(() => summary(past, results, Date.now(), ledger).exact, [past, results.size, ledger]);
  const gear = (
    <Pressable onPress={() => nav.navigate('Settings')} accessibilityRole="button" accessibilityLabel="Ayarlar" hitSlop={10} style={{ padding: 6 }}>
      <Icon.tabSettings color={t.fg} />
    </Pressable>
  );
  const row = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 12, paddingHorizontal: 14 };
  return (
    <Screen tab title="Profilim" right={gear} onRefresh={picks.reload}>
      {store.me ? (
        <Card style={{ marginTop: 4 }}>
          <Pressable onPress={() => nav.navigate('Account')} accessibilityRole="button" accessibilityLabel="Hesap"
            style={({ pressed }) => ({ ...row, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
            <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accentSoft }}>
              <Text style={{ fontSize: 19, fontWeight: '800', color: t.fg }}>{store.me.name.slice(0, 1).toLocaleUpperCase('tr')}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '700', color: t.fg }}>{store.me.name}</Text>
              <Text numberOfLines={1} style={{ fontSize: 12.5, color: store.me.provider ? t.muted : t.accent, marginTop: 2 }}>
                {store.me.provider ? `${providerName(store.me.provider)} hesabına bağlı` : 'Hesabını bağla, telefon değişince kaybolmasın'}
              </Text>
            </View>
            <Icon.chevron color={t.fg} />
          </Pressable>
        </Card>
      ) : <><Empty>Tahmin yapmak ve puan toplamak için Tribün sekmesinden bir takma ad seç.</Empty><RestoreBlock /></>}

      {store.me && <View style={{ marginTop: 12 }}><SummaryCard picks={all} /></View>}

      {store.me && (
        <Section eyebrow="Aktif tahminler">
          <ActivePicks picks={active} open={open} onDeleted={picks.reload} />
          {past.length > 0 && (
            <Card style={{ marginTop: 10 }}>
              <Pressable onPress={() => nav.navigate('PickHistory')} accessibilityRole="button"
                style={({ pressed }) => ({ ...row, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, color: t.fg }}>Geçmiş tahminlerim</Text>
                  <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 2 }}>{past.length} tahmin · {exact} tam skor</Text>
                </View>
                <Icon.chevron color={t.fg} />
              </Pressable>
            </Card>
          )}
        </Section>
      )}

      {store.me && <FriendsSection />}

      <Section eyebrow="Takımlarım" right={
        <Pressable onPress={() => nav.navigate('MyTeams')} accessibilityRole="button" hitSlop={8}><Text style={{ color: t.accent, fontWeight: '600', fontSize: 14 }}>Düzenle</Text></Pressable>
      }>
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
          <Pressable onPress={() => nav.navigate('Picker')} accessibilityRole="button"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: store.teams.length ? HAIR : 0, borderColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
            <View style={{ width: 28, alignItems: 'center' }}><Text style={{ fontSize: 20, color: t.accent, fontWeight: '600' }}>+</Text></View>
            <Text style={{ flex: 1, fontSize: 15, color: t.accent, fontWeight: '600' }}>Takım ekle</Text>
          </Pressable>
        </Card>
      </Section>
    </Screen>
  );
}
