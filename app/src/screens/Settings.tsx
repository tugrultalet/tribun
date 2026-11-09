import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { API_URL } from '../api';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Card, Icon, ScreenTitle, Section } from '../ui';
import { Screen } from './Screen';

export default function Settings() {
  const t = useTheme();
  const store = useStore();
  const { meta, reloadMeta } = store;
  useFocusEffect(React.useCallback(() => { reloadMeta(); }, [reloadMeta]));
  const row = (title: string, detail?: string, first?: boolean, onPress?: () => void) => (
    <Pressable key={title} disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderTopWidth: first ? 0 : 1, borderColor: t.line }}>
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
    <Screen header={<ScreenTitle title="Ayarlar" />}>
      <Section eyebrow="Bildirimler">
        <Card>{row('Gol bildirimi ve kilit ekranında canlı skor', 'Sonraki sürümde. Sunucudan anlık bildirim ve iOS Live Activity gerektiriyor.', true)}</Card>
      </Section>
      <Section eyebrow="Uygulama">
        <Card>
          {row('İlk açılış ekranını yeniden göster', undefined, true, store.restartOnboarding)}
          {row('Saat dilimi', 'Tüm maç saatleri Türkiye saatiyle (GMT+3)')}
        </Card>
      </Section>
      <Section eyebrow="Veri">
        <Card>
          {row('Veri kaynağı (Highlightly)', quota, true)}
          {row('Canlı skor yenileme', refresh)}
          {row('Sunucu', API_URL)}
        </Card>
      </Section>
    </Screen>
  );
}
