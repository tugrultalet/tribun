import React, { useRef, useState } from 'react';
import { Modal, Platform, Pressable, Share, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot from 'react-native-view-shot';
import type { Group } from '../social';
import { inviteText, sendViaWhatsApp, shareText } from '../invite';
import { gradientFor } from '../teamColors';
import { useTheme } from '../theme';
import { Button, Crest } from '../ui';

// Davet sayfası: paylaşılabilir kart önizlemesi + WhatsApp / kart görseli / diğer uygulamalar.
export function InviteSheet({ group, onClose }: { group: Group; onClose: () => void }) {
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
    } catch { await shareText(group); } finally { setBusy(false); }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }} onPress={onClose} accessibilityLabel="Kapat">
        <Pressable onPress={() => {}} style={{ backgroundColor: t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, paddingBottom: 30, gap: 14, borderWidth: 1, borderColor: t.line }}>
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
          <Button label="WhatsApp'ta gönder" onPress={() => { sendViaWhatsApp(group); }} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {Platform.OS !== 'web' && <View style={{ flex: 1 }}><Button kind="sec" label={busy ? 'Hazırlanıyor…' : 'Kartı gönder'} disabled={busy} onPress={shareCard} /></View>}
            <View style={{ flex: 1 }}><Button kind="sec" label="Diğer…" onPress={() => { shareText(group); }} /></View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
