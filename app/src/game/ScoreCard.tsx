import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../theme';
import { Card } from '../ui';
import { useMyPicks, useResults } from './hooks';
import { personalStats } from './stats';

// Kişisel oyun özeti (Gruplar sekmesinin üstünde): toplam puan, tam skor sayısı, isabet oranı ve biten tahmin sayısı.
export function ScoreCard() {
  const t = useTheme();
  const picks = useMyPicks(60000);
  const results = useResults(picks.data);
  const stats = useMemo(() => personalStats(picks.data ?? [], results), [picks.data, results.size]);
  const cell = (value: string, label: string, big?: boolean) => (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: big ? 30 : 22, fontWeight: '700', color: big ? t.accent : t.fg, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ fontSize: 11.5, color: t.muted }}>{label}</Text>
    </View>
  );
  return (
    <Card style={{ marginTop: 4, paddingVertical: 14, paddingHorizontal: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {cell(String(stats.total), 'Puan', true)}
        {cell(String(stats.exact), 'Tam skor')}
        {cell(stats.played ? `%${Math.round(stats.rate * 100)}` : '–', 'İsabet')}
        {cell(String(stats.played), 'Sonuçlanan')}
      </View>
      {picks.data && !picks.data.length && (
        <Text style={{ fontSize: 12.5, color: t.muted, textAlign: 'center', marginTop: 10, paddingHorizontal: 12 }}>Herhangi bir maça dokun, skor tahmini yap ve puan topla.</Text>
      )}
    </Card>
  );
}
