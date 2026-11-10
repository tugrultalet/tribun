import React, { useLayoutEffect, useRef, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { gradientFor } from '../teamColors';
import { useTheme } from '../theme';
import { BackBar, ScreenTitle } from '../ui';

const IOS = Platform.OS === 'ios';

function useBackdropColors(team?: string, league?: number) {
  const store = useStore();
  return gradientFor(team ?? store.mainTeam?.name, league ? store.league(league)?.key : undefined);
}

const TITLE_HEIGHT = 46;

// Zemin: lig sayfalarında ligin, takım sayfasında takımın, diğer yerlerde takip edilen ilk takımın rengine göre geçiş.
export function Backdrop({ team, league }: { team?: string; league?: number }) {
  const colors = useBackdropColors(team, league);
  return <LinearGradient colors={colors} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />;
}

// Ortak ekran iskeleti.
// iOS'ta yığın ekranlarının başlığı yerel gezinme çubuğudur (Liquid Glass); içerik onun altından kayar.
// Sekme ekranlarında ve diğer platformlarda başlık uygulama içinde çizilir.
// `onRefresh`: aşağı çekince çağrılır. Yenileme göstergesi yalnızca kullanıcı çekince görünür; arka plandaki otomatik
// yenilemeler göstergeyi açmaz (açarsa iOS içeriği aşağı iterek ekranı zıplatır).
export function Screen({ title, tab, right, team, league, children, onRefresh, bottomInset }: {
  title?: string; tab?: boolean; right?: React.ReactNode; team?: string; league?: number; children: React.ReactNode; onRefresh?: () => unknown; bottomInset?: boolean;
}) {
  const [pulling, setPulling] = useState(false);
  const pull = async () => { setPulling(true); try { await onRefresh?.(); } finally { setPulling(false); } };
  const t = useTheme();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const top = useBackdropColors(team, league)[0];
  const rightRef = useRef(right);
  rightRef.current = right;
  const hasRight = !!right;
  useLayoutEffect(() => {
    // Sekme ekranlarında yerel başlık yoktur; başlık içerikle birlikte, ekranın en üstünde çizilir.
    if (!IOS || tab) return;
    nav.setOptions({ title: title ?? '', headerRight: hasRight ? () => rightRef.current : undefined });
  }, [nav, tab, title, hasRight]);

  const refresh = onRefresh ? <RefreshControl refreshing={pulling} onRefresh={pull} tintColor={t.muted} /> : undefined;
  if (IOS) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Backdrop team={team} league={league} />
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: tab ? TITLE_HEIGHT : 4, paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={refresh}>
          {children}
        </ScrollView>
        {tab && (
          // Sabit başlık: içerik altından kayar ve başlığın altında zemine doğru solar.
          <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
            <LinearGradient pointerEvents="none" colors={[top, top, `${top}00`]} locations={[0, 0.72, 1]} style={[StyleSheet.absoluteFill, { bottom: -14 }]} />
            <View style={{ paddingTop: insets.top }}><ScreenTitle title={title ?? ''} right={right} /></View>
          </View>
        )}
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
