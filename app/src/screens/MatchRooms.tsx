import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Fixture } from '../api';
import { roomsToShow } from '../chat/rooms';
import { useNav } from '../nav';
import { useRpc } from '../social';
import { useTheme } from '../theme';
import { Card, HAIR, Icon, LiveDot } from '../ui';

type Room = { match_id: number; kickoff: string; home: string | null; away: string | null; state: 'soon' | 'open' | 'closed'; messages: number };

// Grup ekranında maç odaları: açık odalar (maçtan 1 saat önce açılır, bitince 1 saat sonra kapanır), yakında açılacaklar
// ve son 7 günün arşivi (salt okunur). Grubun tek sohbeti bunlar; hiç oda yoksa ne zaman açılacağı yazar.
export function MatchRooms({ group, fixtures, secret }: { group: string; fixtures: Fixture[]; secret: string }) {
  const t = useTheme();
  const nav = useNav();
  const { open, soon } = useMemo(() => roomsToShow(fixtures), [fixtures]);
  const archivedRaw = useRpc<Room[]>('group_rooms', { p_secret: secret, p_group: group }, 60000).data;
  const archived = (Array.isArray(archivedRaw) ? archivedRaw : []).filter((r) => r.state === 'closed' && r.messages > 0 && !open.some((f) => f.id === r.match_id)).slice(0, 5);
  if (!open.length && !soon.length && !archived.length) {
    return (
      <View style={{ marginTop: 16 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: t.muted, marginBottom: 6, marginLeft: 4 }}>MAÇ SOHBETİ</Text>
        <Card style={{ padding: 14 }}>
          <Text style={{ fontSize: 13.5, color: t.muted, lineHeight: 19 }}>💬 Grubun sohbeti maçlara özel: her maçın odası başlamadan 1 saat önce açılır, maç bitince kapanır.</Text>
        </Card>
      </View>
    );
  }
  const go = (match: number, home: string, away: string, kickoff: number) =>
    nav.navigate('Chat', { id: group, name: `${home} – ${away}`, match, home, away, kickoff });
  const row = (key: string, first: boolean, title: string, sub: React.ReactNode, onPress?: () => void, live?: boolean) => (
    <Pressable key={key} disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderTopWidth: first ? 0 : HAIR, borderColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
      {live ? <LiveDot /> : null}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, color: onPress ? t.fg : t.muted }}>{title}</Text>
        <Text numberOfLines={1} style={{ fontSize: 12.5, color: t.muted, marginTop: 1 }}>{sub}</Text>
      </View>
      {onPress ? <Icon.chevron color={t.fg} /> : null}
    </Pressable>
  );
  const hm = (ts: number) => new Date(ts * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
  let i = 0;
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: t.muted, marginBottom: 6, marginLeft: 4 }}>MAÇ SOHBETİ</Text>
      <Card>
        {open.map((f) => row(`o${f.id}`, i++ === 0, `${f.h.name} – ${f.a.name}`, f.st === 'live' ? 'Canlı · oda açık' : f.st === 'ft' ? 'Maç bitti · oda 1 saat daha açık' : `${hm(f.ts)} · oda açık`,
          () => go(f.id, f.h.name, f.a.name, f.ts), f.st === 'live'))}
        {soon.map((f) => row(`s${f.id}`, i++ === 0, `${f.h.name} – ${f.a.name}`, `Oda ${hm(f.ts - 3600)}'de açılır`))}
        {archived.map((r) => row(`a${r.match_id}`, i++ === 0, `${r.home ?? ''} – ${r.away ?? ''}`, `Arşiv · ${r.messages} mesaj · 7 gün saklanır`,
          () => go(r.match_id, r.home ?? '', r.away ?? '', Date.parse(r.kickoff) / 1000)))}
      </Card>
    </View>
  );
}
