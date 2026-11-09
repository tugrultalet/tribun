import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Share, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError, Fixture, TeamData, useApi } from '../api';
import { dayLabel } from '../dates';
import { RootParams, useNav } from '../nav';
import { GroupDetail, hasStarted, isValid, leaderboard, points, Prediction, rpc, useRpc } from '../social';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Button, Card, Crest, Empty, Icon, Loader, Panel, Tabs } from '../ui';
import { Screen } from './Screen';

// Grup sayfası: davet, sohbete giriş, sıradaki maça tahmin ve grup puan tablosu.
export default function Group({ route }: NativeStackScreenProps<RootParams, 'Group'>) {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const secret = store.me?.secret ?? '';
  const id = route.params.id;
  const [tab, setTab] = useState<'predict' | 'table'>('predict');
  const state = useRpc<GroupDetail>('group_detail', secret ? { p_secret: secret, p_group: id } : null, 15000);
  const group = state.data?.group;
  const fixtures = useApi<TeamData>(group ? `/api/team/${group.team.id}` : null, 60000);

  const invite = () => group && Share.share({ message: `Tribün'de "${group.name}" grubuna katıl. Davet kodu: ${group.code}` }).catch(() => {});
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
              <View style={{ flex: 1 }}><Button kind="sec" label="Davet et" onPress={invite} /></View>
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
                : <Table detail={d} fixtures={team.fixtures} />}
            </Loader>
            <Pressable onPress={leave} accessibilityRole="button" style={{ alignSelf: 'center', padding: 14, marginTop: 10 }}>
              <Text style={{ color: t.live, fontSize: 14, fontWeight: '600' }}>Gruptan çık</Text>
            </Pressable>
          </>
        )}
      </Loader>
    </Screen>
  );
}

function MatchHeader({ f, today }: { f: Fixture; today: string }) {
  const t = useTheme();
  const side = (team: Fixture['h']) => (
    <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <Crest uri={team.logo} size={40} />
      <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: t.fg }}>{team.name}</Text>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
      {side(f.h)}
      <View style={{ alignItems: 'center', minWidth: 90 }}>
        <Text style={{ fontSize: 26, fontWeight: '600', color: t.fg, fontVariant: ['tabular-nums'] }}>{f.s ? `${f.s[0]} – ${f.s[1]}` : f.time}</Text>
        <Text style={{ fontSize: 12, color: f.st === 'live' ? t.live : t.muted }}>{f.st === 'live' ? 'Canlı' : dayLabel(f.date, today)}</Text>
      </View>
      {side(f.a)}
    </View>
  );
}

function Stepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const t = useTheme();
  const button = (text: string, delta: number) => (
    <Pressable onPress={() => onChange(Math.max(0, Math.min(20, value + delta)))} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${label} ${delta > 0 ? 'artır' : 'azalt'}`}
      style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }}>
      <Text style={{ fontSize: 22, lineHeight: 24, color: t.fg }}>{text}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {button('−', -1)}
      <Text style={{ width: 34, textAlign: 'center', fontSize: 34, fontWeight: '700', color: t.fg, fontVariant: ['tabular-nums'] }}>{value}</Text>
      {button('+', 1)}
    </View>
  );
}

function Predict({ detail, fixtures, today, secret, onSaved }: { detail: GroupDetail; fixtures: Fixture[]; today: string; secret: string; onSaved: () => void }) {
  const t = useTheme();
  const next = fixtures.find((f) => f.st === 'live') || fixtures.find((f) => f.st === 'ns');
  const mine = (matchId: number) => detail.predictions.find((p) => p.match_id === matchId && p.profile_id === detail.me);
  const saved = next ? mine(next.id) : undefined;
  const [h, setH] = useState(saved?.h ?? 0);
  const [a, setA] = useState(saved?.a ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (saved) { setH(saved.h); setA(saved.a); } }, [saved?.h, saved?.a]);

  const save = async () => {
    if (!next) return;
    setBusy(true); setError('');
    try { await rpc('set_prediction', { p_secret: secret, p_group: detail.group.id, p_match: next.id, p_home: h, p_away: a }); onSaved(); }
    catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  };
  const open = next && !hasStarted(next);
  const dirty = !saved || saved.h !== h || saved.a !== a;
  // Bitmiş ve en az bir tahmin girilmiş son maçlar.
  const past = fixtures.filter((f) => f.st === 'ft' && detail.predictions.some((p) => p.match_id === f.id)).slice(-5).reverse();

  const row = (name: string, right: React.ReactNode, me: boolean) => (
    <View key={name} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 16, backgroundColor: me ? t.accentSoft : 'transparent' }}>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: me ? '700' : '400', color: t.fg }}>{name}</Text>
      {right}
    </View>
  );
  const predictionRows = (f: Fixture, reveal: boolean) => detail.members.map((m) => {
    const p: Prediction | undefined = detail.predictions.find((x) => x.match_id === f.id && x.profile_id === m.id);
    const me = m.id === detail.me;
    let right: React.ReactNode = <Text style={{ fontSize: 13, color: t.muted }}>{reveal ? 'Tahmin yok' : 'Bekleniyor'}</Text>;
    if (p && !isValid(p, f)) right = <Text style={{ fontSize: 13, color: t.muted }}>Geç girildi</Text>;
    else if (p && (reveal || me)) {
      const pts = points(p, f);
      right = (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 15, color: t.fg, fontVariant: ['tabular-nums'] }}>{p.h} – {p.a}</Text>
          {pts !== null && <Text style={{ width: 34, textAlign: 'right', fontSize: 15, fontWeight: '700', color: pts === 3 ? t.win : pts === 1 ? t.fg : t.muted }}>+{pts}</Text>}
        </View>
      );
    } else if (p) right = <Icon.check color={t.win} size={16} />;
    return row(m.name, right, me);
  });

  return (
    <>
      {next ? (
        <Panel title={open ? 'Sıradaki maça tahminin' : 'Maç başladı'} style={{ paddingBottom: 10 }}>
          <MatchHeader f={next} today={today} />
          {open && (
            <View style={{ alignItems: 'center', gap: 12, paddingTop: 16, paddingHorizontal: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Stepper value={h} onChange={setH} label={next.h.name} />
                <Text style={{ fontSize: 24, color: t.muted }}>–</Text>
                <Stepper value={a} onChange={setA} label={next.a.name} />
              </View>
              {error ? <Text style={{ color: t.live, fontSize: 13 }}>{error}</Text> : null}
              <View style={{ alignSelf: 'stretch' }}><Button label={busy ? 'Kaydediliyor…' : dirty ? 'Tahmini kaydet' : 'Kaydedildi'} disabled={busy || !dirty} onPress={save} /></View>
              <Text style={{ fontSize: 12, color: t.muted, textAlign: 'center' }}>Başlama düdüğüne kadar değiştirebilirsin. Diğerlerinin tahmini maç başlayınca görünür.</Text>
            </View>
          )}
          <View style={{ marginTop: 10 }}>{predictionRows(next, !open)}</View>
        </Panel>
      ) : <Empty>Bu takımın yaklaşan maçı yok.</Empty>}
      {past.map((f) => (
        <Panel key={f.id} style={{ paddingTop: 14, paddingBottom: 8 }}>
          <MatchHeader f={f} today={today} />
          <View style={{ marginTop: 8 }}>{predictionRows(f, true)}</View>
        </Panel>
      ))}
      <Text style={{ fontSize: 12, color: t.muted, textAlign: 'center', marginTop: 14 }}>Tam skor 3 puan · Doğru sonuç 1 puan</Text>
    </>
  );
}

function Table({ detail, fixtures }: { detail: GroupDetail; fixtures: Fixture[] }) {
  const t = useTheme();
  const rows = leaderboard(detail, fixtures);
  const head = { fontSize: 13, color: t.muted, textAlign: 'center' as const };
  const cell = { fontSize: 15, color: t.fg, textAlign: 'center' as const, fontVariant: ['tabular-nums' as const] };
  return (
    <Card style={{ marginTop: 16, paddingVertical: 6 }}>
      <View style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 12 }}>
        <Text style={[head, { width: 26 }]} />
        <Text style={[head, { flex: 1, textAlign: 'left', paddingLeft: 6 }]}>Üye</Text>
        <Text style={[head, { width: 56 }]}>Tahmin</Text>
        <Text style={[head, { width: 44 }]}>Tam</Text>
        <Text style={[head, { width: 36 }]}>P</Text>
      </View>
      {rows.map((r, i) => {
        const me = r.member.id === detail.me;
        return (
          <View key={r.member.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 12, backgroundColor: me ? t.accentSoft : 'transparent' }}>
            <Text style={[cell, { width: 26 }]}>{i + 1}</Text>
            <Text numberOfLines={1} style={{ flex: 1, paddingLeft: 6, fontSize: 15, fontWeight: me ? '700' : '400', color: t.fg }}>{r.member.name}</Text>
            <Text style={[cell, { width: 56 }]}>{r.played}</Text>
            <Text style={[cell, { width: 44 }]}>{r.exact}</Text>
            <Text style={[cell, { width: 36, fontWeight: '700' }]}>{r.total}</Text>
          </View>
        );
      })}
    </Card>
  );
}
