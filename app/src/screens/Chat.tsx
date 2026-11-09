import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../api';
import { RootParams, useNav } from '../nav';
import { Message, rpc } from '../social';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { BackBar } from '../ui';
import { Backdrop } from './Screen';

const POLL_MS = 4000;
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
  const last = useRef(0);
  const list = useRef<FlatList<Message>>(null);

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
    rpc<{ me: string }>('group_detail', { p_secret: secret, p_group: id }).then((d) => setMyId(d.me), () => {});
  }, [secret, id]);
  useEffect(() => {
    if (!focused) return;
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [focused, id]);

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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={IOS ? 'padding' : undefined} keyboardVerticalOffset={IOS ? headerHeight : 0}>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ padding: 14, gap: 8, flexGrow: 1, justifyContent: 'flex-end' }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={<Text style={{ textAlign: 'center', color: t.muted, fontSize: 14 }}>Henüz mesaj yok. İlk mesajı sen yaz.</Text>}
          renderItem={({ item }) => {
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
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10) }}>
          <TextInput value={text} onChangeText={setText} placeholder="Mesaj yaz" placeholderTextColor={t.muted} multiline maxLength={500} accessibilityLabel="Mesaj yaz"
            style={{ flex: 1, minHeight: 42, maxHeight: 120, borderRadius: 21, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 16, color: t.fg, backgroundColor: t.surface2 }} />
          <Pressable onPress={send} disabled={!text.trim() || sending} accessibilityRole="button" accessibilityLabel="Gönder"
            style={{ height: 42, paddingHorizontal: 16, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent, opacity: !text.trim() || sending ? 0.4 : 1 }}>
            <Text style={{ fontWeight: '700', fontSize: 15, color: t.accentInk }}>Gönder</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
