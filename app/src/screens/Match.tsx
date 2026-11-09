import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Fixture, Lineup, Lineups as LineupData, Match as MatchData, MatchEvent, Standings, Team, useApi } from '../api';
import { dayLabel } from '../dates';
import { RootParams, useNav } from '../nav';
import { useStore } from '../store';
import { font, useTheme } from '../theme';
import { BackBar, Crest, Empty, Icon, LiveDot, Loader, Note, Section, Seg, StandingsTable, statusText, Tabs } from '../ui';
import { Screen } from './Screen';

type Tab = 'sum' | 'line' | 'stat' | 'table';

export default function Match({ route }: NativeStackScreenProps<RootParams, 'Match'>) {
  const nav = useNav();
  const store = useStore();
  const [tab, setTab] = useState<Tab>('sum');
  const state = useApi<MatchData>(`/api/match/${route.params.id}`, 30000);
  const f = state.data?.fixture;
  const league = f ? store.league(f.lg) : undefined;
  return (
    <Screen
      onRefresh={state.reload}
      refreshing={state.loading && state.data !== undefined}
      header={<BackBar onBack={nav.goBack} title={f ? `${league?.name ?? ''} · ${f.round}` : ''} />}>
      <Loader state={state}>
        {(m) => (
          <>
            <Head m={m} />
            {m.stale && <Note>Veri yenilenemedi; son alınan bilgiler gösteriliyor.</Note>}
            <Tabs value={tab} onChange={setTab} options={[['sum', 'Özet'], ['line', 'Kadrolar'], ['stat', 'İstatistik'], ['table', 'Puan durumu']]} />
            {tab === 'sum' && <Summary m={m} />}
            {tab === 'line' && <Lineups m={m} />}
            {tab === 'stat' && <Stats m={m} />}
            {tab === 'table' && <Table f={m.fixture} />}
          </>
        )}
      </Loader>
    </Screen>
  );
}

const minute = (e: MatchEvent) => `${e.min}${e.extra ? `+${e.extra}` : ''}'`;

function Head({ m }: { m: MatchData }) {
  const t = useTheme();
  const nav = useNav();
  const { meta } = useStore();
  const f = m.fixture;
  const live = f.st === 'live';
  const chip = live ? statusText(f) : f.st === 'ft' ? (f.short === 'PEN' ? 'Penaltılarla bitti' : f.short === 'AET' ? 'Uzatmalarda bitti' : 'Maç sonu') : f.st === 'off' ? (f.short === 'PST' ? 'Ertelendi' : 'İptal') : `${dayLabel(f.date, meta.today)} · ${f.time}`;
  const side = (team: Team) => (
    <Pressable onPress={() => nav.navigate('Team', { team })} accessibilityRole="button" accessibilityLabel={team.name} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
      <Crest uri={team.logo} size={58} />
      <Text numberOfLines={2} style={{ fontWeight: '700', fontSize: 14, textAlign: 'center', color: t.fg }}>{team.name}</Text>
    </Pressable>
  );
  const scorers = (s: 'h' | 'a') => m.events.filter((e) => e.k === 'goal' && e.side === s).map((e) => `${e.p} ${minute(e)}`).join('\n');
  return (
    <View style={{ alignItems: 'center', gap: 6, paddingTop: 4, paddingBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 99, backgroundColor: live ? t.liveSoft : t.surface2 }}>
        {live && <LiveDot />}
        <Text style={{ fontSize: 12, fontWeight: '700', color: live ? t.live : t.fg }}>{chip}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignSelf: 'stretch', alignItems: 'flex-start', gap: 6, marginTop: 6 }}>
        {side(f.h)}
        <Text style={{ fontFamily: font.score, fontSize: f.s ? 64 : 34, lineHeight: f.s ? 66 : 62, color: t.fg }}>{f.s ? `${f.s[0]} – ${f.s[1]}` : f.time}</Text>
        {side(f.a)}
      </View>
      {f.pen && <Text style={{ fontSize: 12, color: t.muted }}>Penaltılar: {f.pen[0]} – {f.pen[1]}</Text>}
      {m.events.some((e) => e.k === 'goal') && (
        <View style={{ flexDirection: 'row', alignSelf: 'stretch', gap: 16, marginTop: 4 }}>
          <Text style={{ flex: 1, textAlign: 'right', fontSize: 12, lineHeight: 17, color: t.muted }}>{scorers('h')}</Text>
          <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: t.muted }}>{scorers('a')}</Text>
        </View>
      )}
    </View>
  );
}

function Summary({ m }: { m: MatchData }) {
  const t = useTheme();
  const { meta } = useStore();
  const f = m.fixture;
  if (!m.events.length) {
    return <Empty>{f.st === 'ns' ? `Maç ${dayLabel(f.date, meta.today).toLocaleLowerCase('tr')} ${f.time}'de başlıyor.` : f.st === 'off' ? 'Bu maç oynanmadı.' : 'Henüz gol, kart ya da oyuncu değişikliği yok.'}</Empty>;
  }
  const icon = (e: MatchEvent) => e.k === 'goal' ? <Icon.ball color={t.fg} /> : e.k === 'y' ? <Icon.card color="#F5C518" /> : e.k === 'r' ? <Icon.card color="#E0262B" /> : e.k === 'sub' ? <Icon.sub /> : <Icon.ball color={t.muted} />;
  const body = (e: MatchEvent, align: 'left' | 'right') => (
    <View style={{ flexShrink: 1 }}>
      <Text style={{ fontWeight: '700', fontSize: 13.5, color: t.fg, textAlign: align }}>{e.p || (e.k === 'var' ? 'VAR' : '')}</Text>
      {e.x && <Text style={{ fontSize: 12, color: t.muted, textAlign: align }}>{e.x}</Text>}
    </View>
  );
  return (
    <View style={{ marginTop: 14 }}>
      {[...m.events].reverse().map((e, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 50 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 9 }}>{e.side === 'h' && <>{body(e, 'right')}{icon(e)}</>}</View>
          <Text style={{ width: 52, textAlign: 'center', fontFamily: font.scoreMid, fontSize: 17, color: t.muted }}>{minute(e)}</Text>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 }}>{e.side === 'a' && <>{icon(e)}{body(e, 'left')}</>}</View>
        </View>
      ))}
      <View style={{ alignSelf: 'center', backgroundColor: t.surface2, borderRadius: 99, paddingVertical: 5, paddingHorizontal: 12, marginTop: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: t.muted }}>Başlama · {f.time}</Text>
      </View>
      {(m.venue || m.referee) && <Text style={{ textAlign: 'center', fontSize: 12, color: t.muted, marginTop: 14 }}>{[m.venue, m.referee && `Hakem: ${m.referee}`].filter(Boolean).join(' · ')}</Text>}
    </View>
  );
}

const lightText = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) < 150;
};

function Lineups({ m }: { m: MatchData }) {
  const t = useTheme();
  const f = m.fixture;
  const [side, setSide] = useState<'h' | 'a'>('h');
  const state = useApi<LineupData>(`/api/match/${f.id}/lineups`, f.st === 'ft' ? undefined : 120000);
  if (!state.data) return <Loader state={state}>{() => null}</Loader>;
  const lineups = state.data.lineups;
  if (!lineups.length) return <Empty>İlk 11'ler genellikle maçtan yaklaşık bir saat önce açıklanır.</Empty>;
  const lu: Lineup | undefined = lineups.find((l) => l.teamId === f[side].id);
  if (!lu) return <Empty>Bu takımın kadrosu henüz açıklanmadı.</Empty>;
  const color = lu.color || t.accent;
  const ink = lu.numColor || (lightText(color) ? '#FFFFFF' : '#111111');
  const rows = [...new Set(lu.xi.map((p) => p.row ?? 0))].sort((a, b) => b - a).map((r) => lu.xi.filter((p) => (p.row ?? 0) === r).sort((a, b) => (b.col ?? 0) - (a.col ?? 0)));
  return (
    <View>
      <Seg style={{ marginTop: 14 }} value={side} onChange={setSide} options={[['h', f.h.name], ['a', f.a.name]]} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
        <Text style={{ fontSize: 13, color: t.muted }}>Diziliş <Text style={{ color: t.fg, fontWeight: '700' }}>{lu.formation || '–'}</Text></Text>
        {lu.coach && <Text style={{ fontSize: 13, color: t.muted }}>TD <Text style={{ color: t.fg, fontWeight: '700' }}>{lu.coach}</Text></Text>}
      </View>
      <View style={{ backgroundColor: t.pitch, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 6, marginTop: 12, minHeight: 400, justifyContent: 'space-between', gap: 14 }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: 10, left: 10, right: 10, bottom: 10, borderWidth: 1.5, borderColor: t.pitchLine, borderRadius: 6 }} />
        {rows.map((row, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            {row.map((p, j) => (
              <View key={j} style={{ width: 70, alignItems: 'center', gap: 4 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: color, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)' }}>
                  <Text style={{ fontFamily: font.score, fontSize: 16, lineHeight: 18, color: ink }}>{p.no ?? ''}</Text>
                </View>
                <Text numberOfLines={2} style={{ fontSize: 11.5, fontWeight: '600', color: '#fff', textAlign: 'center' }}>{p.name}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      {lu.subs.length > 0 && (
        <Section title="Yedekler">
          <View>
            {lu.subs.map((p, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: t.line }}>
                <Text style={{ width: 26, textAlign: 'center', fontFamily: font.scoreMid, fontSize: 17, color: t.muted }}>{p.no ?? ''}</Text>
                <Text style={{ flex: 1, fontSize: 14, color: t.fg }}>{p.name}</Text>
                <Text style={{ fontSize: 12, color: t.muted }}>{POS[p.pos ?? ''] ?? ''}</Text>
              </View>
            ))}
          </View>
        </Section>
      )}
    </View>
  );
}
const POS: Record<string, string> = { G: 'Kaleci', D: 'Defans', M: 'Orta saha', F: 'Forvet' };

function Stats({ m }: { m: MatchData }) {
  const t = useTheme();
  if (!m.stats.length) return <Empty>İstatistikler maç başladıktan sonra dolar.</Empty>;
  const bar = (value: number, total: number, alignEnd: boolean, color: string) => (
    <View style={{ flex: 1, height: 6, borderRadius: 4, backgroundColor: t.surface2, flexDirection: 'row', justifyContent: alignEnd ? 'flex-end' : 'flex-start' }}>
      <View style={{ width: `${(value / total) * 100}%`, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
  return (
    <View style={{ marginTop: 8 }}>
      {m.stats.map((s) => {
        const total = s.h + s.a || 1;
        return (
          <View key={s.label} style={{ gap: 6, paddingVertical: 12, borderBottomWidth: 1, borderColor: t.line }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: t.fg, width: 56 }}>{s.h}{s.unit}</Text>
              <Text style={{ fontSize: 13, color: t.muted }}>{s.label}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: t.fg, width: 56, textAlign: 'right' }}>{s.a}{s.unit}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>{bar(s.h, total, true, t.accent)}{bar(s.a, total, false, t.muted)}</View>
          </View>
        );
      })}
    </View>
  );
}

function Table({ f }: { f: Fixture }) {
  const nav = useNav();
  const state = useApi<Standings>(`/api/standings/${f.lg}`);
  return <Loader state={state}>{(d) => <StandingsTable data={d} highlight={[f.h.id, f.a.id]} onTeam={(r) => nav.navigate('Team', { team: r.team })} />}</Loader>;
}
