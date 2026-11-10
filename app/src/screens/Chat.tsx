import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, Fixture, Match, MatchEvent, Team, TeamData, get } from '../api';
import { finalSummary } from '../groups/standings';
import { ChatItem, SystemMsg, abbr, mergeTimeline, systemMessages } from '../chat/timeline';
import { gradientFor } from '../teamColors';
import { RootParams, useNav } from '../nav';
import { GroupDetail, Message, rpc } from '../social';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { BackBar, Crest } from '../ui';
import { Backdrop } from './Screen';

const POLL_MS = 4000;
const MATCH_POLL_MS = 15000;
const RECENT_MS = 12 * 3600 * 1000;
const IOS = Platform.OS === 'ios';

// Grup sohbeti. Yeni mesajlar kısa aralıklarla sorulur (anlık bağlantı yok).
export default function Chat({ route, navigation }: NativeStackScreenProps<RootParams, 'Chat'>) {
  const t = useTheme();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const focused = useIsFocused();
  const store = useStore();
  const secret = store.me?.secret ?? '';
  const { id, name } = route.params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [team, setTeam] = useState<Team | null>(null);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [teamFx, setTeamFx] = useState<Fixture[]>([]);
  const [games, setGames] = useState<{ f: Fixture; events: MatchEvent[] }[]>([]);
  const [kbOpen, setKbOpen] = useState(false);
  const last = useRef(0);

  // Klavye açıkken alt güvenli alan boşluğu gerekmez (klavye zaten ekranın altını kaplar).
  useEffect(() => {
    const show = Keyboard.addListener(IOS ? 'keyboardWillShow' : 'keyboardDidShow', () => setKbOpen(true));
    const hide = Keyboard.addListener(IOS ? 'keyboardWillHide' : 'keyboardDidHide', () => setKbOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useLayoutEffect(() => { if (IOS) navigation.setOptions({ title: name }); }, [navigation, name]);

  const poll = async () => {
    try {
      const fresh = await rpc<Message[]>('get_messages', { p_secret: secret, p_group: id, p_after: last.current });
      if (fresh.length) {
        last.current = fresh[fresh.length - 1].id;
        setMessages((prev) => [...prev, ...fresh.filter((m) => !prev.some((x) => x.id === m.id))]);
      }
      setError('');
    } catch (e) { setError((e as ApiError).message); }
  };
  useEffect(() => {
    rpc<GroupDetail>('group_detail', { p_secret: secret, p_group: id }).then((d) => { setMyId(d.me); setTeam(d.group.team); setDetail(d); }, () => {});
  }, [secret, id]);
  useEffect(() => {
    if (!focused) return;
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [focused, id]);

  // Grubun takımının canlı ve son 12 saatte biten maçları: olayları sohbet akışına sistem mesajı olarak girer.
  // Sunucu yanıtları önbelleğe alır; burada yalnızca birkaç hafif istek atılır, hata olursa sohbet etkilenmez.
  useEffect(() => {
    if (!focused || !team) return;
    let alive = true;
    const load = async () => {
      try {
        const td = await get<TeamData>(`/api/team/${team.id}`);
        const now = Date.now();
        const recent = td.fixtures.filter((f) => f.st === 'live' || (f.st === 'ft' && now - f.ts * 1000 < RECENT_MS)).slice(0, 3);
        const next = await Promise.all(recent.map(async (f) => {
          const m = await get<Match>(`/api/match/${f.id}`).catch(() => null);
          return { f: m?.fixture ?? f, events: m?.events ?? [] };
        }));
        // Maç sonu özeti için güncel tahminler de yenilenir (biten maçın tahminleri açıktır).
        const d = next.some((g) => g.f.st === 'ft') ? await rpc<GroupDetail>('group_detail', { p_secret: secret, p_group: id }).catch(() => null) : null;
        if (alive) { setGames(next); setTeamFx(td.fixtures); if (d) setDetail(d); }
      } catch { /* sistem mesajları isteğe bağlı */ }
    };
    load();
    const timer = setInterval(load, MATCH_POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [focused, team?.id]);
  const items = useMemo(() => {
    const now = Date.now();
    return mergeTimeline(messages, games.flatMap((g) => systemMessages(g.f, g.events, now, detail ? finalSummary(detail, g.f, teamFx) : null)));
  }, [messages, games, detail, teamFx]);
  const inverted = useMemo(() => [...items].reverse(), [items]);
  const liveGame = games.find((g) => g.f.st === 'live')?.f;

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try { await rpc('send_message', { p_secret: secret, p_group: id, p_body: body }); setText(''); await poll(); }
    catch (e) { setError((e as ApiError).message); } finally { setSending(false); }
  };

  const time = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Backdrop />
      {!IOS && <View style={{ paddingTop: insets.top }}><BackBar title={name} onBack={nav.goBack} /></View>}
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={IOS ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <FlatList
          data={inverted}
          inverted
          keyExtractor={(m) => m.id}
          contentInsetAdjustmentBehavior="never"
          keyboardDismissMode={IOS ? 'interactive' : 'on-drag'}
          // Ters çevrilmiş liste: en yeni mesaj hep altta, kaydırma hesabı gerekmez. Görsel üst boşluk (başlık + canlı şerit) paddingBottom'dur.
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: (IOS ? headerHeight : 0) + (liveGame ? 52 : 14), gap: 8 }}
          ListEmptyComponent={<Text style={{ textAlign: 'center', color: t.muted, fontSize: 14, transform: [{ scaleY: -1 }] }}>Henüz mesaj yok. İlk mesajı sen yaz.</Text>}
          renderItem={({ item: row }) => {
            if (row.kind === 'system') return <SystemLine m={row} f={games.find((g) => row.id.startsWith(`${g.f.id}:`))?.f} />;
            const item = row.msg;
            const mine = item.profile_id === myId;
            return (
              <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, backgroundColor: mine ? t.accent : t.surface2 }}>
                {!mine && <Text style={{ fontSize: 12, fontWeight: '700', color: t.accent, marginBottom: 2 }}>{item.name}</Text>}
                <Text style={{ fontSize: 15, lineHeight: 20, color: mine ? t.accentInk : t.fg }}>{item.body}</Text>
                <Text style={{ fontSize: 10.5, marginTop: 2, alignSelf: 'flex-end', color: mine ? t.accentInk : t.muted, opacity: 0.75 }}>{time(item.created_at)}</Text>
              </View>
            );
          }}
        />
        {error ? <Text style={{ color: t.live, fontSize: 12, textAlign: 'center', paddingBottom: 4 }}>{error}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: kbOpen ? 8 : Math.max(insets.bottom, 10) }}>
          <TextInput value={text} onChangeText={setText} placeholder="Mesaj yaz" placeholderTextColor={t.muted} multiline maxLength={500} accessibilityLabel="Mesaj yaz"
            style={{ flex: 1, minHeight: 42, maxHeight: 120, borderRadius: 21, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 16, color: t.fg, backgroundColor: t.surface2 }} />
          <Pressable onPress={send} disabled={!text.trim() || sending} accessibilityRole="button" accessibilityLabel="Gönder"
            style={{ height: 42, paddingHorizontal: 16, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent, opacity: !text.trim() || sending ? 0.4 : 1 }}>
            <Text style={{ fontWeight: '700', fontSize: 15, color: t.accentInk }}>Gönder</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      {liveGame ? <LiveStrip f={liveGame} top={IOS ? headerHeight + 4 : insets.top + 52} /> : null}
    </View>
  );
}

// Sabit canlı skor şeridi: maç sürerken sohbetin üstünde durur.
function LiveStrip({ f, top }: { f: Fixture; top: number }) {
  const t = useTheme();
  const clock = f.short === 'HT' ? 'Devre arası' : `${f.min ?? ''}${f.extra ? `+${f.extra}` : ''}'`;
  return (
    <View accessibilityRole="summary" accessibilityLabel={`Canlı: ${f.h.name} ${f.s?.[0] ?? 0} ${f.s?.[1] ?? 0} ${f.a.name}`}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: 14, position: 'absolute', top, left: 12, right: 12, borderRadius: 16, backgroundColor: t.surface2 }}>
      <Crest uri={f.h.logo} size={20} />
      <Text style={{ fontSize: 15, fontWeight: '700', color: t.fg, fontVariant: ['tabular-nums'] }}>{abbr(f.h.name)} {f.s?.[0] ?? 0}–{f.s?.[1] ?? 0} {abbr(f.a.name)}</Text>
      <Crest uri={f.a.logo} size={20} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: t.live }}>● {clock}</Text>
    </View>
  );
}

// Sohbetteki sistem mesajı: ortalı, küçük, olayın takımının renginde sol çizgili; kullanıcı mesajından belirgin biçimde ayrışır.
function SystemLine({ m, f }: { m: SystemMsg; f?: Fixture }) {
  const t = useTheme();
  const team = m.side && f ? (m.side === 'h' ? f.h : f.a) : null;
  const color = m.tone === 'red' ? t.live : team ? lighten(gradientFor(team.name)[0]) : t.muted;
  return (
    <View style={{ alignSelf: 'center', maxWidth: '92%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: t.surface }}>
      {m.tone !== 'info' ? <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: color }} /> : null}
      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.muted, textAlign: 'center', flexShrink: 1 }}>{m.text}</Text>
    </View>
  );
}

// Koyu takım renklerini koyu zeminde seçilir kılmak için beyaza doğru açar.
function lighten(hex: string, amount = 0.45): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}
