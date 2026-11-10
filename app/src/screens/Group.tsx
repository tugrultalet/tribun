import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, Share, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError, Fixture, TeamData, useApi } from '../api';
import { dayLabel } from '../dates';
import { RootParams, useNav } from '../nav';
import { entryCount, hasStarted, isValid, points, ranks, sameWeek, standings } from '../groups/standings';
import { GroupDetail, Prediction, rpc, useRpc } from '../social';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { shortName } from '../names';
import { Button, Card, Crest, Empty, Icon, Loader, Panel, Seg, Tabs } from '../ui';
import { InviteSheet } from './InviteSheet';
import { Screen } from './Screen';

// Grup sayfası: davet, sohbete giriş, haftanın maçlarına tahmin ve grup puan tablosu (hafta / sezon).
export default function Group({ route }: NativeStackScreenProps<RootParams, 'Group'>) {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const secret = store.me?.secret ?? '';
  const id = route.params.id;
  const [tab, setTab] = useState<'predict' | 'table'>('predict');
  const [inviting, setInviting] = useState(false);
  const state = useRpc<GroupDetail>('group_detail', secret ? { p_secret: secret, p_group: id } : null, 15000);
  const group = state.data?.group;
  const fixtures = useApi<TeamData>(group ? `/api/team/${group.team.id}` : null, 60000);

  const leave = () => {
    const go = () => rpc('leave_group', { p_secret: secret, p_group: id }).then(() => nav.goBack(), () => {});
    if (Platform.OS === 'web') return void go();
    Alert.alert('Gruptan çık', 'Tahminlerin bu gruptan silinir.', [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Çık', style: 'destructive', onPress: go }]);
  };

  return (
    <Screen team={group?.team.name} onRefresh={state.reload} refreshing={state.loading && state.data !== undefined}>
      <Loader state={state}>
        {(d) => (
          <>
            <View style={{ alignItems: 'center', gap: 6, paddingTop: 4, paddingBottom: 14 }}>
              <Crest uri={d.group.team.logo} size={56} />
              <Text style={{ fontSize: 24, fontWeight: '700', letterSpacing: -0.3, color: t.fg, textAlign: 'center' }}>{d.group.name}</Text>
              <Text style={{ fontSize: 13, color: t.muted }}>{d.members.length} üye · Davet kodu {d.group.code}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button label="Sohbet" onPress={() => nav.navigate('Chat', { id, name: d.group.name })} /></View>
              <View style={{ flex: 1 }}><Button kind="sec" label="Davet et" onPress={() => setInviting(true)} /></View>
            </View>
            {d.group.last_message && (
              <Pressable onPress={() => nav.navigate('Chat', { id, name: d.group.name })} accessibilityRole="button">
                <Text numberOfLines={1} style={{ textAlign: 'center', fontSize: 13, color: t.muted, marginTop: 10 }}>{d.group.last_message.name}: {d.group.last_message.body}</Text>
              </Pressable>
            )}
            <View style={{ marginTop: 8 }}>
              <Tabs value={tab} onChange={setTab} options={[['predict', 'Tahmin'], ['table', 'Puan']]} />
            </View>
            <Loader state={fixtures}>
              {(team) => tab === 'predict'
                ? <Predict detail={d} fixtures={team.fixtures} today={store.meta.today} secret={secret} onSaved={state.reload} />
                : <Table detail={d} fixtures={team.fixtures} today={store.meta.today} />}
            </Loader>
            {inviting && <InviteSheet group={d.group} onClose={() => setInviting(false)} />}
            <Pressable onPress={leave} accessibilityRole="button" style={{ alignSelf: 'center', padding: 14, marginTop: 10 }}>
              <Text style={{ color: t.live, fontSize: 14, fontWeight: '600' }}>Gruptan çık</Text>
            </Pressable>
          </>
        )}
      </Loader>
    </Screen>
  );
}

function Stepper({ value, onChange, label, dim }: { value: number; onChange: (n: number) => void; label: string; dim?: boolean }) {
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

// Haftanın tek maçı: başlamadıysa +/− ile tek dokunuşta girilen, otomatik kaydedilen tahmin; başladıysa herkesin tahmini ve puanlar.
function WeekMatch({ f, detail, today, secret, onSaved }: { f: Fixture; detail: GroupDetail; today: string; secret: string; onSaved: () => void }) {
  const t = useTheme();
  const saved = detail.predictions.find((p) => p.match_id === f.id && p.profile_id === detail.me);
  const [h, setH] = useState(saved?.h ?? 0);
  const [a, setA] = useState(saved?.a ?? 0);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const touched = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { if (!touched.current && saved) { setH(saved.h); setA(saved.a); } }, [saved?.h, saved?.a]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const started = hasStarted(f);
  const change = (nh: number, na: number) => {
    touched.current = true; setH(nh); setA(na); setState('saving'); setError('');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await rpc('set_prediction', { p_secret: secret, p_group: detail.group.id, p_match: f.id, p_home: nh, p_away: na, p_kickoff: new Date(f.ts * 1000).toISOString() });
        setState('saved'); onSaved();
      } catch (e) { setState('error'); setError((e as ApiError).message); }
    }, 600);
  };
  const entered = entryCount(detail, f.id), total = detail.members.length;
  const live = f.st === 'live';
  const status = state === 'saving' ? 'Kaydediliyor…' : state === 'error' ? error : saved || state === 'saved' ? 'Kaydedildi' : 'Tahmin gir';
  const others = detail.members.map((m) => ({ m, p: detail.predictions.find((x) => x.match_id === f.id && x.profile_id === m.id) as Prediction | undefined }));

  return (
    <View style={{ paddingVertical: 10, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: t.line }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontSize: 12, color: live ? t.live : t.muted, fontWeight: '600' }}>{live ? `● Canlı ${f.s ? `${f.s[0]}–${f.s[1]}` : ''}` : f.st === 'ft' && f.s ? `MS ${f.s[0]}–${f.s[1]}` : `${dayLabel(f.date, today)} · ${f.time}`}</Text>
        <Text style={{ fontSize: 12, color: t.muted }}>{entered}/{total} kişi girdi</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Crest uri={f.h.logo} size={24} /><Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, fontWeight: '600', color: t.fg }}>{shortName(f.h.name)}</Text>
        </View>
        <Text style={{ fontSize: 17, fontWeight: '700', color: live ? t.live : t.fg, fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'center' }}>{started && f.s ? `${f.s[0]}–${f.s[1]}` : '–'}</Text>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, fontWeight: '600', color: t.fg, textAlign: 'right' }}>{shortName(f.a.name)}</Text><Crest uri={f.a.logo} size={24} />
        </View>
      </View>
      {!started && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 }}>
          <Stepper value={h} onChange={(n) => change(n, a)} label={f.h.name} dim={!saved && !touched.current} />
          <Text style={{ color: t.muted }}>–</Text>
          <Stepper value={a} onChange={(n) => change(h, n)} label={f.a.name} dim={!saved && !touched.current} />
        </View>
      )}
      {!started && <Text style={{ fontSize: 11.5, color: state === 'error' ? t.live : t.muted, textAlign: 'center', marginTop: 6 }}>{status}</Text>}
      {started && (
        <View style={{ marginTop: 8, gap: 2 }}>
          {others.map(({ m, p }) => {
            const me = m.id === detail.me;
            const pts = p ? points(p, f, true) : null;
            const late = p && !isValid(p, f);
            return (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }}>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: me ? '700' : '400', color: t.fg }}>{m.name}</Text>
                <Text style={{ fontSize: 13, color: p ? t.fg : t.muted, fontVariant: ['tabular-nums'] }}>{late ? 'Geç girildi' : p ? `${p.h} – ${p.a}` : 'Tahmin yok'}</Text>
                <Text style={{ width: 40, textAlign: 'right', fontSize: 13, fontWeight: '700', color: pts === 3 ? t.win : pts === 1 ? t.fg : t.muted }}>{pts === null ? '' : `${live ? '~' : ''}+${pts}`}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function Predict({ detail, fixtures, today, secret, onSaved }: { detail: GroupDetail; fixtures: Fixture[]; today: string; secret: string; onSaved: () => void }) {
  const t = useTheme();
  // Bu haftanın (Pzt–Paz) maçları; hafta boşsa sıradaki maç gösterilir.
  const list = useMemo(() => {
    const week = fixtures.filter((f) => f.st !== 'off' && sameWeek(f.date, today));
    if (week.length) return week;
    const next = fixtures.find((f) => f.st === 'ns');
    return next ? [next] : [];
  }, [fixtures, today]);
  return (
    <>
      {list.length ? (
        <Panel title="Bu haftanın maçları" style={{ paddingBottom: 4 }}>
          {list.map((f) => <WeekMatch key={f.id} f={f} detail={detail} today={today} secret={secret} onSaved={onSaved} />)}
        </Panel>
      ) : <Empty>Bu takımın yaklaşan maçı yok.</Empty>}
      <Text style={{ fontSize: 12, color: t.muted, textAlign: 'center', marginTop: 14 }}>Tam skor 3 puan · Doğru sonuç 1 puan{'\n'}Başlama düdüğüne kadar değiştirebilirsin; başkalarının tahmini maç başlayınca açılır.</Text>
    </>
  );
}

function Table({ detail, fixtures, today }: { detail: GroupDetail; fixtures: Fixture[]; today: string }) {
  const t = useTheme();
  const [scope, setScope] = useState<'week' | 'season'>('week');
  const rows = useMemo(() => standings(detail, fixtures, scope === 'week' ? (f) => sameWeek(f.date, today) : undefined), [detail, fixtures, scope, today]);
  const place = ranks(rows);
  const anyLive = rows.some((r) => r.live > 0) || fixtures.some((f) => f.st === 'live');
  const head = { fontSize: 13, color: t.muted, textAlign: 'center' as const };
  const cell = { fontSize: 15, color: t.fg, textAlign: 'center' as const, fontVariant: ['tabular-nums' as const] };
  return (
    <>
      <View style={{ marginTop: 12 }}><Seg value={scope} onChange={setScope} options={[['week', 'Hafta'], ['season', 'Sezon']]} /></View>
      <Card style={{ marginTop: 12, paddingVertical: 6 }}>
        <View style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 12 }}>
          <Text style={[head, { width: 26 }]} />
          <Text style={[head, { flex: 1, textAlign: 'left', paddingLeft: 6 }]}>Üye</Text>
          <Text style={[head, { width: 56 }]}>Tahmin</Text>
          <Text style={[head, { width: 44 }]}>Tam</Text>
          <Text style={[head, { width: 48 }]}>P</Text>
        </View>
        {rows.map((r, i) => {
          const me = r.member.id === detail.me;
          return (
            <View key={r.member.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 12, backgroundColor: me ? t.accentSoft : 'transparent' }}>
              <Text style={[cell, { width: 26 }]}>{place[i]}</Text>
              <Text numberOfLines={1} style={{ flex: 1, paddingLeft: 6, fontSize: 15, fontWeight: me ? '700' : '400', color: t.fg }}>{r.member.name}</Text>
              <Text style={[cell, { width: 56 }]}>{r.played}</Text>
              <Text style={[cell, { width: 44 }]}>{r.exact}</Text>
              <Text style={[cell, { width: 48, fontWeight: '700', color: r.live > 0 ? t.live : t.fg }]}>{r.total}</Text>
            </View>
          );
        })}
      </Card>
      {anyLive && <Text style={{ fontSize: 12, color: t.muted, textAlign: 'center', marginTop: 10 }}>Kırmızı puanlar, canlı maç şu skorla biterse geçerli olacak puanları içerir.</Text>}
    </>
  );
}
