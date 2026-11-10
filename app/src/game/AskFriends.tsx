import React, { useState } from 'react';
import { Linking, Platform, Pressable, Share, Switch, Text, View } from 'react-native';
import type { Fixture } from '../api';
import { rpc, useRpc, type Group } from '../social';
import { track } from '../telemetry';
import { useTheme } from '../theme';
import { Button } from '../ui';
import { askMessage } from './ask';

type AskResult = { token: string; notified: number; again: boolean };

// Tahminini girdikten sonra: gruplarındaki arkadaşlarına bildirim (maç başına bir kez) ve gruplarında olmayanlara
// WhatsApp bağlantısı. Bağlantıyla gelen, seçilen gruba katılır. Tahminin varsayılan olarak görünür; gizlenebilir.
export function AskFriends({ f, secret, pick }: { f: Fixture; secret: string; pick: { h: number; a: number } }) {
  const t = useTheme();
  const groupsRaw = useRpc<Group[]>('my_groups', { p_secret: secret }).data;
  const groups = Array.isArray(groupsRaw) ? groupsRaw : [];
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(true);
  const [group, setGroup] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const chosen = group === undefined ? groups[0]?.id ?? null : group;

  const ask = async (): Promise<AskResult | null> => {
    setBusy(true); setMsg('');
    try {
      const r = await rpc<AskResult>('ask_friends', { p_secret: secret, p_match: f.id, p_show: show, p_home: f.h.name, p_away: f.a.name, p_group: chosen });
      if (!r.again) {
        track('ask_sent', { notified: r.notified, show });
        setMsg(r.notified ? `${r.notified} arkadaşına bildirim gitti.` : 'Gruplarındaki herkes zaten tahmin girmiş.');
      }
      return r;
    } catch (e) { setMsg((e as { message?: string }).message ?? 'Gönderilemedi.'); return null; } finally { setBusy(false); }
  };
  const whatsapp = async () => {
    const r = await ask();
    if (!r) return;
    const text = askMessage({ home: f.h.name, away: f.a.name, pick: show ? pick : null, token: r.token });
    track('ask_shared', { channel: 'whatsapp' });
    try { await Linking.openURL(Platform.OS === 'web' ? `https://wa.me/?text=${encodeURIComponent(text)}` : `whatsapp://send?text=${encodeURIComponent(text)}`); }
    catch { await Share.share({ message: text }).catch(() => {}); }
  };

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={{ paddingVertical: 6, paddingHorizontal: 12 }}>
        <Text style={{ color: t.accent, fontWeight: '600', fontSize: 14 }}>Arkadaşına sor</Text>
      </Pressable>
    );
  }
  return (
    <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 4, padding: 12, borderRadius: 14, backgroundColor: t.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ flex: 1, fontSize: 14, color: t.fg }}>Tahminimi göster ({pick.h}–{pick.a})</Text>
        <Switch value={show} onValueChange={setShow} accessibilityLabel="Tahminimi göster" />
      </View>
      {groups.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12.5, color: t.muted }}>WhatsApp'tan gelen hangi gruba katılsın?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[...groups.map((g) => [g.id, g.name] as const), [null, 'Hiçbiri'] as const].map(([id, name]) => {
              const on = chosen === id;
              return (
                <Pressable key={id ?? 'none'} onPress={() => setGroup(id)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                  style={{ paddingVertical: 6, paddingHorizontal: 11, borderRadius: 99, backgroundColor: on ? t.accentSoft : t.surface2, borderWidth: 1, borderColor: on ? t.accent : 'transparent' }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: t.fg }}>{name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
      <Button label={busy ? 'Gönderiliyor…' : "WhatsApp'ta sor"} disabled={busy} onPress={whatsapp} />
      {groups.length > 0 && <Button kind="sec" label="Yalnızca gruplarıma bildir" disabled={busy} onPress={() => { ask(); }} />}
      <Text style={{ fontSize: 12, color: msg ? t.fg : t.muted, textAlign: 'center' }}>
        {msg || 'Gruplarındaki, bu maça henüz tahmin girmemiş arkadaşlarına bir kez bildirim gider.'}
      </Text>
    </View>
  );
}
