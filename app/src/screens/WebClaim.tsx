import React, { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { claimCodeFrom, friendCodeFrom } from '../game/ask';
import { rpc } from '../social';
import { useStore } from '../store';
import { track } from '../telemetry';
import { useTheme } from '../theme';
import { Button, Card } from '../ui';

// İlk açılışta: web'de (tribunapp.io/t/…) tahmin yapmış kişinin tahmini ve grubu uygulamaya geçer.
// Önce panodaki "TRIBUN-KOD"a bakılır; yoksa aynı internet bağlantısından son 24 saatte yapılmış web tahmini sorulur.
// Arkadaş daveti (tribunapp.io/a/…) için de aynısı: panoda "TRIBUN-A-KOD" ya da aynı bağlantıdan açılmış davet;
// bulunursa kod saklanır ve takma ad seçilince davet edenle arkadaş olunur.
export function WebClaim() {
  const t = useTheme();
  const store = useStore();
  const [offer, setOffer] = useState<{ code: string; inviter: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [friend, setFriend] = useState<string | null>(null);
  const [friendOffer, setFriendOffer] = useState<{ code: string; inviter: string } | null>(null);
  useEffect(() => {
    if (store.me || Platform.OS === 'web') return;
    let alive = true;
    (async () => {
      try {
        const Clipboard = await import('expo-clipboard');
        if (await Clipboard.hasStringAsync()) {
          const text = await Clipboard.getStringAsync();
          const friend = friendCodeFrom(text);
          if (friend && /TRIBUN-A-/i.test(text)) {
            const info = await rpc<{ name?: string } | null>('friend_invite_info', { p_code: friend }).catch(() => null);
            if (info?.name) { store.setFriendCode(friend); track('friend_invite_found', { via: 'clipboard' }); if (alive) setFriend(info.name); Clipboard.setStringAsync('').catch(() => {}); return; }
          }
          const code = claimCodeFrom(text);
          if (code) {
            const inviter = await store.claimWeb(code);
            if (inviter !== null) { track('web_claimed', { via: 'clipboard' }); if (alive) setDone(inviter); Clipboard.setStringAsync('').catch(() => {}); return; }
          }
        }
      } catch { /* pano okunamadı */ }
      try {
        const r = await rpc<{ found: boolean; code?: string; inviter?: string }>('web_claim_nearby', {});
        if (alive && r.found && r.code) { setOffer({ code: r.code, inviter: r.inviter ?? '' }); return; }
      } catch { /* sorun değil */ }
      try {
        const f = await rpc<{ found: boolean; code?: string; inviter?: string }>('friend_invite_nearby', {});
        if (alive && f.found && f.code) setFriendOffer({ code: f.code, inviter: f.inviter ?? '' });
      } catch { /* sorun değil */ }
    })();
    return () => { alive = false; };
  }, []);

  if (friend) {
    return (
      <Card style={{ padding: 14, marginBottom: 12 }}>
        <Text style={{ color: t.fg, fontSize: 14.5, textAlign: 'center' }}>{friend} seni davet etti 🤝 Takma adını seçince arkadaş olacaksınız.</Text>
      </Card>
    );
  }
  if (friendOffer) {
    return (
      <Card style={{ padding: 14, marginBottom: 12, gap: 10 }}>
        <Text style={{ color: t.fg, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>{friendOffer.inviter ? `Seni ${friendOffer.inviter} mi davet etti?` : 'Davetle mi geldin?'}</Text>
        <Text style={{ color: t.muted, fontSize: 13, textAlign: 'center' }}>Evet dersen takma adını seçince arkadaş olursunuz.</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Button kind="sec" label="Hayır" onPress={() => setFriendOffer(null)} /></View>
          <View style={{ flex: 1 }}><Button label="Evet" onPress={() => { store.setFriendCode(friendOffer.code); track('friend_invite_found', { via: 'nearby' }); setFriend(friendOffer.inviter || 'Arkadaşın'); setFriendOffer(null); }} /></View>
        </View>
      </Card>
    );
  }
  if (done !== null) {
    return (
      <Card style={{ padding: 14, marginBottom: 12 }}>
        <Text style={{ color: t.fg, fontSize: 14.5, textAlign: 'center' }}>{done ? `${done} seni davet etti. ` : ''}Web'de yaptığın tahmin ve grubun aktarıldı ✓</Text>
      </Card>
    );
  }
  if (!offer) return null;
  const yes = async () => {
    setBusy(true);
    const inviter = await store.claimWeb(offer.code).catch(() => null);
    setBusy(false);
    if (inviter !== null) { track('web_claimed', { via: 'nearby' }); setDone(inviter); } else setOffer(null);
  };
  return (
    <Card style={{ padding: 14, marginBottom: 12, gap: 10 }}>
      <Text style={{ color: t.fg, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>{offer.inviter ? `Seni ${offer.inviter} mi davet etti?` : 'Davetle mi geldin?'}</Text>
      <Text style={{ color: t.muted, fontSize: 13, textAlign: 'center' }}>Web'de yaptığın tahmin ve tribünün uygulamaya aktarılsın.</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Button kind="sec" label="Hayır" onPress={() => setOffer(null)} /></View>
        <View style={{ flex: 1 }}><Button label={busy ? 'Aktarılıyor…' : 'Evet'} disabled={busy} onPress={yes} /></View>
      </View>
    </Card>
  );
}
