import React, { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootParams } from '../nav';
import { rpc } from '../social';
import { Empty } from '../ui';
import { Screen } from './Screen';

// tribunapp.io/t/KOD uygulamada açılınca: isteğin maçına gider.
export default function AskLink({ route, navigation }: NativeStackScreenProps<RootParams, 'Ask'>) {
  const [error, setError] = useState('');
  useEffect(() => {
    rpc<{ match_id?: number } | null>('ask_info', { p_token: String(route.params.token).toUpperCase() })
      .then((r) => { if (r?.match_id) navigation.replace('Match', { id: r.match_id }); else setError('Bu tahmin isteği bulunamadı.'); })
      .catch(() => setError('Bağlantı açılamadı.'));
  }, [route.params.token]);
  return <Screen title="Tahmin isteği"><Empty>{error || 'Açılıyor…'}</Empty></Screen>;
}
