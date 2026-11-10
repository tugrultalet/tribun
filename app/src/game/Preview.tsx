import React from 'react';
import { Text, View } from 'react-native';
import { Fixture, Odds, Standings, StandingRow, useApi } from '../api';
import { useNav } from '../nav';
import { teamColor } from '../teamColors';
import { useTheme } from '../theme';
import { Card, Crest, HAIR } from '../ui';
import { Pressable } from 'react-native';
import { useRpc } from '../social';
import { useStore } from '../store';
import type { Community } from './hooks';

export const useOdds = (f: Fixture) => useApi<Odds>(f.st === 'ns' ? `/api/match/${f.id}/odds` : null);

// Maç öncesi ihtimaller: bahis piyasası (ortalama oranlardan) ve Tribün kullanıcılarının tahminleri, takım renklerinde
// iki bar. Tribün satırı en az 20 tahminle ve kendi tahminini girdikten sonra görünür (kimse kalabalığı kopyalamasın);
// hiçbiri yoksa kart hiç görünmez.
export function OddsCard({ f }: { f: Fixture }) {
  const t = useTheme();
  const secret = useStore().me?.secret;
  const o = useOdds(f).data?.odds;
  const c = useRpc<Community>('match_community', secret ? { p_secret: secret, p_match: f.id } : null, 60000).data;
  const crowd = c && !c.hidden && c.tribun ? c.tribun : null;
  if (!o && !crowd) return null;
  const hc = teamColor(f.h.name) ?? t.accent, ac0 = teamColor(f.a.name) ?? '#FFA53D';
  const ac = ac0 === hc ? '#FFA53D' : ac0;
  const toPct = (d: { n: number; h: number; d: number; a: number }): [number, number, number] => {
    const h = Math.round((d.h / d.n) * 100), a = Math.round((d.a / d.n) * 100);
    return [h, 100 - h - a, a];
  };
  const block = (label: string, right: string, pct: [number, number, number], first: boolean) => (
    <View style={{ marginTop: first ? 12 : 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: t.fg }}>{label}</Text>
        <Text style={{ fontSize: 11.5, color: t.muted, fontVariant: ['tabular-nums'] }}>{right}</Text>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        {pct.map((x, i) => (
          <Text key={i} style={{ flex: 1, textAlign: i === 0 ? 'left' : i === 1 ? 'center' : 'right', fontSize: 20, fontWeight: '700', color: i === 1 ? t.muted : t.fg, fontVariant: ['tabular-nums'] }}>%{x}</Text>
        ))}
      </View>
      <View accessibilityLabel={`${label}: ${f.h.name} yüzde ${pct[0]}, beraberlik yüzde ${pct[1]}, ${f.a.name} yüzde ${pct[2]}`}
        style={{ flexDirection: 'row', height: 9, borderRadius: 99, overflow: 'hidden', gap: 2, marginTop: 6 }}>
        <View style={{ flex: Math.max(pct[0], 1), backgroundColor: hc }} />
        <View style={{ flex: Math.max(pct[1], 1), backgroundColor: '#8E8E93' }} />
        <View style={{ flex: Math.max(pct[2], 1), backgroundColor: ac }} />
      </View>
    </View>
  );
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ fontSize: 12.5, fontWeight: '700', letterSpacing: 0.4, color: t.muted, marginHorizontal: 4, marginBottom: 8 }}>MAÇ ÖNCESİ İHTİMALLER</Text>
      <Card style={{ padding: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Crest uri={f.h.logo} size={20} /><Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '600', color: t.fg, flexShrink: 1 }}>{f.h.name}</Text>
          </View>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 12.5, color: t.muted }}>Beraberlik</Text>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
            <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '600', color: t.fg, flexShrink: 1, textAlign: 'right' }}>{f.a.name}</Text><Crest uri={f.a.logo} size={20} />
          </View>
        </View>
        {o && block('Bahis piyasası', `oranlar ${o.odds.map((x) => x.toFixed(2)).join(' · ')}`, o.pct, true)}
        {crowd && block('Tribün tahminleri', `${crowd.n} kişi`, toPct(crowd), !o)}
      </Card>
    </View>
  );
}

// Son 5 maç (eskiden yeniye, en yeni sağda) ve puan durumundaki sıra; iki takım alt alta, logolarıyla.
const LETTER: Record<string, string> = { W: 'G', D: 'B', L: 'M' };
export function FormCard({ f }: { f: Fixture }) {
  const t = useTheme();
  const nav = useNav();
  const st = useApi<Standings>(`/api/standings/${f.lg}`);
  const rows = (st.data?.groups ?? []).flatMap((g) => g.rows);
  const find = (id: number) => rows.find((r) => r.team.id === id);
  const h = find(f.h.id), a = find(f.a.id);
  if (!h && !a) return null;
  const tone = (c: string) => (c === 'W' ? t.win : c === 'L' ? t.loss : t.draw);
  const line = (r: StandingRow | undefined, team: Fixture['h'], first: boolean) => (
    <Pressable onPress={() => nav.navigate('Team', { team })} accessibilityRole="button"
      accessibilityLabel={`${r ? `${r.rank}. sırada ` : ''}${team.name}, son maçlar ${r ? [...r.form].reverse().map((c) => LETTER[c]).join(' ') : 'yok'}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderTopWidth: first ? 0 : HAIR, borderColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
      <Text style={{ width: 28, fontSize: 14, fontWeight: '700', color: t.muted, fontVariant: ['tabular-nums'] }}>{r ? `${r.rank}.` : '–'}</Text>
      <Crest uri={team.logo} size={24} />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '600', color: t.fg }}>{team.name}</Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {r ? [...r.form].reverse().map((c, i) => (
          <View key={i} style={{ width: 20, height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: tone(c) }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>{LETTER[c] ?? c}</Text>
          </View>
        )) : null}
      </View>
    </Pressable>
  );
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ fontSize: 12.5, fontWeight: '700', letterSpacing: 0.4, color: t.muted, marginHorizontal: 4, marginBottom: 8 }}>PUAN DURUMU VE SON 5 MAÇ</Text>
      <Card>{line(h, f.h, true)}{line(a, f.a, false)}</Card>
    </View>
  );
}
