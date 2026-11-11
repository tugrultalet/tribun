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
import { teamColor } from '../teamColors';
import { track } from '../telemetry';
import { useTheme } from '../theme';
import { Crest, Empty, Loader } from '../ui';
import { Screen } from './Screen';

type Profile = { name?: string; team?: number | null; since?: string; friend?: boolean; friends?: number; won?: number; lost?: number; common?: number; picks?: MyPick[]; error?: string };
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// Arkadaşın profili: Profilim ile aynı sosyal düzen. Avatar (tuttuğu takımın renginde halka), Puan · Tahmin · Arkadaş,
// kısa bilgi, rozetler, kafa kafaya ("Sen 7 – 4 Ahmet") ve geçmiş tahminleri (başlamamış maçlar gizli). Arkadaşsa
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
  const ring = teamColor(team?.name) ?? t.accent;
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

  const stat = (value: number | string, label: string, tone?: string) => (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: tone ?? t.fg, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ fontSize: 12, color: t.muted }}>{label}</Text>
    </View>
  );
  const badge = (icon: string, line1: string, line2: string, on: boolean) => (
    <View key={icon} style={{ width: 64, alignItems: 'center', gap: 4 }} accessibilityLabel={`${line1} ${line2}${on ? '' : ' (henüz yok)'}`}>
      <View style={{ width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
        borderColor: on ? '#FDB912' : t.line, backgroundColor: on ? 'rgba(253,185,18,0.14)' : t.surface, opacity: on ? 1 : 0.55 }}>
        <Text style={{ fontSize: 23 }}>{icon}</Text>
      </View>
      <Text style={{ fontSize: 10.5, lineHeight: 13, color: t.muted, textAlign: 'center' }}>{line1}{'\n'}{line2}</Text>
    </View>
  );
  const won = d.won ?? 0, lost = d.lost ?? 0;

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, padding: 3, backgroundColor: ring }}>
          <View style={{ flex: 1, borderRadius: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, borderWidth: 3, borderColor: t.bg }}>
            <Text style={{ fontSize: 32, fontWeight: '800', color: t.fg }}>{name.slice(0, 1).toLocaleUpperCase('tr')}</Text>
          </View>
        </View>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {stat(s.total, 'Puan')}
          {stat(picks.length, 'Tahmin')}
          {stat(d.friends ?? 0, 'Arkadaş')}
        </View>
      </View>

      <Text style={{ fontSize: 16, fontWeight: '800', color: t.fg, marginTop: 12 }}>{name}</Text>
      <Text style={{ fontSize: 13, color: t.muted, marginTop: 2, lineHeight: 18 }}>
        {[team ? `${team.name} taraftarı` : null, since ? `${MONTHS[since.getMonth()]} ${since.getFullYear()}'dan beri Tribün'de` : null].filter(Boolean).join(' · ')}
      </Text>
      {team && (
        <Pressable onPress={() => nav.navigate('Team', { team })} accessibilityRole="button" accessibilityLabel={team.name} style={{ alignSelf: 'flex-start', marginTop: 8, padding: 3, borderRadius: 7, backgroundColor: t.surface2 }}>
          <Crest uri={team.logo} size={20} />
        </Pressable>
      )}

      <View style={{ marginTop: 14 }}>
        {d.friend ? (
          <Pressable onPress={removeFriend} disabled={busy} accessibilityRole="button"
            style={({ pressed }) => ({ alignItems: 'center', paddingVertical: 9, borderRadius: 10, backgroundColor: pressed ? t.line : t.surface2, opacity: busy ? 0.6 : 1 })}>
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: t.fg }}>✓ Arkadaşsınız · Arkadaşlıktan çıkar</Text>
          </Pressable>
        ) : (
          <Pressable onPress={addFriend} disabled={busy} accessibilityRole="button"
            style={({ pressed }) => ({ alignItems: 'center', paddingVertical: 9, borderRadius: 10, backgroundColor: pressed ? '#1DA851' : '#25D366', opacity: busy ? 0.6 : 1 })}>
            <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#05301A' }}>➕ Arkadaş ekle</Text>
          </Pressable>
        )}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
        {badge('🔥', s.streak ? `${s.streak} maç` : 'Seri', 'seri', s.streak >= 3)}
        {badge('🎯', s.played ? `%${Math.round(s.rate * 100)}` : '–', 'isabet', s.played >= 5 && s.rate >= 0.5)}
        {badge('⚽', `${s.exact} tam`, 'skor', s.exact > 0)}
        {badge('📈', `${s.played}`, 'puanlı maç', s.played >= 10)}
      </View>

      {/* Kafa kafaya: ikinizin de tahmin yaptığı biten maçlar */}
      <View style={{ marginTop: 16, padding: 14, borderRadius: 16, backgroundColor: t.surface, alignItems: 'center', gap: 4 }}>
        <Text style={{ fontSize: 12.5, fontWeight: '700', letterSpacing: 0.4, color: t.muted }}>KAFA KAFAYA</Text>
        {d.common ? (
          <>
            <Text style={{ fontSize: 26, fontWeight: '800', color: t.fg, fontVariant: ['tabular-nums'] }}>
              <Text style={{ color: won > lost ? t.win : t.fg }}>Sen {won}</Text>
              <Text style={{ color: t.muted }}>  –  </Text>
              <Text style={{ color: lost > won ? t.win : t.fg }}>{lost} {name}</Text>
            </Text>
            <Text style={{ fontSize: 12.5, color: t.muted }}>Ortak {d.common} maç · {d.common - won - lost} berabere</Text>
          </>
        ) : <Text style={{ fontSize: 13.5, color: t.muted, textAlign: 'center' }}>Henüz ikinizin de tahmin yaptığı biten bir maç yok.</Text>}
      </View>

      {picks.length ? <PicksList title="Tahminleri" profile={id} picks={picks} /> : <Empty>Başlamış maçlarda tahmini yok. Başlamamış maçların tahminleri maç başlayınca görünür.</Empty>}
    </>
  );
}
