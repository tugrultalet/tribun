import React, { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootParams } from '../nav';
import { rpc } from '../social';
import { useStore } from '../store';
import { Empty } from '../ui';
import { Screen } from './Screen';

// tribunapp.io/t/KOD uygulamada açılınca: isteğin maçına gider; o maça tahmin yapınca gönderenle arkadaş olunur.
export default function AskLink({ route, navigation }: NativeStackScreenProps<RootParams, 'Ask'>) {
  const [error, setError] = useState('');
  const store = useStore();
  useEffect(() => {
    const token = String(route.params.token).toUpperCase();
    rpc<{ match_id?: number } | null>('ask_info', { p_token: token })
      .then((r) => {
        if (!r?.match_id) return setError('Bu tahmin isteği bulunamadı.');
        // O maça tahmin kaydedilince gönderenle arkadaş olunur (PickCard). Zaten tahmin yapmışsa hemen bağlanır.
        store.setAsk({ token, match: r.match_id });
        if (store.me) rpc('ask_connect', { p_secret: store.me.secret, p_token: token }).catch(() => {});
        navigation.replace('Match', { id: r.match_id });
      })
      .catch(() => setError('Bağlantı açılamadı.'));
  }, [route.params.token]);
  return <Screen title="Tahmin isteği"><Empty>{error || 'Açılıyor…'}</Empty></Screen>;
}
