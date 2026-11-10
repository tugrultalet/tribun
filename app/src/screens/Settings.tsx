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
import { Card, Crest, Icon, Section, SwipeRow, HAIR } from '../ui';
import { Screen } from './Screen';
import { liveSupported } from '../live';

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
  const refresh = meta.liveTtl >= 60 ? `${Math.round(meta.liveTtl / 60)} dakikada bir` : `${meta.liveTtl} saniyede bir`;
  const quota = meta.error ? meta.error : `${meta.plan ?? '–'} plan · bugün ${meta.used ?? '–'} / ${meta.limitDay ?? '–'} istek kullanıldı`;
  return (
    <Screen title="Ayarlar">
      <Section eyebrow="Bildirimler">
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: t.fg }}>Maç bildirimleri</Text>
              <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 2, lineHeight: 18 }}>
                {firebaseAvailable() ? 'Takımlarının maç başlangıcı, golleri ve maç sonu' : 'Bu derlemede kullanılamıyor (Expo Go / web).'}
              </Text>
            </View>
            <Switch value={!!store.notify} disabled={!firebaseAvailable() || !store.teams.length}
              onValueChange={(on) => store.setNotify(on).then((ok) => { if (on && !ok) Alert.alert('Bildirim izni yok', 'iPhone Ayarlar → Tribün → Bildirimler bölümünden izin verebilirsin.'); })}
              accessibilityLabel="Maç bildirimleri" />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: HAIR, borderColor: t.line }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: t.fg }}>Tahmin hatırlatması</Text>
              <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 2, lineHeight: 18 }}>Takımlarının maçından 1 saat önce: "Skoru tahmin et"</Text>
            </View>
            <Switch value={store.remind} disabled={!firebaseAvailable() || !store.teams.length}
              onValueChange={(on) => store.setRemind(on).then((ok) => { if (on && !ok) Alert.alert('Bildirim izni yok', 'iPhone Ayarlar → Tribün → Bildirimler bölümünden izin verebilirsin.'); })}
              accessibilityLabel="Tahmin hatırlatması" />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: HAIR, borderColor: t.line }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: t.fg }}>Kilit ekranında canlı skor</Text>
              <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 2, lineHeight: 18 }}>
                {liveSupported() ? "Takımlarının maçı başlayınca kilit ekranında ve Dynamic Island'da kendiliğinden açılır" : 'iOS 18 ve üzeri gerekir (iPhone Ayarlar → Tribün → Canlı Etkinlikler açık olmalı).'}
              </Text>
            </View>
            <Switch value={liveSupported() && store.liveOn !== false} disabled={!liveSupported()} onValueChange={store.setLiveOn} accessibilityLabel="Kilit ekranında canlı skor" />
          </View>
        </Card>
      </Section>
      <Section eyebrow="Destek ve gizlilik">
        <Card>
          {row('Geri bildirim gönder', 'Hata ya da öneri; e-posta gerekmez', true, () => nav.navigate('Feedback'))}
          {row('Gizlilik ve KVKK', 'Hangi verileri neden işlediğimiz', false, () => Linking.openURL(`${PUBLIC_URL}/gizlilik`).catch(() => {}))}
          {row('Sürüm', `${APP_VERSION} · ${meta.providerName}${meta.plan ? ` ${meta.plan}` : ''}`)}
        </Card>
      </Section>
    </Screen>
  );
}

