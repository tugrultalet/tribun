import React, { useMemo, useState } from 'react';
import { Alert, Linking, Platform, Pressable, Share, Text, View } from 'react-native';
import { PUBLIC_URL } from '../api';
import { useNav } from '../nav';
import { rpc, useRpc } from '../social';
import { useStore } from '../store';
import { track } from '../telemetry';
import { useTheme } from '../theme';
import { Button, Card, Field, HAIR, Icon, Section, Seg, SwipeRow } from '../ui';
import { friendCodeFrom } from './ask';
import { inviteFriend } from './friendInvite';

type Friend = { id: string; name: string; me: boolean; since: string | null; week: number; season: number; won?: number; lost?: number };

// Profil'de arkadaşlar: "Arkadaşlarına sor" bağlantısıyla gelip tahmin yapan herkes (ve sen) hafta / sezon puanına göre.
// Dokununca arkadaşın profili; sola kaydırınca "Çıkar" (arkadaşlıktan çıkarır). Arkadaşlar birbirinin tahminini maç
// başlayınca görür.
export function FriendsSection() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const secret = store.me?.secret;
  const state = useRpc<Friend[]>('my_friends', secret ? { p_secret: secret } : null, 120000);
  const [period, setPeriod] = useState<'week' | 'season'>('week');
  const list = Array.isArray(state.data) ? state.data : [];
  const ranked = useMemo(() => {
    const key = period === 'week' ? 'week' : 'season';
    const sorted = [...list].sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name, 'tr'));
    let rank = 0, last = -1;
    return sorted.map((f, i) => { if (f[key] !== last) { rank = i + 1; last = f[key]; } return { ...f, rank, pts: f[key] }; });
  }, [list, period]);
  if (!secret || !state.data) return null;
  const friends = list.filter((f) => !f.me);

  const remove = (f: Friend) => {
    const go = () => rpc('remove_friend', { p_secret: secret, p_profile: f.id }).then(() => { track('friend_removed'); state.reload(); }, () => {});
    const msg = `${f.name} arkadaşlarından çıkarılsın mı? Ortak bir tribününüz yoksa birbirinizin tahminlerini görmezsiniz.`;
    if (Platform.OS === 'web') { if (globalThis.confirm?.(msg)) go(); return; }
    Alert.alert('Arkadaşlıktan çıkar', msg, [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Çıkar', style: 'destructive', onPress: go }]);
  };

  const invite = () => inviteFriend(secret);
  const addButton = (
    <Pressable onPress={invite} accessibilityRole="button" accessibilityLabel="Arkadaş ekle"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 14, marginBottom: 10,
        backgroundColor: pressed ? '#1DA851' : '#25D366' })}>
      <Text style={{ fontSize: 16 }}>➕</Text>
      <Text style={{ fontSize: 15, fontWeight: '800', color: '#05301A' }}>Arkadaş ekle</Text>
    </Pressable>
  );

  return (
    <Section eyebrow={`Arkadaşlarım${friends.length ? ` · ${friends.length}` : ''}`}>
      {addButton}
      <CodeEntry secret={secret} onDone={state.reload} />
      {friends.length ? (
        <>
          <Seg value={period} onChange={setPeriod} options={[['week', 'Bu hafta'], ['season', 'Sezon']]} />
          <Card style={{ marginTop: 10 }}>
            {ranked.map((f, i) => {
              const row = (
                <Pressable onPress={() => (f.me ? undefined : nav.navigate('Member', { id: f.id, name: f.name }))} disabled={f.me} accessibilityRole={f.me ? undefined : 'button'}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderTopWidth: i ? HAIR : 0, borderColor: t.line,
                    backgroundColor: f.me ? t.accentSoft : pressed ? t.surface2 : 'transparent' })}>
                  <Text style={{ width: 24, fontSize: 14, fontWeight: '700', color: t.muted, fontVariant: ['tabular-nums'] }}>{f.rank}</Text>
                  <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: t.fg }}>{f.name.slice(0, 1).toLocaleUpperCase('tr')}</Text>
                  </View>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: f.me ? '700' : '500', color: t.fg }}>{f.me ? `${f.name} (sen)` : f.name}</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: t.fg, fontVariant: ['tabular-nums'] }}>{f.pts}</Text>
                    {/* Kafa kafaya: ikinizin de tahmin yaptığı biten maçlarda kazandığın – kaybettiğin. */}
                    {!f.me && (f.won || f.lost) ? <Text style={{ fontSize: 11.5, fontWeight: '700', color: t.accent, fontVariant: ['tabular-nums'] }}>Sen {f.won}–{f.lost}</Text> : null}
                  </View>
                  {!f.me && <Icon.chevron color={t.fg} />}
                </Pressable>
              );
              return f.me ? <View key={f.id}>{row}</View> : <SwipeRow key={f.id} label="Çıkar" onAction={() => remove(f)}>{row}</SwipeRow>;
            })}
          </Card>
          <Text style={{ fontSize: 12, color: t.muted, marginTop: 6, marginHorizontal: 4, lineHeight: 17 }}>Sola kaydırarak arkadaşlıktan çıkarabilirsin. Tahminler maç başlayınca görünür.</Text>
        </>
      ) : (
        <Card style={{ padding: 14 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.fg }}>🤝 Arkadaşlarınla yarış</Text>
          <Text style={{ fontSize: 13, color: t.muted, marginTop: 4, lineHeight: 18 }}>
            "Arkadaş ekle" ile WhatsApp'tan davet gönder ya da bir maça tahmin yapıp "Arkadaşlarına sor" ile paylaş. Bağlantıdan gelen herkes burada arkadaşın olarak görünür; birbirinizin tahminlerini ve puanlarını görürsünüz.
          </Text>
        </Card>
      )}
    </Section>
  );
}

// "Davet kodu gir": arkadaşından gelen bağlantı uygulamayı açmadıysa, WhatsApp'taki 8 karakterlik kodu (ya da bağlantıyı)
// yapıştırarak arkadaş olunur.
function CodeEntry({ secret, onDone }: { secret: string; onDone: () => void }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const parsed = friendCodeFrom(code);
  const submit = async () => {
    if (!parsed) return;
    setBusy(true); setMsg('');
    try {
      const r = await rpc<{ ok: boolean; new?: boolean; name?: string; self?: boolean; error?: string }>('accept_friend', { p_secret: secret, p_code: parsed });
      if (r.self) setMsg('Bu senin kendi davet kodun.');
      else if (!r.ok) setMsg(r.error ?? 'Kod bulunamadı.');
      else { setMsg(r.new ? `${r.name} ile artık arkadaşsınız 🤝` : `${r.name} ile zaten arkadaşsınız.`); setCode(''); track('friend_code_entered'); onDone(); }
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" hitSlop={6} style={{ alignSelf: 'center', marginBottom: 10 }}>
        <Text style={{ fontSize: 13.5, color: t.accent, fontWeight: '600' }}>Davet kodun mu var? Kodu gir</Text>
      </Pressable>
    );
  }
  return (
    <Card style={{ padding: 12, gap: 8, marginBottom: 10 }}>
      <Field value={code} onChange={setCode} placeholder="Davet kodu (ör. ABCD2345)" maxLength={80} autoCapitalize="characters" onSubmit={submit} />
      <Button label={busy ? 'Ekleniyor…' : 'Arkadaş ol'} disabled={busy || !parsed} onPress={submit} />
      {!!msg && <Text style={{ fontSize: 13, color: t.fg, textAlign: 'center' }}>{msg}</Text>}
    </Card>
  );
}
