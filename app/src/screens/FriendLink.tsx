import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootParams } from '../nav';
import { rpc } from '../social';
import { useStore } from '../store';
import { track } from '../telemetry';
import { useTheme } from '../theme';
import { Button, Empty } from '../ui';
import { Screen } from './Screen';

// "Arkadaş ekle" bağlantısı (tribunapp.io/a/KOD) uygulamada açılınca: profil varsa davet edenle hemen arkadaş olunur;
// yoksa kod saklanır, kişi Arkadaşlar sekmesinde takma ad seçince bağlanır (Groups ekranı).
export default function FriendLink({ route, navigation }: NativeStackScreenProps<RootParams, 'FriendLink'>) {
  const t = useTheme();
  const store = useStore();
  const code = String(route.params?.code ?? '').toUpperCase();
  const [state, setState] = useState<'busy' | 'done' | 'error'>('busy');
  const [text, setText] = useState('');
  useEffect(() => {
    if (!store.me) {
      store.setFriendCode(code);
      navigation.replace('Tabs', { screen: 'Groups' });
      return;
    }
    rpc<{ ok: boolean; new?: boolean; name?: string; self?: boolean; error?: string }>('accept_friend', { p_secret: store.me.secret, p_code: code })
      .then((r) => {
        if (r.self) { setState('error'); setText('Bu senin kendi davet bağlantın.'); return; }
        if (!r.ok) { setState('error'); setText(r.error ?? 'Davet bulunamadı.'); return; }
        track('friend_invite_accepted', { new: !!r.new });
        setState('done'); setText(r.new ? `${r.name} ile artık arkadaşsınız 🤝` : `${r.name} ile zaten arkadaşsınız.`);
      })
      .catch(() => { setState('error'); setText('Bağlantı açılamadı.'); });
  }, [code]);
  return (
    <Screen title="Arkadaş daveti">
      {state === 'busy' ? <Empty>Bağlanıyor…</Empty> : (
        <View style={{ gap: 14, marginTop: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: state === 'done' ? t.fg : t.muted, textAlign: 'center' }}>{text}</Text>
          {state === 'done' && <Text style={{ fontSize: 14, color: t.muted, textAlign: 'center', lineHeight: 20 }}>Birbirinizin tahminlerini maç başlayınca, puanlarınızı her zaman görebilirsiniz.</Text>}
          <Button label="Arkadaşlarım" onPress={() => navigation.replace('Tabs', { screen: 'Groups' })} />
        </View>
      )}
    </Screen>
  );
}
