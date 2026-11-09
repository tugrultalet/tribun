import React, { useLayoutEffect, useRef } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { gradientFor } from '../teamColors';
import { useTheme } from '../theme';
import { BackBar, ScreenTitle } from '../ui';

const IOS = Platform.OS === 'ios';

// Zemin: lig sayfalarında ligin, takım sayfasında takımın, diğer yerlerde takip edilen ilk takımın rengine göre geçiş.
export function Backdrop({ team, league }: { team?: string; league?: number }) {
  const first = useStore().teams[0]?.name;
  return <LinearGradient colors={gradientFor(team ?? first, league)} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />;
}

// Ortak ekran iskeleti.
// iOS'ta başlık yerel gezinme çubuğudur (büyük başlık, Liquid Glass); içerik onun altından kayar.
// Diğer platformlarda aynı başlık uygulama içinde çizilir.
export function Screen({ title, tab, right, team, league, children, onRefresh, refreshing, bottomInset }: {
  title?: string; tab?: boolean; right?: React.ReactNode; team?: string; league?: number; children: React.ReactNode; onRefresh?: () => void; refreshing?: boolean; bottomInset?: boolean;
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
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Backdrop team={team} league={league} />
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 4, paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={refresh}>
          {children}
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Backdrop team={team} league={league} />
      <SafeAreaView edges={bottomInset ? ['top', 'bottom'] : ['top']} style={{ flex: 1 }}>
        {tab ? <ScreenTitle title={title ?? ''} right={right} /> : <BackBar title={title} onBack={nav.goBack} />}
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: tab ? 112 : 28 }} keyboardShouldPersistTaps="handled" refreshControl={refresh}>
          {children}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
