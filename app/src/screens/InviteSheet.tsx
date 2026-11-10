import React, { useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot from 'react-native-view-shot';
import { rpc, useRpc, type Group } from '../social';
import { useStore } from '../store';
import { inviteText, sendViaWhatsApp, shareText } from '../invite';
import { gradientFor } from '../teamColors';
import { track } from '../telemetry';
import { useTheme } from '../theme';
import { Button, Crest } from '../ui';

// Davet sayfası: paylaşılabilir kart önizlemesi + WhatsApp / kart görseli / diğer uygulamalar.
// memberIds: grupta zaten olanlar (arkadaş listesinde gösterilmez). onAdded: arkadaş eklenince grup yenilensin.
export function InviteSheet({ group, onClose, memberIds = [], onAdded }: { group: Group; onClose: () => void; memberIds?: string[]; onAdded?: () => void }) {
  const t = useTheme();
  const card = useRef<React.ComponentRef<typeof ViewShot>>(null);
  const [busy, setBusy] = useState(false);
  const colors = gradientFor(group.team.name);

  const shareCard = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await card.current?.capture?.();
      if (!uri) throw new Error('no image');
      // iOS'ta görsel dosyası paylaşılır; mesaj metni görselle birlikte gitmeyebileceği için bağlantı ayrıca da paylaşılabilir.
      await Share.share(Platform.OS === 'ios' ? { url: uri } : { message: inviteText(group) });
      track('invite_sent', { channel: 'card' });
    } catch { await shareText(group); } finally { setBusy(false); }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }} onPress={onClose} accessibilityLabel="Kapat">
        <Pressable onPress={() => {}} style={{ backgroundColor: t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '92%', borderWidth: 1, borderColor: t.line }}>
          {/* Arkadaş listesiyle sayfa uzayabilir: kaydırılabilir. */}
          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 30, gap: 14 }}>
          <Text style={{ textAlign: 'center', fontSize: 17, fontWeight: '700', color: t.fg }}>Arkadaşlarını davet et</Text>
          {/* Paylaşılan görsel: yalnızca bu görünüm yakalanır. */}
          <ViewShot ref={card} options={{ format: 'png', quality: 1, result: 'tmpfile' }} style={{ borderRadius: 24, overflow: 'hidden' }}>
            <LinearGradient colors={[...colors]} style={{ padding: 24, alignItems: 'center', gap: 8 }}>
              <Crest uri={group.team.logo} size={64} />
              <Text style={{ fontSize: 24, fontWeight: '700', color: '#fff', textAlign: 'center' }}>{group.name}</Text>
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', textAlign: 'center' }}>Maçları birlikte takip edelim, skor tahmini yapalım</Text>
              <Text style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Davet kodu</Text>
              <Text style={{ fontSize: 38, fontWeight: '800', color: '#fff', letterSpacing: 8, fontVariant: ['tabular-nums'] }}>{group.code}</Text>
              <Text style={{ marginTop: 10, fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.85)' }}>Tribün</Text>
            </LinearGradient>
          </ViewShot>
          <FriendPicker group={group} memberIds={memberIds} onAdded={onAdded} />
          <Text style={{ fontSize: 12.5, color: t.muted, textAlign: 'center' }}>Uygulamayı kullanmayanlara WhatsApp'tan gönder; birden çok sohbet seçebilirsin.</Text>
          <Button label="WhatsApp'ta gönder" onPress={() => { track('invite_sent', { channel: 'whatsapp' }); sendViaWhatsApp(group); }} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {Platform.OS !== 'web' && <View style={{ flex: 1 }}><Button kind="sec" label={busy ? 'Hazırlanıyor…' : 'Kartı gönder'} disabled={busy} onPress={shareCard} /></View>}
            <View style={{ flex: 1 }}><Button kind="sec" label="Diğer…" onPress={() => { track('invite_sent', { channel: 'share' }); shareText(group); }} /></View>
          </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type Friend = { id: string; name: string; me: boolean };
// Arkadaşlarından seç: işaretlenenler tek dokunuşla gruba eklenir ve bildirim alır. Grupta olanlar listede çıkmaz.
function FriendPicker({ group, memberIds, onAdded }: { group: Group; memberIds: string[]; onAdded?: () => void }) {
  const t = useTheme();
  const secret = useStore().me?.secret;
  const state = useRpc<Friend[]>('my_friends', secret ? { p_secret: secret } : null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const friends = (Array.isArray(state.data) ? state.data : []).filter((f) => !f.me && !memberIds.includes(f.id));
  if (!secret || !friends.length) return null;
  const toggle = (id: string) => setPicked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const add = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await rpc<{ added: number }>('add_to_group', { p_secret: secret, p_group: group.id, p_profiles: picked });
      setMsg(`${r.added} arkadaşın tribüne eklendi.`); setPicked([]); track('friends_added', { n: r.added }); onAdded?.(); state.reload();
    } catch (e) { setMsg((e as { message?: string }).message ?? 'Eklenemedi.'); } finally { setBusy(false); }
  };
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: t.muted, letterSpacing: 0.4 }}>ARKADAŞLARINDAN SEÇ</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {friends.map((f) => {
          const on = picked.includes(f.id);
          return (
            <Pressable key={f.id} onPress={() => toggle(f.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={f.name}
              style={{ alignItems: 'center', gap: 4, width: 64 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.accent : t.surface2, borderWidth: 2, borderColor: on ? t.accent : t.line }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: on ? t.accentInk : t.fg }}>{on ? '✓' : f.name.slice(0, 1).toLocaleUpperCase('tr')}</Text>
              </View>
              <Text numberOfLines={1} style={{ fontSize: 12, color: t.fg }}>{f.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {picked.length > 0 && <Button label={busy ? 'Ekleniyor…' : `${picked.length} arkadaşını tribüne ekle`} disabled={busy} onPress={add} />}
      {!!msg && <Text style={{ fontSize: 12.5, color: t.win, textAlign: 'center' }}>{msg}</Text>}
    </View>
  );
}
