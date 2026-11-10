// Sekme rozetleri: Maçlarım'da tahmin bekleyen yakın maç sayısı, Gruplar'da okunmamış mesaj sayısı.
import { useMemo } from 'react';
import { Mine, useApi } from './api';
import { useMyPicks } from './game/hooks';
import { useRpc } from './social';
import { useStore } from './store';
import { pendingCount } from './game/pending';

const label = (n: number) => (n > 0 ? (n > 9 ? '9+' : String(n)) : undefined);

export function useTabBadges(): { home?: string; groups?: string } {
  const store = useStore();
  const secret = store.me?.secret;
  const ids = store.teams.map((x) => x.id);
  const mine = useApi<Mine>(secret && ids.length ? `/api/mine?teams=${ids.join(',')}` : null, 300000);
  const picks = useMyPicks(300000);
  const unread = useRpc<Record<string, number>>('unread_counts', secret ? { p_secret: secret } : null, 30000);
  return useMemo(() => {
    const picked = new Set((picks.data ?? []).map((p) => p.match_id));
    const fixtures = Array.isArray(mine.data?.fixtures) ? mine.data!.fixtures : [];
    const u = unread.data && typeof unread.data === 'object' ? Object.values(unread.data).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
    return { home: picks.data ? label(pendingCount(fixtures, picked)) : undefined, groups: label(u) };
  }, [mine.data, picks.data, unread.data]);
}
