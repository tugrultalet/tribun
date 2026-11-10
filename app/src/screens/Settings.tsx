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
import { providerName } from '../auth';

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
      <Section eyebrow="Hesap">
        <Card>
          <Pressable onPress={() => nav.navigate('Account')} accessibilityRole="button"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
            <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accentSoft }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: t.fg }}>{(store.me?.name ?? '?').slice(0, 1).toLocaleUpperCase('tr')}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: t.fg }}>{store.me?.name ?? 'Hesap oluştur'}</Text>
              <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 2 }}>
                {!store.me ? 'Takma ad seç ya da önceki hesabınla gir' : store.me.provider ? `${providerName(store.me.provider)} hesabına bağlı` : 'Hesap bağlı değil · veriler yalnızca bu telefonda'}
              </Text>
            </View>
            <Icon.chevron color={t.fg} />
          </Pressable>
        </Card>
      </Section>
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
        </Card>
      </Section>
      <LockScreenTeams />
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

// Kilit ekranında canlı skor: listedeki takımların maçı başlarken (ya da 30 dk kala) uygulama açıldığında kilit ekranı ve
// Dynamic Island kartı kendiliğinden açılır. Takip edilen her takım listede başlar; sola kaydırınca listeden çıkar.
// Çıkarılanlar "+ Takım ekle" ile geri eklenir.
function LockScreenTeams() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const [adding, setAdding] = React.useState(false);
  const supported = liveSupported();
  const ordered = [...store.teams].sort((a, b) => Number(b.id === store.main) - Number(a.id === store.main));
  const on = ordered.filter((x) => store.liveFor(x.id));
  const off = ordered.filter((x) => !store.liveFor(x.id));
  return (
    <Section eyebrow="Kilit ekranında canlı skor">
      <Card>
        <Text style={{ fontSize: 12.5, color: t.muted, lineHeight: 18, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 }}>
          {supported
            ? "Bu takımların maçı başlarken kilit ekranında ve Dynamic Island'da canlı skor kendiliğinden açılır. Çıkarmak için sola kaydır."
            : 'iOS 18 ve üzeri gerekir (iPhone Ayarlar → Tribün → Canlı Etkinlikler açık olmalı).'}
        </Text>
        {on.map((team) => (
          <View key={team.id} style={{ borderTopWidth: HAIR, borderColor: t.line }}>
            <SwipeRow label="Kaldır" onAction={() => store.setLiveFor(team.id, false)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 14 }}>
                <Crest uri={team.logo} size={26} />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: t.fg }}>{team.name}{team.id === store.main ? ' ★' : ''}</Text>
              </View>
            </SwipeRow>
          </View>
        ))}
        {!on.length && <Text style={{ fontSize: 13.5, color: t.muted, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: HAIR, borderColor: t.line }}>Listede takım yok.</Text>}
        {off.length > 0 && !adding && (
          <Pressable onPress={() => setAdding(true)} accessibilityRole="button" style={{ paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: HAIR, borderColor: t.line }}>
            <Text style={{ color: t.accent, fontWeight: '600', fontSize: 15 }}>+ Takım ekle</Text>
          </Pressable>
        )}
        {adding && off.map((team) => (
          <Pressable key={team.id} onPress={() => { store.setLiveFor(team.id, true); if (off.length === 1) setAdding(false); }} accessibilityRole="button"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 14, borderTopWidth: HAIR, borderColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
            <Crest uri={team.logo} size={26} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: t.muted }}>{team.name}</Text>
            <Text style={{ color: t.accent, fontWeight: '700', fontSize: 15 }}>Ekle</Text>
          </Pressable>
        ))}
        {!ordered.length && (
          <Pressable onPress={() => nav.navigate('Picker')} accessibilityRole="button" style={{ paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: HAIR, borderColor: t.line }}>
            <Text style={{ color: t.accent, fontWeight: '600' }}>+ Takım takip et</Text>
          </Pressable>
        )}
      </Card>
    </Section>
  );
}
