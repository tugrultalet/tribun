import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme';

// Skor girişi: − / değer / +. Tahmin satırlarında ve Maç sayfasındaki tahmin kartında ortak kullanılır.
export function Stepper({ value, onChange, label, dim }: { value: number; onChange: (n: number) => void; label: string; dim?: boolean }) {
  const t = useTheme();
  const button = (text: string, delta: number) => (
    <Pressable onPress={() => onChange(Math.max(0, Math.min(20, value + delta)))} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${label} ${delta > 0 ? 'artır' : 'azalt'}`}
      style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }}>
      <Text style={{ fontSize: 18, lineHeight: 20, color: t.fg }}>{text}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {button('−', -1)}
      <Text style={{ width: 24, textAlign: 'center', fontSize: 22, fontWeight: '700', color: dim ? t.muted : t.fg, fontVariant: ['tabular-nums'] }}>{value}</Text>
      {button('+', 1)}
    </View>
  );
}
