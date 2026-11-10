import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { ApiError } from '../api';
import { Cancelled, availableProviders, sendEmailCode, validEmail, verifyEmail, type Provider } from '../auth';
import { useStore } from '../store';
import { track } from '../telemetry';
import { useTheme } from '../theme';
import { Button, Card, Field } from '../ui';

// Apple ile ya da e-postayla (giriş bağlantısı; e-posta bilgisayarda açıldıysa kod) devam et. Başarıyla bağlanınca `onDone` çağrılır. Bu hesapla hiç profil yoksa
// önce takma ad sorulur. E-posta her yerde çalışır; Apple yalnızca iOS derlemesinde görünür.
export function SignInButtons({ onDone }: { onDone?: () => void }) {
  const t = useTheme();
  const store = useStore();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [askName, setAskName] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState<'off' | 'form' | 'code'>('off');
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  useEffect(() => { availableProviders().then(setProviders); }, []);

  const go = async (p: Provider, token?: string) => {
    setBusy(true); setError('');
    try {
      const r = await store.linkAccount(p, token);
      track('account_linked', { provider: p, status: r });
      if (r === 'new') setAskName(true); else onDone?.();
    } catch (e) {
      if (!(e instanceof Cancelled)) setError((e as ApiError).message);
    } finally { setBusy(false); }
  };
  const send = async () => {
    setBusy(true); setError('');
    try { await sendEmailCode(address); setSentTo(address.trim()); setCode(''); setEmail('code'); track('email_code_sent'); }
    catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  };
  const verify = async (value = code) => {
    if (value.length < 6 || busy) return;
    setBusy(true); setError('');
    let token: string;
    try { token = await verifyEmail({ email: sentTo, code: value }); } catch (e) { setError((e as ApiError).message); setBusy(false); return; }
    await go('email', token);
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
  if (email === 'form' || email === 'code') {
    return (
      <View style={{ gap: 10 }}>
        {email === 'form' ? (
          <>
            <Text style={{ color: t.muted, fontSize: 13.5, textAlign: 'center' }}>E-postana bir giriş bağlantısı gönderelim; dokununca giriş tamamlanır.</Text>
            <Field value={address} onChange={setAddress} placeholder="E-posta adresin" maxLength={120} autoCapitalize="none" keyboardType="email-address" textContentType="emailAddress" onSubmit={send} />
            <Button label={busy ? 'Gönderiliyor…' : 'Giriş bağlantısı gönder'} disabled={busy || !validEmail(address)} onPress={send} />
          </>
        ) : (
          <>
            {/* Asıl yol: e-postadaki "Tribün'e giriş yap" düğmesi uygulamayı açar ve giriş kendiliğinden tamamlanır
                (EmailLink ekranı). Kod yalnızca e-posta bilgisayarda açıldıysa, istenirse. */}
            <Text style={{ color: t.fg, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>📩 E-postanı kontrol et</Text>
            <Text style={{ color: t.muted, fontSize: 13.5, textAlign: 'center', lineHeight: 19 }}>
              <Text style={{ color: t.fg, fontWeight: '600' }}>{sentTo}</Text> adresine bir giriş bağlantısı gönderdik. E-postadaki{' '}
              <Text style={{ color: t.fg, fontWeight: '600' }}>Tribün'e giriş yap</Text> düğmesine dokun ya da e-postadaki 6 haneli kodu yaz.
            </Text>
            {Platform.OS === 'ios' && <Button label="Mail uygulamasını aç" onPress={() => { Linking.openURL('message://').catch(() => {}); }} />}
            <CodeBoxes value={code} busy={busy} onChange={(v) => { setCode(v); setError(''); if (v.length === 6) verify(v); }} />
            {busy && <Text style={{ color: t.muted, fontSize: 13, textAlign: 'center' }}>Kontrol ediliyor…</Text>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
              <Chip label="↻  Tekrar gönder" onPress={send} disabled={busy} />
              <Chip label="✎  E-postayı değiştir" onPress={() => { setEmail('form'); setError(''); }} />
            </View>
          </>
        )}
        {error ? <Text style={{ color: t.live, fontSize: 13, textAlign: 'center' }}>{error}</Text> : null}
        <Pressable onPress={() => { setEmail('off'); setError(''); }} hitSlop={8} style={{ alignSelf: 'center' }}><Text style={{ color: t.muted, fontSize: 13 }}>Vazgeç</Text></Pressable>
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {providers.filter((p) => p !== 'email').map((p) => (
        <Pressable key={p} disabled={busy} onPress={() => go(p)} accessibilityRole="button"
          style={({ pressed }) => ({ height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: p === 'apple' ? '#fff' : t.surface2, opacity: busy || pressed ? 0.7 : 1 })}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: p === 'apple' ? '#000' : t.fg }}>{p === 'apple' ? ' Apple ile devam et' : 'Google ile devam et'}</Text>
        </Pressable>
      ))}
      <Pressable disabled={busy} onPress={() => { setEmail('form'); setError(''); }} accessibilityRole="button"
        style={({ pressed }) => ({ height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2, borderWidth: 1, borderColor: t.line, opacity: busy || pressed ? 0.7 : 1 })}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: t.fg }}>✉️  E-posta ile devam et</Text>
      </Pressable>
      {error ? <Text style={{ color: t.live, fontSize: 13, textAlign: 'center' }}>{error}</Text> : null}
    </View>
  );
}

// E-postayla giriş her yerde çalıştığı için artık her zaman true (Apple düğmesi yalnızca iOS derlemesinde çıkar).
export function useCanSignIn(): boolean {
  return true;
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

// E-posta adımındaki ikincil eylemler: çerçeveli, dolgulu düğme (yalnız yazı gibi görünmesin).
function Chip({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label.replace(/^\S+\s+/, '')}
      style={({ pressed }) => ({ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: t.line,
        backgroundColor: pressed ? t.line : t.surface2, opacity: disabled ? 0.5 : 1 })}>
      <Text style={{ fontSize: 13.5, fontWeight: '700', color: t.fg }}>{label}</Text>
    </Pressable>
  );
}

// 6 haneli kod: altı kutu, üçüncüden sonra tire. Görünmez tek bir alan rakamları alır (yapıştırma ve iOS'un
// "e-postadan kod" önerisi de çalışır); kutulara dokununca klavye açılır. Altıncı rakamda giriş kendiliğinden başlar.
function CodeBoxes({ value, onChange, busy }: { value: string; onChange: (v: string) => void; busy: boolean }) {
  const t = useTheme();
  const ref = useRef<React.ComponentRef<typeof TextInput>>(null);
  const box = (i: number) => {
    const ch = value[i] ?? '';
    const active = !busy && i === Math.min(value.length, 5);
    return (
      <View key={i} style={{ width: 44, height: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2,
        borderWidth: active ? 2 : 1, borderColor: active ? t.accent : t.line }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: t.fg, fontVariant: ['tabular-nums'] }}>{ch}</Text>
      </View>
    );
  };
  return (
    <Pressable onPress={() => ref.current?.focus()} accessibilityRole="none" accessibilityLabel="6 haneli giriş kodu"
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: busy ? 0.6 : 1 }}>
      {[0, 1, 2].map(box)}
      <Text style={{ fontSize: 22, fontWeight: '700', color: t.muted, marginHorizontal: 2 }}>–</Text>
      {[3, 4, 5].map(box)}
      <TextInput ref={ref} value={value} autoFocus editable={!busy} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code"
        maxLength={7} onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, 6))} caretHidden accessibilityLabel="Giriş kodu"
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
    </Pressable>
  );
}
