import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNav } from '../nav';
import { useTheme } from '../theme';
import { Card, Empty, GAP, HAIR, Section, Seg, SwipeRow } from '../ui';
import { Alert, Platform } from 'react-native';
import { rpc } from '../social';
import { useStore } from '../store';
import { track } from '../telemetry';
import { useOpenMatches, usePoints, useResults } from './hooks';
import { abbr } from '../chat/timeline';
import { Crest } from '../ui';
import { Filter, PickRow, byWeek, summary } from './profile';
import type { MyPick, OpenMatch } from './stats';

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
function weekLabel(start: string): string {
  const a = new Date(`${start}T00:00:00Z`), b = new Date(a.getTime() + 6 * 86400000);
  const m = (d: Date) => MONTHS[d.getUTCMonth()];
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${b.getUTCDate()} ${m(b)}` : `${a.getUTCDate()} ${m(a)} – ${b.getUTCDate()} ${m(b)}`;
}

// Profil özeti: sezon puanı, isabet ve seri (üst üste doğru sonuç bilinen tahmin sayısı).
export function SummaryCard({ picks, profile }: { picks: MyPick[]; profile?: string }) {
  const t = useTheme();
  const results = useResults(picks);
  const ledger = usePoints(profile);
  const s = useMemo(() => summary(picks, results, Date.now(), ledger), [picks, results.size, ledger]);
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
        {cell(s.streak ? `${s.streak} 🔥` : '0', 'üst üste doğru')}
      </View>
      {!picks.length && <Text style={{ fontSize: 12.5, color: t.muted, textAlign: 'center', marginTop: 10, paddingHorizontal: 12 }}>Herhangi bir maça dokun, skor tahmini yap ve puan topla.</Text>}
    </Card>
  );
}

// Tahminler: haftalara bölünmüş liste; Tümü / Tam skor / Kaçanlar. Satıra dokununca maç açılır.
// bare: Profilim'in Geçmiş sekmesi için başlıksız ve filtresiz (Tümü / Tam skor / Kaçanlar yok), doğrudan tüm haftalar.
export function PicksList({ picks, title = 'Tahminlerim', profile, bare }: { picks: MyPick[]; title?: string; profile?: string; bare?: boolean }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(6);
  const results = useResults(picks);
  const open = useOpenMatches(picks);
  const ledger = usePoints(profile);
  const weeks = useMemo(() => byWeek(picks, results, filter, ledger), [picks, results.size, filter, ledger]);
  const t = useTheme();
  if (!picks.length) return null;
  const body = (
    <>
      {!bare && <Seg value={filter} onChange={(f) => { setFilter(f); setShown(6); }} options={[['all', 'Tümü'], ['exact', 'Tam skor'], ['miss', 'Kaçanlar']]} />}
      {weeks.length ? weeks.slice(0, shown).map((w, i) => (
        <View key={w.start} style={{ marginTop: bare && i === 0 ? 0 : GAP }}>
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
    </>
  );
  return bare ? <View>{body}</View> : <Section eyebrow={title}>{body}</Section>;
}

type Teams = { h: { name: string; logo?: string }; a: { name: string; logo?: string } };

// Tek satır: logo · kısaltma · sonuç · kısaltma · logo · tahmin · puan. Sürpriz/joker küçük işaretle gösterilir.
function PickLine({ row, first, names }: { row: PickRow; first: boolean; names?: OpenMatch }) {
  const t = useTheme();
  const m: Teams | undefined = row.result?.h && row.result?.a ? { h: row.result.h, a: row.result.a } : names;
  const tone = row.outcome === 'exact' ? t.win : row.outcome === 'correct' ? t.accent : t.muted;
  const label = row.pts === null ? (row.result ? 'Geçersiz' : '–') : `+${row.pts}`;
  const mark = [row.bonus ? `+${row.bonus}` : '', row.joker || row.pick.joker ? '×2' : ''].filter(Boolean).join(' ');
  const mid = row.result ? `${row.result.s[0]}–${row.result.s[1]}` : '–';
  return (
    <CompactRow first={first} id={row.pick.match_id} m={m} mid={mid}
      a11y={`${m ? `${m.h.name} ${mid} ${m.a.name}` : 'Maç'}, tahmin ${row.pick.h}–${row.pick.a}, ${row.pts === null ? 'puan yok' : `${row.pts} puan`}`}
      pick={`${row.pick.h}–${row.pick.a}`} mark={mark}
      right={<Text style={{ width: 52, textAlign: 'right', fontSize: 14, fontWeight: '700', color: tone, fontVariant: ['tabular-nums'] }}>{label}</Text>} />
  );
}

// Profil ve geçmiş sayfasında ortak tek satırlık tahmin satırı.
export function CompactRow({ first, id, m, mid, midTone, pick, mark, right, a11y }: { first: boolean; id: number; m?: Teams; mid: string; midTone?: string; pick: string; mark?: string; right: React.ReactNode; a11y: string }) {
  const t = useTheme();
  const nav = useNav();
  const side = (x: { name: string; logo?: string } | undefined, flip?: boolean) => (
    <View style={{ flexDirection: flip ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, width: 62, justifyContent: flip ? 'flex-start' : 'flex-end' }}>
      {x?.logo ? <Crest uri={x.logo} size={20} /> : <View style={{ width: 20 }} />}
      <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '600', color: t.fg }}>{x ? abbr(x.name) : '…'}</Text>
    </View>
  );
  return (
    <Pressable onPress={() => nav.navigate('Match', { id })} accessibilityRole="button" accessibilityLabel={a11y}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 12, borderTopWidth: first ? 0 : HAIR, borderColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
      {side(m?.h)}
      <Text numberOfLines={1} style={{ width: 44, textAlign: 'center', fontSize: 14, fontWeight: '700', color: midTone ?? t.fg, fontVariant: ['tabular-nums'] }}>{mid}</Text>
      {side(m?.a, true)}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
        <Text numberOfLines={1} style={{ fontSize: 12.5, color: t.muted, fontVariant: ['tabular-nums'] }}>Tahmin {pick}</Text>
        {!!mark && <Text style={{ fontSize: 10.5, fontWeight: '700', color: t.accent }}>{mark}</Text>}
      </View>
      {right}
    </Pressable>
  );
}


// Aktif tahmin: maç henüz başlamadı ya da canlı. Geri kalanı (bitmiş, ertelenmiş, sonucu bekleyen eski maçlar) geçmişte.
export function splitPicks(picks: MyPick[], results: Map<number, unknown>, open: Map<number, OpenMatch>, now = Date.now()) {
  const active: MyPick[] = [], past: MyPick[] = [];
  for (const p of picks) {
    const o = open.get(p.match_id);
    const isActive = !results.has(p.match_id) && (o ? o.st === 'live' || o.st === 'ns' : !!p.kickoff && new Date(p.kickoff).getTime() > now);
    (isActive ? active : past).push(p);
  }
  active.sort((a, b) => (open.get(a.match_id)?.ts ?? 0) - (open.get(b.match_id)?.ts ?? 0));
  return { active, past };
}

const DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
function when(o: OpenMatch | undefined, t: ReturnType<typeof useTheme>): { text: string; tone: string } {
  if (!o) return { text: '', tone: t.muted };
  if (o.st === 'live') return { text: o.short === 'HT' ? 'Devre arası' : o.min ? `${o.min}'` : 'Canlı', tone: t.live };
  const d = new Date(o.ts * 1000), today = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sameDay = d.toDateString() === today.toDateString();
  const tomorrow = d.toDateString() === new Date(today.getTime() + 86400000).toDateString();
  return { text: sameDay ? hm : tomorrow ? `Yarın ${hm}` : `${DAYS[d.getDay()]} ${hm}`, tone: t.muted };
}

// Profil: yalnızca başlamamış ve canlı maçların tahminleri.
// Başlamamış maçın satırı sola kaydırınca "Sil" (onay sorar); canlı maçta silinemez.
export function ActivePicks({ picks, open, onDeleted }: { picks: MyPick[]; open: Map<number, OpenMatch>; onDeleted?: () => void }) {
  const t = useTheme();
  const secret = useStore().me?.secret;
  const remove = (p: MyPick, title: string) => {
    if (!secret) return;
    const go = () => rpc('delete_pick', { p_secret: secret, p_match: p.match_id }).then(() => { track('pick_deleted'); onDeleted?.(); }, (e) => Alert.alert('Silinemedi', (e as Error).message));
    const msg = `${title} tahminin (${p.h}–${p.a}) silinsin mi?${p.joker ? ' Bu maçtaki jokerin de kalkar.' : ''}`;
    if (Platform.OS === 'web') { if (globalThis.confirm?.(msg)) go(); return; }
    Alert.alert('Tahmini sil', msg, [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Sil', style: 'destructive', onPress: go }]);
  };
  if (!picks.length) return <Empty>Aktif tahminin yok. Bir maça dokun, skor tahmini yap.</Empty>;
  return (
    <Card>
      {picks.map((p, i) => {
        const o = open.get(p.match_id);
        const w = when(o, t);
        const live = o?.st === 'live' && o.s;
        const title = o ? `${o.h.name} – ${o.a.name}` : 'Bu maç';
        const row = (
          <CompactRow key={p.match_id} first={i === 0} id={p.match_id} m={o} mid={live ? `${o.s![0]}–${o.s![1]}` : 'vs'} midTone={live ? w.tone : t.muted}
            pick={`${p.h}–${p.a}`} mark={p.joker ? '×2' : ''}
            a11y={`${o ? `${o.h.name} – ${o.a.name}` : 'Maç'}, tahmin ${p.h}–${p.a}, ${w.text}`}
            right={<Text numberOfLines={1} style={{ width: 64, textAlign: 'right', fontSize: 12.5, fontWeight: live ? '700' : '500', color: w.tone, fontVariant: ['tabular-nums'] }}>{w.text}</Text>} />
        );
        return live ? row : <SwipeRow key={p.match_id} label="Sil" onAction={() => remove(p, title)}>{row}</SwipeRow>;
      })}
    </Card>
  );
}
