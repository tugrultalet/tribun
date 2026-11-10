import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ApiError, Fixture } from '../api';
import { hasStarted, points } from '../groups/standings';
import { rpc, useRpc, type Group } from '../social';
import { inScope } from '../groups/scopeRules';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Button, Panel } from '../ui';
import { Field } from '../ui';
import { Community, Dist, MatchPicks, setJoker, setPick, useMyPicks } from './hooks';
import { Stepper } from './Stepper';
import { useOdds } from './Preview';
import { possessive } from './turkish';
import { AskFriends } from './AskFriends';
import { notePickSaved } from '../review';
import { track } from '../telemetry';
import { useNav } from '../nav';

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
  const community = useRpc<Community>('match_community', { p_secret: secret, p_match: f.id }, 60000);
  const saved = picks.data?.find((p) => p.match_id === f.id);
  const [h, setH] = useState(saved?.h ?? 0);
  const [a, setA] = useState(saved?.a ?? 0);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const touched = useRef(false);
  // Kayıtlı tahmin kilitli görünür; "Düzenle" ile açılır, "Onayla" ile kaydedilip yeniden kilitlenir.
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!touched.current && saved) { setH(saved.h); setA(saved.a); } }, [saved?.h, saved?.a]);

  const started = hasStarted(f);
  // Skor değişince yalnızca ekranda değişir; "Tahmini kaydet" ile onaylanınca kaydedilir.
  const change = (nh: number, na: number) => {
    touched.current = true; setH(nh); setA(na); setError('');
    if (state !== 'saving') setState('idle');
  };
  // "Arkadaşlarına sor" bağlantısıyla gelindiyse ve bu maça tahmin kaydedildiyse: gönderenle arkadaş olunur.
  const store = useStore();
  // Tahmin kaydedilince, bu maçı kapsayan arkadaş gruplarına kendiliğinden bildirim (maç başına bir kez; skor yazmaz).
  const groupsRaw = useRpc<Group[]>('my_groups', { p_secret: secret }, 120000).data;
  const notifyGroups = () => {
    const ids = (Array.isArray(groupsRaw) ? groupsRaw : []).filter((g) => g.kind !== 'open' && inScope(g, f)).map((g) => g.id);
    if (!ids.length) return;
    rpc<{ notified?: number }>('notify_groups', { p_secret: secret, p_match: f.id, p_groups: ids, p_home: f.h.name, p_away: f.a.name })
      .then((r) => { if (r?.notified) track('groups_notified', { n: r.notified }); }).catch(() => {});
  };
  const [friendMsg, setFriendMsg] = useState('');
  const connectAsk = () => {
    const ask = store.ask;
    if (!ask || ask.match !== f.id) return;
    rpc<{ connected?: boolean; new?: boolean; name?: string }>('ask_connect', { p_secret: secret, p_token: ask.token })
      .then((r) => { if (r?.connected) { store.setAsk(undefined); if (r.new && r.name) { setFriendMsg(`${r.name} ile artık arkadaşsınız; birbirinizin tahminlerini göreceksiniz.`); track('friend_connected'); } } })
      .catch(() => {});
  };
  const confirm = async () => {
    setState('saving'); setError('');
    try { await setPick(secret, f.id, h, a, f.ts); setState('saved'); setEditing(false); connectAsk(); notifyGroups(); picks.reload(); friends.reload(); community.reload(); track('pick_saved', { source: 'match' }); notePickSaved(); }
    catch (e) { setState('error'); setError((e as { message?: string }).message ?? 'Kaydedilemedi.'); }
  };
  const pred = saved ? { profile_id: '', match_id: f.id, h: saved.h, a: saved.a, updated_at: saved.updated_at } : null;
  const pts = pred ? points(pred, f, true) : null;
  const live = f.st === 'live';

  if (!started) {
    const pending = friends.data?.pending ?? 0;
    const locked = (saved || state === 'saved') && !editing;
    if (locked) {
      // Kayıtlı tahmin: tek satır (skor, onay, Düzenle) ve altında belirgin "Arkadaşlarına sor".
      return (
        <Panel title="Skor Tahminin" style={{ marginBottom: 12, paddingBottom: 14 }}>
          <View style={{ gap: 12, paddingTop: 10, paddingHorizontal: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text accessibilityLabel={`Tahminin ${h}–${a}`} style={{ fontSize: 34, fontWeight: '700', color: t.fg, fontVariant: ['tabular-nums'] }}>{h} – {a}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 13, color: t.win, fontWeight: '700' }}>✓ Kaydedildi</Text>
                {saved?.joker ? <Text style={{ fontSize: 12.5, color: t.accent, fontWeight: '600' }}>🃏 Joker · ×2</Text>
                  : pending > 0 ? <Text style={{ fontSize: 12.5, color: t.muted }}>{pending} arkadaşın da tahmin girdi</Text> : null}
              </View>
              <Pressable onPress={() => { setEditing(true); setState('idle'); }} accessibilityRole="button" hitSlop={8}
                style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 99, backgroundColor: t.surface2 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: t.fg }}>Düzenle</Text>
              </Pressable>
            </View>
            {!!friendMsg && <Text style={{ fontSize: 13, color: t.win, fontWeight: '600', textAlign: 'center' }}>🤝 {friendMsg}</Text>}
            {saved && <AskFriends f={f} secret={secret} pick={{ h: saved.h, a: saved.a }} />}
            {saved && <LinkHint />}
            <CommunityLine f={f} data={community.data} />
          </View>
        </Panel>
      );
    }
    // Düzenleme: skor, joker, favori ipucu; Vazgeç / Onayla.
    return (
      <Panel title="Skor Tahminin" style={{ marginBottom: 12, paddingBottom: 14 }}>
        <View style={{ alignItems: 'center', gap: 12, paddingTop: 12, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Stepper value={h} onChange={(n) => change(n, a)} label={f.h.name} dim={!saved && !touched.current} />
            <Text style={{ fontSize: 22, color: t.muted }}>–</Text>
            <Stepper value={a} onChange={(n) => change(h, n)} label={f.a.name} dim={!saved && !touched.current} />
          </View>
          <FavoriteHint f={f} h={h} a={a} picked={!!saved || touched.current} crowd={community.data} />
          {saved && <Joker secret={secret} matchId={f.id} on={!!saved.joker} onChange={picks.reload} />}
          <View style={{ alignSelf: 'stretch', flexDirection: 'row', gap: 10 }}>
            {saved && (
              <View style={{ flex: 1 }}>
                <Button kind="sec" label="Vazgeç" onPress={() => { setH(saved.h); setA(saved.a); setEditing(false); setState('idle'); setError(''); }} />
              </View>
            )}
            <View style={{ flex: 2 }}>
              <Button label={state === 'saving' ? 'Kaydediliyor…' : `Onayla · ${h}–${a}`} onPress={confirm} disabled={state === 'saving'} />
            </View>
          </View>
          {state === 'error' ? <Text style={{ fontSize: 12.5, color: t.live, textAlign: 'center' }}>{error}</Text>
            : !saved ? <Text style={{ fontSize: 12.5, color: t.muted, textAlign: 'center' }}>Tam skor 3 puan, doğru sonuç 1 puan</Text> : null}
        </View>
      </Panel>
    );
  }
  const revealed = friends.data?.revealed ?? [];
  return (
    <Panel title="Skor Tahminin" style={{ marginBottom: 12, paddingBottom: 8 }}>
      <View style={{ paddingTop: 10 }}>
        <Line name="Sen" bold pick={saved ? `${saved.h} – ${saved.a}` : 'Tahmin yok'} pts={pts} live={live} muted={!saved} />
        {revealed.map((r) => {
          const p = points({ profile_id: r.profile_id, match_id: f.id, h: r.h, a: r.a, updated_at: r.updated_at }, f, true);
          return <Line key={r.profile_id} name={r.name} pick={`${r.h} – ${r.a}`} pts={p} live={live} />;
        })}
        {!saved && <Text style={{ fontSize: 12, color: t.muted, textAlign: 'center', padding: 8 }}>Maç başladığı için tahmin kapandı.</Text>}
        {saved?.joker && <Text style={{ fontSize: 12.5, color: t.accent, textAlign: 'center', paddingTop: 4 }}>Joker bu maçta: puanın ×2</Text>}
        <View style={{ paddingHorizontal: 16, paddingTop: 6 }}><CommunityLine f={f} data={community.data} /></View>
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

// Joker: haftada bir maç, puan ×2 (sürpriz bonusu dahil). Aynı haftada başka maçtaysa oraya değil buraya taşınır.
function Joker({ secret, matchId, on, onChange }: { secret: string; matchId: number; on: boolean; onChange: () => void }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const toggle = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await setJoker(secret, matchId, !on);
      if (!on && r.moved_from) setMsg('Joker bu haftaki diğer maçından buraya taşındı.');
      track('joker_set', { on: !on });
      onChange();
    } catch (e) { setMsg((e as { message?: string }).message ?? 'Kaydedilemedi.'); } finally { setBusy(false); }
  };
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Pressable onPress={toggle} disabled={busy} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel="Joker, haftada bir maç puanı ikiye katlar"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1,
          borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accentSoft : 'transparent', opacity: busy ? 0.6 : 1 }}>
        <Text style={{ fontSize: 14 }}>🃏</Text>
        <Text style={{ fontSize: 13.5, fontWeight: '600', color: on ? t.fg : t.muted }}>{on ? 'Joker bu maçta · ×2' : 'Joker kullan · ×2'}</Text>
      </Pressable>
      {!!msg && <Text style={{ fontSize: 11.5, color: t.fg, textAlign: 'center' }}>{msg}</Text>}
    </View>
  );
}

const pct = (x: number, n: number) => `%${Math.round((x / n) * 100)}`;

// Topluluk: "Tribün: GS %62 · X %21 · FB %17" (en az 20 tahminle) ve "Grubunda 5 kişiden 4'ü GS".
function CommunityLine({ f, data }: { f: Fixture; data?: Community }) {
  const t = useTheme();
  if (!data || data.hidden) return null;
  const side = (d: Dist) => {
    const best = Math.max(d.h, d.d, d.a);
    return { n: best, label: best === d.h ? f.h.name : best === d.a ? f.a.name : 'beraberlik' };
  };
  const lines: string[] = [];
  if (data.tribun) lines.push(`Tribün: ${f.h.name} ${pct(data.tribun.h, data.tribun.n)} · X ${pct(data.tribun.d, data.tribun.n)} · ${f.a.name} ${pct(data.tribun.a, data.tribun.n)}`);
  for (const g of (data.groups ?? []).slice(0, 3)) {
    if (g.n < 2) continue;
    const s = side(g);
    lines.push(`${g.name}: ${g.n} kişiden ${possessive(s.n)} ${s.label}`);
  }
  if (!lines.length) return null;
  return (
    <View style={{ gap: 3, marginTop: 2 }}>
      {lines.map((l) => <Text key={l} numberOfLines={1} style={{ fontSize: 12.5, color: t.muted, textAlign: 'center' }}>{l}</Text>)}
    </View>
  );
}

// Tahmin girerken ipucu: oranlara göre favori ve (Tribün'de yeterli tahmin varsa) seçtiğin sonucu %25'ten azı
// seçtiyse "tutarsa sürpriz +2". Sürpriz bonusu oranlardan değil, topluluğun seçiminden hesaplanır.
function FavoriteHint({ f, h, a, picked, crowd }: { f: Fixture; h: number; a: number; picked: boolean; crowd?: Community }) {
  const t = useTheme();
  const o = useOdds(f).data?.odds;
  if (!o) return null;
  const fav = o.pct[0] >= o.pct[2] ? 0 : 2;
  const favName = fav === 0 ? f.h.name : f.a.name;
  const side = h > a ? 0 : h === a ? 1 : 2;
  const tr = crowd && !crowd.hidden ? crowd.tribun : null;
  const share = tr ? [tr.h, tr.d, tr.a][side] / tr.n : null;
  const surprise = picked && share !== null && share < 0.25;
  const against = picked && side !== fav;
  return (
    <View style={{ alignSelf: 'stretch', backgroundColor: t.accentSoft, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
      <Text style={{ fontSize: 13, color: t.fg, lineHeight: 18 }}>
        Favori <Text style={{ fontWeight: '700', color: t.accent }}>{favName} %{o.pct[fav]}</Text>.
        {picked ? (against ? ' Tahminin favoriye karşı.' : ' Tahminin favoriyle aynı yönde.') : ''}
        {surprise ? ' Tutarsa sürpriz bonusu ' : ''}
      </Text>
      {surprise && <View style={{ backgroundColor: '#FFA53D', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}><Text style={{ fontSize: 11.5, fontWeight: '800', color: '#0B1030' }}>+2</Text></View>}
    </View>
  );
}

// İlk tahminden sonra, hesabı bağlı değilse: "Puanların kaybolmasın" önerisi. Hesap ekranına götürür; "Şimdi değil" ile
// kalıcı olarak kapanır (Profil'deki hesap kartı yine durur).
function LinkHint() {
  const t = useTheme();
  const store = useStore();
  const nav = useNav();
  if (!store.me || store.me.provider || store.linkHintOff) return null;
  return (
    <View style={{ borderRadius: 14, padding: 12, gap: 10, backgroundColor: t.accentSoft, borderWidth: 1, borderColor: t.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontSize: 22 }}>🔒</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14.5, fontWeight: '700', color: t.fg }}>Puanların kaybolmasın</Text>
          <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 2, lineHeight: 17 }}>Hesabını bağla; telefon değişse de tahminlerin ve grupların seninle gelsin.</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => { track('link_hint', { action: 'open' }); nav.navigate('Account'); }} accessibilityRole="button"
          style={({ pressed }) => ({ flex: 2, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent, opacity: pressed ? 0.8 : 1 })}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.accentInk }}>Hesabını bağla</Text>
        </Pressable>
        <Pressable onPress={() => { track('link_hint', { action: 'dismiss' }); store.dismissLinkHint(); }} accessibilityRole="button"
          style={({ pressed }) => ({ flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.line : t.surface2 })}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.fg }}>Şimdi değil</Text>
        </Pressable>
      </View>
    </View>
  );
}
