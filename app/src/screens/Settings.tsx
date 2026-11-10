import React from 'react';
import { Alert, Linking, Platform, Pressable, Switch, Text, View } from 'react-native';
import { firebaseAvailable } from '../fb';
import { useFocusEffect } from '@react-navigation/native';
import { API_URL, PUBLIC_URL } from '../api';
import { APP_VERSION } from '../config';
import { track } from '../telemetry';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Card, Icon, Section, HAIR } from '../ui';
import { Screen } from './Screen';
import { SignInButtons } from './SignIn';
import { providerName } from '../auth';
import { rpc, useRpc } from '../social';

type Account = { name: string; provider: 'apple' | 'google' | null; hide_global: boolean };

// Hesap: takma ad, bağlı giriş yöntemi ve tek gizlilik ayarı ("Genel sıralamada görünme").
function AccountSection({ secret }: { secret: string }) {
  const t = useTheme();
  const store = useStore();
  const info = useRpc<Account>('account_info', { p_secret: secret });
  const [hide, setHide] = React.useState<boolean | undefined>(undefined);
  const provider = info.data?.provider ?? undefined;
  React.useEffect(() => {
    if (info.data && provider !== store.me?.provider) store.setProvider(provider);
  }, [info.data]);
  const hidden = hide ?? info.data?.hide_global ?? false;
  const toggle = (v: boolean) => {
    setHide(v);
    rpc('set_hide_global', { p_secret: secret, p_hide: v }).catch(() => setHide(!v));
  };
  const line = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 12, paddingHorizontal: 14 };
  return (
    <Section eyebrow="Hesap">
      <Card>
        <View style={line}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, color: t.fg }}>{store.me?.name}</Text>
            <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 2 }}>
              {provider ? `${providerName(provider)} hesabına bağlı · telefon değişince geri yüklenir` : 'Hesap bağlı değil · veriler yalnızca bu telefonda'}
            </Text>
          </View>
        </View>
        {!provider && <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}><SignInButtons onDone={info.reload} /></View>}
        <View style={[line, { borderTopWidth: HAIR, borderColor: t.line }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, color: t.fg }}>Genel sıralamada görünme</Text>
            <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 2, lineHeight: 18 }}>Türkiye sıralamasında adın yer almaz; grupların seni görmeye devam eder.</Text>
          </View>
          <Switch value={hidden} disabled={!info.data} onValueChange={toggle} accessibilityLabel="Genel sıralamada görünme" />
        </View>
      </Card>
    </Section>
  );
}

export default function Settings() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const { meta, reloadMeta } = store;
  useFocusEffect(React.useCallback(() => { reloadMeta(); }, [reloadMeta]));
  const row = (title: string, detail?: string, first?: boolean, onPress?: () => void) => (
    <Pressable key={title} disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderTopWidth: first ? 0 : HAIR, borderColor: t.line }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: t.fg }}>{title}</Text>
        {detail ? <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 2, lineHeight: 18 }}>{detail}</Text> : null}
      </View>
      {onPress && <Icon.chevron color={t.fg} />}
    </Pressable>
  );
  // Hesap silme: geri alınamaz olduğu için onay istenir.
  const confirmDelete = () => {
    const go = () => store.deleteAccount().then(() => track('account_deleted'), (e) => Alert.alert('Silinemedi', (e as Error).message));
    if (Platform.OS === 'web') { if (globalThis.confirm?.('Hesabın ve tüm verilerin kalıcı olarak silinsin mi?')) go(); return; }
    Alert.alert('Hesabımı sil', 'Takma adın, grup üyeliklerin, mesajların ve tahminlerin kalıcı olarak silinir. Kurduğun gruplar başka üye varsa ona devredilir. Bu işlem geri alınamaz.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: go },
    ]);
  };
  const refresh = meta.liveTtl >= 60 ? `${Math.round(meta.liveTtl / 60)} dakikada bir` : `${meta.liveTtl} saniyede bir`;
  const quota = meta.error ? meta.error : `${meta.plan ?? '–'} plan · bugün ${meta.used ?? '–'} / ${meta.limitDay ?? '–'} istek kullanıldı`;
  return (
    <Screen title="Ayarlar">
      {store.me && <AccountSection secret={store.me.secret} />}
      <Section eyebrow="Bildirimler">
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: t.fg }}>Ana takım bildirimleri</Text>
              <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 2, lineHeight: 18 }}>
                {firebaseAvailable()
                  ? `${store.mainTeam?.name ?? 'Ana takımın'} maç başlangıcı, golleri ve maç sonucu`
                  : 'Bu derlemede kullanılamıyor (Expo Go / web). Geliştirme ya da mağaza derlemesinde açılır.'}
              </Text>
            </View>
            <Switch value={!!store.notify} disabled={!firebaseAvailable() || !store.mainTeam}
              onValueChange={(on) => store.setNotify(on).then((ok) => { if (on && !ok) Alert.alert('Bildirim izni yok', 'iPhone Ayarlar → Tribün → Bildirimler bölümünden izin verebilirsin.'); })}
              accessibilityLabel="Ana takım bildirimleri" />
          </View>
          {row('Kilit ekranında canlı skor', 'Sonraki sürümde (iOS Live Activity).')}
        </Card>
      </Section>
      <Section eyebrow="Uygulama">
        <Card>
          {row('İlk açılış ekranını yeniden göster', undefined, true, store.restartOnboarding)}
          {row('Saat dilimi', 'Tüm maç saatleri Türkiye saatiyle (GMT+3)')}
        </Card>
      </Section>
      <Section eyebrow="Destek ve gizlilik">
        <Card>
          {row('Geri bildirim gönder', 'Hata ya da öneri; e-posta gerekmez', true, () => nav.navigate('Feedback'))}
          {row('Gizlilik ve KVKK', 'Hangi verileri neden işlediğimiz', false, () => Linking.openURL(`${PUBLIC_URL}/gizlilik`).catch(() => {}))}
          {store.me ? row('Hesabımı sil', `Takma ad (${store.me.name}), gruplar, mesajlar ve tahminler kalıcı olarak silinir`, false, confirmDelete) : null}
          {row('Sürüm', APP_VERSION)}
        </Card>
      </Section>
      <Section eyebrow="Veri">
        <Card>
          {row(`Veri kaynağı (${meta.providerName})`, quota, true)}
          {row('Canlı skor yenileme', refresh)}
          {row('Sunucu', API_URL)}
        </Card>
      </Section>
    </Screen>
  );
}
