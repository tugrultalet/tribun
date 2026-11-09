import React, { useLayoutEffect, useRef } from 'react';
import { Platform, RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { BackBar, ScreenTitle } from '../ui';

const IOS = Platform.OS === 'ios';

// Ortak ekran iskeleti.
// iOS'ta başlık yerel gezinme çubuğudur (büyük başlık, Liquid Glass); içerik onun altından kayar.
// Diğer platformlarda aynı başlık uygulama içinde çizilir.
export function Screen({ title, tab, right, children, onRefresh, refreshing, bottomInset }: {
  title?: string; tab?: boolean; right?: React.ReactNode; children: React.ReactNode; onRefresh?: () => void; refreshing?: boolean; bottomInset?: boolean;
}) {
  const t = useTheme();
  const nav = useNavigation();
  const rightRef = useRef(right);
  rightRef.current = right;
  const hasRight = !!right;
  useLayoutEffect(() => {
    if (!IOS) return;
    // Sekme ekranlarının başlığı App.tsx'te sabittir; yığın ekranlarında başlık veriye göre değişir.
    nav.setOptions({ ...(tab ? null : { title: title ?? '' }), headerRight: hasRight ? () => rightRef.current : undefined });
  }, [nav, tab, title, hasRight]);

  const refresh = onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.muted} /> : undefined;
  if (IOS) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: t.bg }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={refresh}>
        {children}
      </ScrollView>
    );
  }
  return (
    <SafeAreaView edges={bottomInset ? ['top', 'bottom'] : ['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {tab ? <ScreenTitle title={title ?? ''} right={right} /> : <BackBar title={title} onBack={nav.goBack} />}
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tab ? 112 : 28 }} keyboardShouldPersistTaps="handled" refreshControl={refresh}>
          {children}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
