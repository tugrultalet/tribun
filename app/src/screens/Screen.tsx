import React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

// Ortak ekran iskeleti: güvenli alan, sabit üst kısım, kaydırılabilir içerik.
export function Screen({ header, children, onRefresh, refreshing, bottomInset, topColor }: {
  header?: React.ReactNode; children: React.ReactNode; onRefresh?: () => void; refreshing?: boolean; bottomInset?: boolean; topColor?: string;
}) {
  const t = useTheme();
  return (
    <SafeAreaView edges={bottomInset ? ['top', 'bottom'] : ['top']} style={{ flex: 1, backgroundColor: topColor || t.bg }}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {header}
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.muted} /> : undefined}>
          {children}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
