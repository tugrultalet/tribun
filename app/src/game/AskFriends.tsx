import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, Share, Text, View } from 'react-native';
import type { Fixture } from '../api';
import { useNav } from '../nav';
import { rpc, type Group } from '../social';
import { useStore } from '../store';
import { track } from '../telemetry';
import { useTheme } from '../theme';
import { askMessage } from './ask';

type AskResult = { token: string };

// Tahmini girdikten sonra iki eylem:
//  - "Arkadaşlarına sor" (yeşil): WhatsApp'tan maç kartıyla bağlantı; bağlantıdan gelip tahmin yapan arkadaşın olur.
//  - "Sohbet grubu oluştur": yalnızca bu maça özel bir grup kurar (odası maçtan 1 saat önce açılır, maç bitince kapanır,
//    grup maçtan 7 gün sonra silinir) ve davet ekranını açar. Hesap ister.
// Gruplardaki arkadaşlara bildirim artık düğmesiz: tahmin kaydedilince ilgili gruplara kendiliğinden gider (PickCard).
export function AskFriends({ f, secret, pick }: { f: Fixture; secret: string; pick: { h: number; a: number } }) {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const [busy, setBusy] = useState<'' | 'ask' | 'group'>('');
  const [msg, setMsg] = useState('');

  const whatsapp = async () => {
    setBusy('ask'); setMsg('');
    try {
      const r = await rpc<AskResult>('ask_friends', { p_secret: secret, p_match: f.id, p_show: true, p_home: f.h.name, p_away: f.a.name, p_group: null, p_notify: false });
      const text = askMessage({ home: f.h.name, away: f.a.name, pick, token: r.token });
      track('ask_shared', { channel: 'whatsapp' });
      try { await Linking.openURL(Platform.OS === 'web' ? `https://wa.me/?text=${encodeURIComponent(text)}` : `whatsapp://send?text=${encodeURIComponent(text)}`); }
      catch { await Share.share({ message: text }).catch(() => {}); }
    } catch (e) { setMsg((e as { message?: string }).message ?? 'Gönderilemedi.'); } finally { setBusy(''); }
  };

  const chatGroup = async () => {
    if (!store.me?.provider) {
      const go = () => nav.navigate('Account');
      if (Platform.OS === 'web') { if (globalThis.confirm?.('Sohbet grubu kurmak için hesabını bağla. Hesap ekranına gidilsin mi?')) go(); return; }
      Alert.alert('Hesabını bağla', 'Sohbet grubu kurmak için Apple ya da e-postayla hesabını bağla.', [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Hesap', onPress: go }]);
      return;
    }
    setBusy('group'); setMsg('');
    try {
      const title = `${f.h.name} – ${f.a.name}`;
      const g = await rpc<Group>('create_group', {
        p_secret: secret, p_name: title.slice(0, 40), p_team_id: f.h.id, p_team_name: title.slice(0, 80), p_team_logo: f.h.logo,
        p_scope: { type: 'match', ids: [f.id] }, p_kind: 'friends', p_kickoff: new Date(f.ts * 1000).toISOString(),
      });
      track('match_group_created');
      nav.navigate('Group', { id: g.id, invite: true });
    } catch (e) { setMsg((e as { message?: string }).message ?? 'Grup kurulamadı.'); } finally { setBusy(''); }
  };

  return (
    <View style={{ alignSelf: 'stretch', gap: 8 }}>
      <Pressable onPress={whatsapp} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Arkadaşlarına WhatsApp'ta sor"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16,
          backgroundColor: pressed ? '#1DA851' : '#25D366', opacity: busy === 'ask' ? 0.7 : 1 })}>
        <Text style={{ fontSize: 24 }}>💬</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#05301A' }}>{busy === 'ask' ? 'Hazırlanıyor…' : 'Arkadaşlarına sor'}</Text>
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#0B4A28', marginTop: 1 }}>Sen {pick.h}–{pick.a} dedin. Onlar ne diyor?</Text>
        </View>
        <Text style={{ fontSize: 22, fontWeight: '700', color: '#05301A' }}>›</Text>
      </Pressable>
      <Pressable onPress={chatGroup} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Bu maça özel sohbet grubu oluştur"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, borderRadius: 14,
          backgroundColor: pressed ? t.line : t.surface2, borderWidth: 1, borderColor: t.line, opacity: busy === 'group' ? 0.6 : 1 })}>
        <Text style={{ fontSize: 15 }}>🗨️</Text>
        <Text style={{ fontSize: 14.5, fontWeight: '700', color: t.fg }}>{busy === 'group' ? 'Kuruluyor…' : 'Sohbet grubu oluştur'}</Text>
      </Pressable>
      <Text style={{ fontSize: 11.5, color: t.muted, textAlign: 'center' }}>{msg || 'Sadece bu maça özel; maç bitince kapanır, 7 gün sonra silinir.'}</Text>
    </View>
  );
}
