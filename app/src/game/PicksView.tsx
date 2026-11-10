import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNav } from '../nav';
import { useTheme } from '../theme';
import { Card, Empty, GAP, HAIR, Section, Seg } from '../ui';
import { useOpenMatches, useResults } from './hooks';
import { BADGES, Filter, PickRow, byWeek, summary } from './profile';
import type { MyPick } from './stats';

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
function weekLabel(start: string): string {
  const a = new Date(`${start}T00:00:00Z`), b = new Date(a.getTime() + 6 * 86400000);
  const m = (d: Date) => MONTHS[d.getUTCMonth()];
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${b.getUTCDate()} ${m(b)}` : `${a.getUTCDate()} ${m(a)} – ${b.getUTCDate()} ${m(b)}`;
}

// Profil özeti: sezon puanı, isabet, seri ve seri rozetleri (3/5/10 maç üst üste doğru sonuç).
export function SummaryCard({ picks }: { picks: MyPick[] }) {
  const t = useTheme();
  const results = useResults(picks);
  const s = useMemo(() => summary(picks, results), [picks, results.size]);
  const cell = (value: string, label: string, big?: boolean) => (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: big ? 30 : 22, fontWeight: '700', color: big ? t.accent : t.fg, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ fontSize: 11.5, color: t.muted }}>{label}</Text>
    </View>
  );
  return (
    <Card style={{ marginTop: 4, paddingVertical: 14, paddingHorizontal: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {cell(String(s.total), 'Sezon puanı', true)}
        {cell(s.played ? `%${Math.round(s.rate * 100)}` : '–', 'İsabet')}
        {cell(String(s.streak), 'Seri')}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 12 }}>
        {BADGES.map((n) => {
          const on = s.badges.includes(n);
          return (
            <View key={n} accessibilityLabel={`${n} maçlık seri rozeti${on ? '' : ' (henüz yok)'}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 99, backgroundColor: on ? t.accentSoft : t.surface2, opacity: on ? 1 : 0.5 }}>
              <Text style={{ fontSize: 13 }}>🔥</Text>
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? t.fg : t.muted }}>{n}</Text>
            </View>
          );
        })}
      </View>
      {!picks.length && <Text style={{ fontSize: 12.5, color: t.muted, textAlign: 'center', marginTop: 10, paddingHorizontal: 12 }}>Herhangi bir maça dokun, skor tahmini yap ve puan topla.</Text>}
    </Card>
  );
}

// Tahminler: haftalara bölünmüş liste; Tümü / Tam skor / Kaçanlar. Satıra dokununca maç açılır.
export function PicksList({ picks, title = 'Tahminlerim' }: { picks: MyPick[]; title?: string }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(6);
  const results = useResults(picks);
  const open = useOpenMatches(picks);
  const weeks = useMemo(() => byWeek(picks, results, filter), [picks, results.size, filter]);
  const t = useTheme();
  if (!picks.length) return null;
  return (
    <Section eyebrow={title}>
      <Seg value={filter} onChange={(f) => { setFilter(f); setShown(6); }} options={[['all', 'Tümü'], ['exact', 'Tam skor'], ['miss', 'Kaçanlar']]} />
      {weeks.length ? weeks.slice(0, shown).map((w) => (
        <View key={w.start} style={{ marginTop: GAP }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 6 }}>
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.muted }}>{weekLabel(w.start)}</Text>
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.muted }}>{w.points} puan</Text>
          </View>
          <Card>{w.rows.map((r, i) => <PickLine key={r.pick.match_id} row={r} first={i === 0} names={open.get(r.pick.match_id)} />)}</Card>
        </View>
      )) : <Empty>{filter === 'exact' ? 'Henüz tam skor yok.' : 'Kaçan tahmin yok.'}</Empty>}
      {weeks.length > shown && (
        <Pressable onPress={() => setShown((n) => n + 6)} accessibilityRole="button" style={{ alignSelf: 'center', padding: 12, marginTop: 4 }}>
          <Text style={{ color: t.accent, fontWeight: '600' }}>Daha eski haftalar</Text>
        </Pressable>
      )}
    </Section>
  );
}

function PickLine({ row, first, names }: { row: PickRow; first: boolean; names?: { h: { name: string }; a: { name: string } } }) {
  const t = useTheme();
  const nav = useNav();
  const m = row.result?.h && row.result?.a ? { h: row.result.h, a: row.result.a } : names;
  const tone = row.outcome === 'exact' ? t.win : row.outcome === 'correct' ? t.accent : row.outcome === 'miss' ? t.muted : t.muted;
  const label = row.pts === null ? (row.result ? 'Geçersiz' : 'Bekliyor') : `+${row.pts}`;
  return (
    <Pressable onPress={() => nav.navigate('Match', { id: row.pick.match_id })} accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderTopWidth: first ? 0 : HAIR, borderColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 14.5, color: t.fg }}>{m ? `${m.h.name} – ${m.a.name}` : 'Maç'}</Text>
        <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 2, fontVariant: ['tabular-nums'] }}>
          Tahmin {row.pick.h}–{row.pick.a}{row.result ? ` · Sonuç ${row.result.s[0]}–${row.result.s[1]}` : ''}
        </Text>
      </View>
      <Text style={{ fontSize: 14, fontWeight: '700', color: tone, fontVariant: ['tabular-nums'] }}>{label}</Text>
    </Pressable>
  );
}
