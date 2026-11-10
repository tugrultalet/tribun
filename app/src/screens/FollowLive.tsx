import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import type { Fixture } from '../api';
import { useMyPicks } from '../game/hooks';
import { canFollow, followOnLockScreen, liveMatches, liveSupported, stopFollowing } from '../live';
import { useStore } from '../store';
import { track } from '../telemetry';
import { useTheme } from '../theme';

// Maç ekranında "Kilit ekranında takip et": iOS 18+ Live Activity (kilit ekranı + Dynamic Island).
// Canlı ya da 6 saat içinde başlayacak maçta görünür; destek yoksa (eski iOS, Expo Go, web) hiç görünmez.
export function FollowLive({ f }: { f: Fixture }) {
  const t = useTheme();
  const { league } = useStore();
  const picks = useMyPicks(0);
  const [on, setOn] = useState(() => liveMatches().includes(f.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!liveSupported() || !canFollow(f)) return null;
  const pick = picks.data?.find((p) => p.match_id === f.id);
  const toggle = async () => {
    setBusy(true); setError('');
    try {
      if (on) { await stopFollowing(f.id); setOn(false); track('live_activity', { on: false }); }
      else {
        const r = await followOnLockScreen(f, league(f.lg)?.name ?? '', pick ? { h: pick.h, a: pick.a } : null);
        track('live_activity', { on: true, result: r });
        setOn(r !== 'closed');
        if (r === 'local') setError('Teşhis: kanalla açılınca iPhone kapattı; kanalsız açıldı (skor yalnızca uygulama açıkken güncellenir).');
        if (r === 'closed') setError('Teşhis: iPhone etkinliği kanallı da kanalsız da hemen kapattı.');
      }
    } catch (e) { setError((e as { message?: string }).message ?? 'Başlatılamadı.'); } finally { setBusy(false); }
  };
  return (
    <>
      <Pressable onPress={toggle} disabled={busy} accessibilityRole="switch" accessibilityState={{ checked: on }}
        style={{ marginTop: 8, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accentSoft : 'transparent', opacity: busy ? 0.6 : 1 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '600', color: on ? t.fg : t.muted }}>{on ? 'Kilit ekranında takip ediliyor · bırak' : 'Kilit ekranında takip et'}</Text>
      </Pressable>
      {error ? <Text style={{ fontSize: 12, color: t.live, textAlign: 'center' }}>{error}</Text> : null}
    </>
  );
}
