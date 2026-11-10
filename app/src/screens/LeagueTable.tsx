import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRpc } from '../social';
import { useTheme } from '../theme';
import { Card, Empty, GAP, HAIR, Seg } from '../ui';

type Table = { members: number; active: number; top: { rank: number; name: string; points: number; exact: number; me: boolean }[]; me: { rank: number; points: number; exact: number } | null };

// Açık lig sıralaması (sunucuda hesaplanır): ilk 10 ve senin sıran. Hafta / sezon.
export function LeagueTable({ group, secret }: { group: string; secret: string }) {
  const t = useTheme();
  const [period, setPeriod] = useState<'week' | 'season'>('week');
  const { data } = useRpc<Table>('league_table', { p_secret: secret, p_group: group, p_period: period }, 60000);
  const head = { fontSize: 11.5, color: t.muted, fontWeight: '600' as const };
  const line = (rank: number, name: string, exact: number, points: number, me: boolean, first: boolean) => (
    <View key={`${rank}-${name}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderTopWidth: first ? 0 : HAIR, borderColor: t.line, backgroundColor: me ? t.accentSoft : 'transparent' }}>
      <Text style={{ width: 34, fontSize: 14, color: t.muted, fontVariant: ['tabular-nums'] }}>{rank}</Text>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: me ? '700' : '400', color: t.fg }}>{name}</Text>
      <Text style={{ width: 44, textAlign: 'right', fontSize: 14, color: t.muted, fontVariant: ['tabular-nums'] }}>{exact}</Text>
      <Text style={{ width: 48, textAlign: 'right', fontSize: 15, fontWeight: '700', color: t.fg, fontVariant: ['tabular-nums'] }}>{points}</Text>
    </View>
  );
  const top = Array.isArray(data?.top) ? data!.top : [];
  return (
    <>
      <View style={{ marginTop: GAP }}><Seg value={period} onChange={setPeriod} options={[['week', 'Hafta'], ['season', 'Sezon']]} /></View>
      {top.length ? (
        <Card style={{ marginTop: GAP, paddingVertical: 4 }}>
          <View style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 12 }}>
            <Text style={[head, { width: 34 }]}>#</Text><Text style={[head, { flex: 1 }]}>İlk 10</Text>
            <Text style={[head, { width: 44, textAlign: 'right' }]}>Tam</Text><Text style={[head, { width: 48, textAlign: 'right' }]}>P</Text>
          </View>
          {top.map((r, i) => line(r.rank, r.name, r.exact, r.points, r.me, i === 0))}
          {data?.me && !top.some((r) => r.me) && line(data.me.rank, 'Sen', data.me.exact, data.me.points, true, false)}
        </Card>
      ) : <Empty>{period === 'week' ? 'Bu hafta henüz biten maç yok.' : 'Henüz biten maç yok.'}</Empty>}
      {data && <Text style={{ fontSize: 12, color: t.muted, textAlign: 'center', marginTop: 10 }}>{data.members} üye · {data.active} kişi puan aldı{data.me ? '' : ' · biten maçta tahminin olunca sıran görünür'}</Text>}
    </>
  );
}
