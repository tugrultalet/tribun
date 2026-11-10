import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { ApiError, Fixture } from '../api';
import { hasStarted, points } from '../groups/standings';
import { rpc, useRpc } from '../social';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Button, Panel } from '../ui';
import { Field } from '../ui';
import { MatchPicks, setPick, useMyPicks } from './hooks';
import { Stepper } from './Stepper';
import { notePickSaved } from '../review';
import { track } from '../telemetry';

// Maç sayfasındaki tahmin kartı: her maça tahmin girilebilir (takip edilen takım şartı yok). Başlamadan önce +/− ile girilir ve
// otomatik kaydedilir; maç başlayınca kilitlenir, arkadaşların tahminleri açılır ve puan gösterilir.
export function PickCard({ f }: { f: Fixture }) {
  const t = useTheme();
  const store = useStore();
  const secret = store.me?.secret;
  if (f.st === 'off') return null;
  if (!secret) return <NameStep />;
  return <Card f={f} secret={secret} />;
}

// Tahmin için takma ad gerekir (ilk kez): tek alan, atlanamaz ama tek dokunuş.
function NameStep() {
  const t = useTheme();
  const { setName } = useStore();
  const [name, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true); setError('');
    try { await setName(name.trim()); } catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  };
  return (
    <Panel title="Tahmin et" style={{ marginBottom: 12 }}>
      <View style={{ padding: 16, gap: 10 }}>
        <Text style={{ color: t.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>Maça skor tahmini yap, puan topla. Başlamak için bir takma ad seç.</Text>
        <Field value={name} onChange={setValue} placeholder="Takma adın" maxLength={30} />
        {error ? <Text style={{ color: t.live, fontSize: 13 }}>{error}</Text> : null}
        <Button label={busy ? 'Kaydediliyor…' : 'Devam'} disabled={busy || !name.trim()} onPress={submit} />
      </View>
    </Panel>
  );
}

function Card({ f, secret }: { f: Fixture; secret: string }) {
  const t = useTheme();
  const picks = useMyPicks(30000);
  const friends = useRpc<MatchPicks>('match_picks', { p_secret: secret, p_match: f.id }, 30000);
  const saved = picks.data?.find((p) => p.match_id === f.id);
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
      try { await setPick(secret, f.id, nh, na, f.ts); setState('saved'); picks.reload(); friends.reload(); track('pick_saved', { source: 'match' }); notePickSaved(); }
      catch (e) { setState('error'); setError((e as { message?: string }).message ?? 'Kaydedilemedi.'); }
    }, 600);
  };
  const pred = saved ? { profile_id: '', match_id: f.id, h: saved.h, a: saved.a, updated_at: saved.updated_at } : null;
  const pts = pred ? points(pred, f, true) : null;
  const live = f.st === 'live';

  if (!started) {
    const pending = friends.data?.pending ?? 0;
    return (
      <Panel title="Tahminin" style={{ marginBottom: 12, paddingBottom: 12 }}>
        <View style={{ alignItems: 'center', gap: 10, paddingTop: 12, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Stepper value={h} onChange={(n) => change(n, a)} label={f.h.name} dim={!saved && !touched.current} />
            <Text style={{ fontSize: 22, color: t.muted }}>–</Text>
            <Stepper value={a} onChange={(n) => change(h, n)} label={f.a.name} dim={!saved && !touched.current} />
          </View>
          <Text style={{ fontSize: 12.5, color: state === 'error' ? t.live : t.muted, textAlign: 'center' }}>
            {state === 'saving' ? 'Kaydediliyor…' : state === 'error' ? error : saved || state === 'saved' ? 'Kaydedildi · başlama düdüğüne kadar değiştirebilirsin' : 'Tam skor 3 puan, doğru sonuç 1 puan'}
          </Text>
          {pending > 0 && <Text style={{ fontSize: 12.5, color: t.muted }}>{pending} arkadaşın tahmin girdi; maç başlayınca görürsün.</Text>}
        </View>
      </Panel>
    );
  }
  const revealed = friends.data?.revealed ?? [];
  return (
    <Panel title="Tahminin" style={{ marginBottom: 12, paddingBottom: 8 }}>
      <View style={{ paddingTop: 10 }}>
        <Line name="Sen" bold pick={saved ? `${saved.h} – ${saved.a}` : 'Tahmin yok'} pts={pts} live={live} muted={!saved} />
        {revealed.map((r) => {
          const p = points({ profile_id: r.profile_id, match_id: f.id, h: r.h, a: r.a, updated_at: r.updated_at }, f, true);
          return <Line key={r.profile_id} name={r.name} pick={`${r.h} – ${r.a}`} pts={p} live={live} />;
        })}
        {!saved && <Text style={{ fontSize: 12, color: t.muted, textAlign: 'center', padding: 8 }}>Maç başladığı için tahmin kapandı.</Text>}
      </View>
    </Panel>
  );
}

function Line({ name, pick, pts, live, bold, muted }: { name: string; pick: string; pts: number | null; live: boolean; bold?: boolean; muted?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 16 }}>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: bold ? '700' : '400', color: t.fg }}>{name}</Text>
      <Text style={{ fontSize: 15, color: muted ? t.muted : t.fg, fontVariant: ['tabular-nums'] }}>{pick}</Text>
      <Text style={{ width: 46, textAlign: 'right', fontSize: 15, fontWeight: '700', color: pts === 3 ? t.win : pts === 1 ? t.fg : t.muted }}>{pts === null ? '' : `${live ? '~' : ''}+${pts}`}</Text>
    </View>
  );
}
