import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ApiError } from '../api';
import { Cancelled, availableProviders, type Provider } from '../auth';
import { useStore } from '../store';
import { track } from '../telemetry';
import { useTheme } from '../theme';
import { Button, Card, Field } from '../ui';

// Apple / Google ile devam et. Başarıyla bağlanınca `onDone` çağrılır. Bu hesapla hiç profil yoksa önce takma ad sorulur.
// Giriş bu cihazda kullanılamıyorsa (web, Expo Go) hiçbir şey göstermez.
export function SignInButtons({ onDone }: { onDone?: () => void }) {
  const t = useTheme();
  const store = useStore();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [askName, setAskName] = useState(false);
  const [name, setName] = useState('');
  useEffect(() => { availableProviders().then(setProviders); }, []);
  if (!providers.length) return null;

  const go = async (p: Provider) => {
    setBusy(true); setError('');
    try {
      const r = await store.linkAccount(p);
      track('account_linked', { provider: p, status: r });
      if (r === 'new') setAskName(true); else onDone?.();
    } catch (e) {
      if (!(e instanceof Cancelled)) setError((e as ApiError).message);
    } finally { setBusy(false); }
  };
  const saveName = async () => {
    setBusy(true); setError('');
    try { await store.setName(name.trim()); onDone?.(); } catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  };

  if (askName) {
    return (
      <View style={{ gap: 10 }}>
        <Text style={{ color: t.muted, fontSize: 13.5, textAlign: 'center' }}>Hoş geldin! Bir takma ad seç.</Text>
        <Field value={name} onChange={setName} placeholder="Takma adın" maxLength={30} />
        {error ? <Text style={{ color: t.live, fontSize: 13 }}>{error}</Text> : null}
        <Button label={busy ? 'Kaydediliyor…' : 'Devam'} disabled={busy || !name.trim()} onPress={saveName} />
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {providers.map((p) => (
        <Pressable key={p} disabled={busy} onPress={() => go(p)} accessibilityRole="button"
          style={({ pressed }) => ({ height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: p === 'apple' ? '#fff' : t.surface2, opacity: busy || pressed ? 0.7 : 1 })}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: p === 'apple' ? '#000' : t.fg }}>{p === 'apple' ? ' Apple ile devam et' : 'Google ile devam et'}</Text>
        </Pressable>
      ))}
      {error ? <Text style={{ color: t.live, fontSize: 13, textAlign: 'center' }}>{error}</Text> : null}
    </View>
  );
}

// Giriş bu cihazda kullanılabiliyor mu (iOS derlemesi). Web ve Expo Go'da false.
export function useCanSignIn(): boolean {
  const [has, setHas] = useState(false);
  useEffect(() => { availableProviders().then((l) => setHas(l.length > 0)); }, []);
  return has;
}

// Takma ad formunun altında: başka telefonda kullanmış olan kişi hesabıyla verilerini geri yükler.
export function RestoreBlock() {
  const t = useTheme();
  if (!useCanSignIn()) return null;
  return (
    <View style={{ gap: 10, marginTop: 6 }}>
      <Text style={{ color: t.muted, fontSize: 13, textAlign: 'center' }}>Daha önce kullandın mı? Hesabınla gir, verilerin geri gelsin.</Text>
      <SignInButtons />
    </View>
  );
}

// Profil'de: telefon değişince verilerin kaybolmaması için hesabı bağlama önerisi.
export function KeepAccountCard() {
  const t = useTheme();
  if (!useCanSignIn()) return null;
  return (
    <Card style={{ marginTop: 16, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: t.fg }}>Telefon değişirse tahminlerin kaybolmasın</Text>
      <Text style={{ fontSize: 13, color: t.muted, lineHeight: 18 }}>Hesabını bağla; yeni telefonda aynı hesapla girince puanların, grupların ve tahminlerin geri gelir.</Text>
      <SignInButtons />
    </Card>
  );
}
