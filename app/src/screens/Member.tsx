import React, { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TeamData, useApi } from '../api';
import { usePoints, useResults } from '../game/hooks';
import { PicksList } from '../game/PicksView';
import { summary } from '../game/profile';
import type { MyPick } from '../game/stats';
import { useNav, type RootParams } from '../nav';
import { rpc, useRpc } from '../social';
import { useStore } from '../store';
import { track } from '../telemetry';
import { useTheme } from '../theme';
import { Card, Crest, Empty, HAIR, Loader } from '../ui';
import { Screen } from './Screen';

type Profile = { name?: string; team?: number | null; since?: string; friend?: boolean; friends?: number; won?: number; lost?: number; common?: number; picks?: MyPick[]; error?: string };
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// Arkadaşın profili: Profilim ile aynı düzen. Profil kartı (avatar ve köşesinde tuttuğu takımın logosu, ad, kısa bilgi,
// Puan · Tahmin · Arkadaş, buton), ince "Kafa kafaya" kartı ve tahminleri (başlamamış maçlar gizli). Arkadaşsa
// "Arkadaşlıktan çıkar", ortak tribündense "Arkadaş ekle". Profil yalnızca arkadaşlara ve ortak tribündekilere açık.
export default function Member({ route }: NativeStackScreenProps<RootParams, 'Member'>) {
  const secret = useStore().me?.secret;
  const state = useRpc<Profile>('member_profile', secret ? { p_secret: secret, p_profile: route.params.id } : null);
  return (
    <Screen title={route.params.name} onRefresh={state.reload}>
      <Loader state={state}>
        {(d) => (d.error ? <Empty>{d.error}</Empty> : <Body d={d} id={route.params.id} fallbackName={route.params.name} secret={secret!} reload={state.reload} />)}
      </Loader>
    </Screen>
  );
}

function Body({ d, id, fallbackName, secret, reload }: { d: Profile; id: string; fallbackName: string; secret: string; reload: () => void }) {
  const t = useTheme();
  const nav = useNav();
  const name = d.name ?? fallbackName;
  const picks = Array.isArray(d.picks) ? d.picks : [];
  const results = useResults(picks);
  const ledger = usePoints(id);
  const s = useMemo(() => summary(picks, results, Date.now(), ledger), [picks, results.size, ledger]);
  const team = useApi<TeamData>(d.team ? `/api/team/${d.team}` : null).data?.team;
  const since = d.since ? new Date(d.since) : null;
  const [busy, setBusy] = useState(false);

  const removeFriend = () => {
    const go = () => { setBusy(true); rpc('remove_friend', { p_secret: secret, p_profile: id }).then(() => { track('friend_removed'); nav.goBack(); }, () => setBusy(false)); };
    const msg = `${name} arkadaşlarından çıkarılsın mı? Ortak bir tribününüz yoksa birbirinizin tahminlerini görmezsiniz.`;
    if (Platform.OS === 'web') { if (globalThis.confirm?.(msg)) go(); return; }
    Alert.alert('Arkadaşlıktan çıkar', msg, [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Çıkar', style: 'destructive', onPress: go }]);
  };
  const addFriend = () => {
    setBusy(true);
    rpc('befriend_member', { p_secret: secret, p_profile: id }).then(() => { track('friend_added_member'); reload(); }, (e) => Alert.alert('Eklenemedi', (e as Error).message)).finally(() => setBusy(false));
  };

  const stat = (value: number | string, label: string) => (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: t.fg, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ fontSize: 12, color: t.muted }}>{label}</Text>
    </View>
  );
  const won = d.won ?? 0, lost = d.lost ?? 0;

  return (
    <>
      {/* Profil kartı (Profilim ile aynı): avatar ve köşesinde tuttuğu takımın logosu, ad, kısa bilgi, sayılar, buton */}
      <Card style={{ marginTop: 4, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 72, height: 72 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accentSoft }}>
              <Text style={{ fontSize: 30, fontWeight: '800', color: t.fg }}>{name.slice(0, 1).toLocaleUpperCase('tr')}</Text>
            </View>
            {team ? (
              <View style={{ position: 'absolute', right: -4, bottom: -4, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, borderWidth: 2, borderColor: t.line }}>
                <Crest uri={team.logo} size={20} />
              </View>
            ) : null}
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text numberOfLines={1} style={{ fontSize: 19, fontWeight: '800', color: t.fg }}>{name}</Text>
            {team ? (
              <Pressable onPress={() => nav.navigate('Team', { team })} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Crest uri={team.logo} size={15} />
                <Text numberOfLines={1} style={{ fontSize: 12.5, color: t.muted }}>{team.name} taraftarı</Text>
              </Pressable>
            ) : null}
            {since ? <Text style={{ fontSize: 12.5, color: t.muted }}>{MONTHS[since.getMonth()]} {since.getFullYear()}'dan beri Tribün'de</Text> : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', marginTop: 14, paddingVertical: 10, borderTopWidth: HAIR, borderBottomWidth: HAIR, borderColor: t.line }}>
          {stat(s.total, 'Puan')}
          <View style={{ width: HAIR, backgroundColor: t.line }} />
          {stat(picks.length, 'Tahmin')}
          <View style={{ width: HAIR, backgroundColor: t.line }} />
          {stat(d.friends ?? 0, 'Arkadaş')}
        </View>
        <View style={{ marginTop: 12 }}>
          {d.friend ? (
            <Pressable onPress={removeFriend} disabled={busy} accessibilityRole="button"
              style={({ pressed }) => ({ alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: pressed ? t.line : t.surface2, opacity: busy ? 0.6 : 1 })}>
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: t.fg }}>✓ Arkadaşsınız · Arkadaşlıktan çıkar</Text>
            </Pressable>
          ) : (
            <Pressable onPress={addFriend} disabled={busy} accessibilityRole="button"
              style={({ pressed }) => ({ alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: pressed ? '#1DA851' : '#25D366', opacity: busy ? 0.6 : 1 })}>
              <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#05301A' }}>➕ Arkadaş ekle</Text>
            </Pressable>
          )}
        </View>
      </Card>

      {/* İnce kart: kafa kafaya (ikinizin de tahmin yaptığı biten maçlar) */}
      <Card style={{ marginTop: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.fg }}>Kafa kafaya</Text>
          {d.common ? (
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: t.fg, fontVariant: ['tabular-nums'] }}>
                <Text style={{ color: won > lost ? t.win : t.fg }}>Sen {won}</Text> – <Text style={{ color: lost > won ? t.win : t.fg }}>{lost} {name}</Text>
              </Text>
              <Text style={{ fontSize: 11.5, color: t.muted }}>Ortak {d.common} maç · {d.common - won - lost} berabere</Text>
            </View>
          ) : <Text style={{ flex: 1, textAlign: 'right', fontSize: 12.5, color: t.muted }}>Henüz ortak maç yok</Text>}
        </View>
      </Card>

      {/* Tahminleri: yalnızca başlamış maçlar (başlamamışlar maç başlayınca görünür) */}
      <Text style={{ fontSize: 12.5, fontWeight: '700', letterSpacing: 0.4, color: t.muted, marginTop: 18, marginBottom: 8, marginHorizontal: 4 }}>TAHMİNLERİ</Text>
      {picks.length ? <PicksList picks={picks} profile={id} bare /> : <Empty>Başlamış maçlarda tahmini yok. Başlamamış maçların tahminleri maç başlayınca görünür.</Empty>}
    </>
  );
}
