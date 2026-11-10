import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '../api';
import { verifyEmail } from '../auth';
import type { RootParams } from '../nav';
import { useStore } from '../store';
import { track } from '../telemetry';
import { useTheme } from '../theme';
import { Button, Empty, Field } from '../ui';
import { Screen } from './Screen';

// E-postadaki giriş bağlantısı (tribunapp.io/giris?h=…) uygulamada açılınca: doğrular, profili hesaba bağlar.
// Bu e-postayla hiç profil yoksa takma ad sorar. Bitince Hesap ekranına geçer.
export default function EmailLink({ route, navigation }: NativeStackScreenProps<RootParams, 'EmailLink'>) {
  const t = useTheme();
  const store = useStore();
  const [state, setState] = useState<'busy' | 'name' | 'error'>('busy');
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const hash = route.params?.h;
  useEffect(() => {
    if (!hash) { setState('error'); setError('Bağlantı eksik. E-postadaki kodu uygulamaya yazabilirsin.'); return; }
    (async () => {
      try {
        const token = await verifyEmail({ hash: String(hash) });
        const r = await store.linkAccount('email', token);
        track('account_linked', { provider: 'email', status: r, via: 'link' });
        if (r === 'new') setState('name'); else navigation.replace('Account');
      } catch (e) { setState('error'); setError((e as ApiError).message); }
    })();
  }, [hash]);
  const save = async () => {
    try { await store.setName(name.trim()); navigation.replace('Account'); } catch (e) { setError((e as ApiError).message); }
  };
  return (
    <Screen title="E-posta ile giriş">
      {state === 'busy' && <Empty>Giriş yapılıyor…</Empty>}
      {state === 'error' && <Empty>{error}</Empty>}
      {state === 'name' && (
        <View style={{ gap: 10, marginTop: 12 }}>
          <Text style={{ color: t.muted, fontSize: 14, textAlign: 'center' }}>Hoş geldin! Bir takma ad seç.</Text>
          <Field value={name} onChange={setName} placeholder="Takma adın" maxLength={30} />
          {error ? <Text style={{ color: t.live, fontSize: 13 }}>{error}</Text> : null}
          <Button label="Devam" disabled={!name.trim()} onPress={save} />
        </View>
      )}
    </Screen>
  );
}
