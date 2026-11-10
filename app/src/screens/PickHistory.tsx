import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useMyPicks, useOpenMatches, usePoints, useResults } from '../game/hooks';
import { PicksList, splitPicks } from '../game/PicksView';
import { summary } from '../game/profile';
import { useTheme } from '../theme';
import { Card, Empty } from '../ui';
import { Screen } from './Screen';

// Geçmiş tahminler: üstte toplam (tahmin, tam skor, isabet), altta haftalara bölünmüş tek satırlık liste.
export default function PickHistory() {
  const t = useTheme();
  const picks = useMyPicks(60000);
  const all = picks.data ?? [];
  const results = useResults(all);
  const open = useOpenMatches(all);
  const ledger = usePoints();
  const past = useMemo(() => splitPicks(all, results, open).past, [all, results.size, open.size]);
  const s = useMemo(() => summary(past, results, Date.now(), ledger), [past, results.size, ledger]);
  const cell = (value: string, label: string) => (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: t.fg, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ fontSize: 11.5, color: t.muted }}>{label}</Text>
    </View>
  );
  return (
    <Screen title="Geçmiş tahminler" onRefresh={picks.reload}>
      {past.length ? (
        <>
          <Card style={{ marginTop: 4, paddingVertical: 12, flexDirection: 'row' }}>
            {cell(String(past.length), 'tahmin')}{cell(String(s.exact), 'tam skor')}{cell(s.played ? `%${Math.round(s.rate * 100)}` : '–', 'isabet')}
          </Card>
          <PicksList picks={past} title="Haftalar" />
        </>
      ) : <Empty>{picks.data ? 'Henüz biten maçta tahminin yok.' : 'Yükleniyor…'}</Empty>}
    </Screen>
  );
}
