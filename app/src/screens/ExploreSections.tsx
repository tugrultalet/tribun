import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNav } from '../nav';
import { useRpc } from '../social';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Card, HAIR, Section } from '../ui';

type Popular = { match_id: number; home: string; away: string; kickoff: string; n: number; h: number; d: number; a: number };
type Board = { active: number; top: { rank: number; name: string; points: number; me: boolean }[]; me: { rank: number; points: number } | null };
type Explore = { popular?: Popular[]; week?: Board; fans?: Board & { team: number } };

// Keşfet'in üstündeki bölümler. Sunucu eşik aşılmadıysa bölümü hiç göndermez (eşikler veritabanında ayarlanır):
// "Bugün en çok tahmin edilenler" (maç başına ≥20 tahmin), "Haftanın en iyileri" (bu hafta ≥500 kişi puan aldıysa).
export function ExploreSections() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const { data } = useRpc<Explore>('explore', store.me ? { p_secret: store.me.secret } : {}, 300000);
  if (!data || typeof data !== 'object') return null;
  const pct = (x: number, n: number) => `%${Math.round((x / n) * 100)}`;
  const board = (title: string, b: Board) => (
    <Section eyebrow={title}>
      <Card>
        {b.top.map((r, i) => (
          <View key={`${r.rank}-${r.name}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 14, borderTopWidth: i ? HAIR : 0, borderColor: t.line, backgroundColor: r.me ? t.accentSoft : 'transparent' }}>
            <Text style={{ width: 28, fontSize: 14, color: t.muted, fontVariant: ['tabular-nums'] }}>{r.rank}</Text>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: r.me ? '700' : '400', color: t.fg }}>{r.name}</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: t.fg, fontVariant: ['tabular-nums'] }}>{r.points}</Text>
          </View>
        ))}
        {b.me && !b.top.some((r) => r.me) && (
          <View style={{ flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 14, borderTopWidth: HAIR, borderColor: t.line, backgroundColor: t.accentSoft }}>
            <Text style={{ width: 28, fontSize: 14, color: t.muted }}>{b.me.rank}</Text>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: t.fg }}>Sen</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: t.fg }}>{b.me.points}</Text>
          </View>
        )}
      </Card>
    </Section>
  );
  const fanTeam = data.fans ? store.teams.find((x) => x.id === data.fans!.team)?.name : undefined;
  return (
    <>
      {Array.isArray(data.popular) && data.popular.length > 0 && (
        <Section eyebrow="Bugün en çok tahmin edilenler">
          <Card>
            {data.popular.map((m, i) => (
              <Pressable key={m.match_id} onPress={() => nav.navigate('Match', { id: m.match_id })} accessibilityRole="button"
                style={({ pressed }) => ({ paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: i ? HAIR : 0, borderColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
                <Text numberOfLines={1} style={{ fontSize: 15, color: t.fg }}>{m.home} – {m.away}</Text>
                <Text numberOfLines={1} style={{ fontSize: 12.5, color: t.muted, marginTop: 2 }}>{m.n} tahmin · {m.home} {pct(m.h, m.n)} · X {pct(m.d, m.n)} · {m.away} {pct(m.a, m.n)}</Text>
              </Pressable>
            ))}
          </Card>
        </Section>
      )}
      {data.week && board('Haftanın en iyileri · Türkiye', data.week)}
      {data.fans && board(fanTeam ? `${fanTeam} taraftarları · bu hafta` : 'Taraftarlar · bu hafta', data.fans)}
    </>
  );
}
