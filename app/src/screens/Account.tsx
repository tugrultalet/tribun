import React, { useState } from 'react';
import { Alert, Platform, Pressable, Switch, Text, View } from 'react-native';
import { ApiError } from '../api';
import { providerName } from '../auth';
import { rpc, useRpc } from '../social';
import { useStore } from '../store';
import { track } from '../telemetry';
import { useTheme } from '../theme';
import { Button, Card, Empty, Field, GAP, HAIR, Icon, Section } from '../ui';
import { useNav } from '../nav';
import { Screen } from './Screen';
import { RestoreBlock, SignInButtons } from './SignIn';

type Account = { name: string; provider: 'apple' | 'google' | 'email' | null; hide_global: boolean; created_at: string; groups: number; picks: number; devices: number };

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const since = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

// Hesap: takma ad, üyelik bilgisi, Apple/Google bağlantısı, gizlilik ve hesabı silme. Ayarlar'ın en üstünden açılır.
export default function AccountScreen() {
  const store = useStore();
  if (!store.me) return <NoAccount />;
  return <Details secret={store.me.secret} />;
}

function NoAccount() {
  const t = useTheme();
  const { setName } = useStore();
  const [name, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try { await setName(name.trim()); } catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  };
  return (
    <Screen title="Hesap">
      <Empty>Henüz hesabın yok. Tahmin yapmak, grup kurmak ve sohbet etmek için bir takma ad seç.</Empty>
      <Card style={{ padding: 16, gap: 12 }}>
        <Field value={name} onChange={setValue} placeholder="Takma adın" maxLength={30} />
        {error ? <Text style={{ color: t.live, fontSize: 13 }}>{error}</Text> : null}
        <Button label={busy ? 'Kaydediliyor…' : 'Devam'} disabled={busy || !name.trim()} onPress={save} />
        <RestoreBlock />
      </Card>
    </Screen>
  );
}

function Details({ secret }: { secret: string }) {
  const t = useTheme();
  const store = useStore();
  const info = useRpc<Account>('account_info', { p_secret: secret });
  const a = info.data && typeof info.data === 'object' ? info.data : undefined;
  const [hide, setHide] = useState<boolean | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(store.me?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const provider = a?.provider ?? undefined;
  React.useEffect(() => { if (a && provider !== store.me?.provider) store.setProvider(provider); }, [a?.provider]);

  const saveName = async () => {
    setBusy(true); setError('');
    try { await store.setName(name.trim()); setEditing(false); info.reload(); } catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  };
  const hidden = hide ?? a?.hide_global ?? false;
  const toggleHide = (v: boolean) => { setHide(v); rpc('set_hide_global', { p_secret: secret, p_hide: v }).catch(() => setHide(!v)); };
  const confirmDelete = () => {
    const go = () => store.deleteAccount().then(() => track('account_deleted'), (e) => Alert.alert('Silinemedi', (e as Error).message));
    if (Platform.OS === 'web') { if (globalThis.confirm?.('Hesabın ve tüm verilerin kalıcı olarak silinsin mi?')) go(); return; }
    Alert.alert('Hesabımı sil', 'Takma adın, grup üyeliklerin, mesajların ve tahminlerin kalıcı olarak silinir. Kurduğun gruplar başka üye varsa ona devredilir. Bu işlem geri alınamaz.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: go },
    ]);
  };
  const nav = useNav();
  const confirmSignOut = () => {
    const go = () => store.signOut().then(() => { track('signed_out'); nav.goBack(); }, (e) => Alert.alert('Çıkış yapılamadı', (e as Error).message));
    const msg = `Bu telefondan çıkış yapılır. Tekrar ${providerName(provider)} ile girince puanların, grupların ve tahminlerin geri gelir. Başka bir hesapla da girebilirsin.`;
    if (Platform.OS === 'web') { if (globalThis.confirm?.(msg)) go(); return; }
    Alert.alert('Çıkış yap', msg, [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Çıkış yap', style: 'destructive', onPress: go }]);
  };
  const line = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 12, paddingHorizontal: 14 };
  const stat = (value: number | string, label: string) => (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: t.fg, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ fontSize: 11.5, color: t.muted }}>{label}</Text>
    </View>
  );

  return (
    <Screen title="Hesap" onRefresh={info.reload}>
      <View style={{ alignItems: 'center', gap: 6, paddingTop: 4, paddingBottom: 6 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accentSoft }}>
          <Text style={{ fontSize: 30, fontWeight: '800', color: t.fg }}>{(store.me?.name ?? '?').slice(0, 1).toLocaleUpperCase('tr')}</Text>
        </View>
        <Text style={{ fontSize: 22, fontWeight: '700', color: t.fg }}>{store.me?.name}</Text>
        <Text style={{ fontSize: 13, color: t.muted }}>{a ? `Üyelik: ${since(a.created_at)}` : ' '}</Text>
      </View>
      {a && (
        <Card style={{ marginTop: GAP, paddingVertical: 12, flexDirection: 'row' }}>
          {stat(a.picks, 'Tahmin')}{stat(a.groups, 'Grup')}{stat(a.devices, a.devices === 1 ? 'Cihaz' : 'Cihaz')}
        </Card>
      )}

      <Section eyebrow="Takma ad">
        <Card>
          {editing ? (
            <View style={{ padding: 14, gap: 10 }}>
              <Field value={name} onChange={setName} placeholder="Takma adın" maxLength={30} />
              {error ? <Text style={{ color: t.live, fontSize: 13 }}>{error}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Button kind="sec" label="Vazgeç" onPress={() => { setEditing(false); setName(store.me?.name ?? ''); }} /></View>
                <View style={{ flex: 1 }}><Button label={busy ? 'Kaydediliyor…' : 'Kaydet'} disabled={busy || !name.trim()} onPress={saveName} /></View>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setEditing(true)} accessibilityRole="button" style={line}>
              <Text style={{ flex: 1, fontSize: 15, color: t.fg }}>{store.me?.name}</Text>
              <Text style={{ color: t.accent, fontWeight: '600' }}>Değiştir</Text>
            </Pressable>
          )}
        </Card>
        <Text style={{ fontSize: 12, color: t.muted, marginTop: 6, marginHorizontal: 4 }}>Gruplarında ve sıralamalarda bu ad görünür. E-posta ya da telefon numarası paylaşılmaz.</Text>
      </Section>

      <Section eyebrow="Giriş">
        <Card>
          <View style={line}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: t.fg }}>{provider ? `${providerName(provider)} hesabına bağlı` : 'Hesap bağlı değil'}</Text>
              <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 2, lineHeight: 18 }}>
                {provider ? 'Telefon değişirse aynı hesapla girince puanların, grupların ve tahminlerin geri gelir.' : 'Veriler yalnızca bu telefonda. Bağlarsan telefon değişince kaybolmaz.'}
              </Text>
            </View>
          </View>
          {!provider && <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}><SignInButtons onDone={info.reload} /></View>}
          {provider && (
            <Pressable onPress={confirmSignOut} accessibilityRole="button"
              style={({ pressed }) => ({ ...line, borderTopWidth: HAIR, borderColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
              <Text style={{ flex: 1, fontSize: 15, color: t.fg }}>Çıkış yap</Text>
              <Icon.chevron color={t.fg} />
            </Pressable>
          )}
        </Card>
      </Section>

      <Section eyebrow="Gizlilik">
        <Card>
          <View style={line}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: t.fg }}>Sıralamalarda adım görünsün</Text>
              <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 2, lineHeight: 18 }}>
                {hidden ? 'Kapalı: Türkiye ve taraftar sıralamalarında adın yer almaz.' : 'Açık: Türkiye ve taraftar sıralamalarında adın ve puanın görünür.'} Grupların seni her durumda görür.
              </Text>
            </View>
            <Switch value={!hidden} disabled={!a} onValueChange={(v) => toggleHide(!v)} accessibilityLabel="Sıralamalarda adım görünsün" />
          </View>
        </Card>
      </Section>

      <Section eyebrow="Hesabı sil">
        <Card>
          <Pressable onPress={confirmDelete} accessibilityRole="button" style={[line, { borderTopWidth: 0, borderColor: t.line }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: t.live, fontWeight: '600' }}>Hesabımı sil</Text>
              <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 2, lineHeight: 18 }}>Takma ad, gruplar, mesajlar ve tahminler kalıcı olarak silinir. Takip ettiğin takımlar telefonda kalır.</Text>
            </View>
          </Pressable>
        </Card>
      </Section>
      <View style={{ height: HAIR }} />
    </Screen>
  );
}
