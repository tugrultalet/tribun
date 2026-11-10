import React, { useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import type { ApiError } from '../api';
import { APP_VERSION } from '../config';
import { useNav } from '../nav';
import { rpc } from '../social';
import { useStore } from '../store';
import { track } from '../telemetry';
import { useTheme } from '../theme';
import { Button, Card } from '../ui';
import { Screen } from './Screen';

// Uygulama içi geri bildirim: e-posta gerekmez; uygulama sürümü ve platform mesaja eklenir.
export default function Feedback() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const [body, setBody] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const send = async () => {
    setState('sending'); setError('');
    try {
      await rpc('send_feedback', { p_body: body.trim(), p_meta: { v: APP_VERSION, os: Platform.OS, osv: String(Platform.Version) }, p_secret: store.me?.secret ?? null });
      track('feedback_sent');
      setState('sent');
    } catch (e) { setError((e as ApiError).message); setState('idle'); }
  };
  return (
    <Screen title="Geri bildirim">
      {state === 'sent' ? (
        <Card style={{ padding: 18, gap: 12, marginTop: 4 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: t.fg, textAlign: 'center' }}>Teşekkürler!</Text>
          <Text style={{ fontSize: 14, color: t.muted, textAlign: 'center', lineHeight: 20 }}>Mesajın bize ulaştı.</Text>
          <Button kind="sec" label="Kapat" onPress={nav.goBack} />
        </Card>
      ) : (
        <View style={{ gap: 12, marginTop: 4 }}>
          <Text style={{ fontSize: 14, color: t.muted, lineHeight: 20 }}>Bir hata mı buldun, bir önerin mi var? Yaz, okuyalım. Uygulama sürümü ve platform bilgisi mesajına eklenir.</Text>
          <TextInput value={body} onChangeText={setBody} placeholder="Mesajın" placeholderTextColor={t.muted} multiline maxLength={2000} accessibilityLabel="Geri bildirim mesajı"
            style={{ minHeight: 140, borderRadius: 16, padding: 14, fontSize: 16, color: t.fg, backgroundColor: t.surface2, textAlignVertical: 'top' }} />
          {error ? <Text style={{ color: t.live, fontSize: 13 }}>{error}</Text> : null}
          <Button label={state === 'sending' ? 'Gönderiliyor…' : 'Gönder'} disabled={state === 'sending' || !body.trim()} onPress={send} />
        </View>
      )}
    </Screen>
  );
}
