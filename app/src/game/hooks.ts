import { useEffect, useMemo, useState } from 'react';
import { get } from '../api';
import { rpc } from '../social';
import { useRpc } from '../social';
import { useStore } from '../store';
import { MyPick, Result, needsResult } from './stats';

// Benim tüm tahminlerim (kişisel puan ve ana ekran etiketleri için).
// Beklenmeyen (dizi olmayan) yanıt boş liste sayılır; ekranlar çökmesin.
export function useMyPicks(refreshMs = 60000) {
  const secret = useStore().me?.secret;
  const state = useRpc<MyPick[]>('my_picks', secret ? { p_secret: secret } : null, refreshMs);
  return { ...state, data: state.data === undefined ? undefined : Array.isArray(state.data) ? state.data : [] };
}

// Biten maçların sonuçları. Biten maç değişmez; bir kez alınınca bellekte kalır ve sunucu da herkes için önbellekte tutar.
const known = new Map<number, Result>();
const CHUNK = 40;

export function useResults(picks: MyPick[] | undefined): Map<number, Result> {
  const [, bump] = useState(0);
  const missing = useMemo(() => (picks ?? []).filter((p) => needsResult(p) && !known.has(p.match_id)).map((p) => p.match_id), [picks, known.size]);
  const key = missing.join(',');
  useEffect(() => {
    if (!missing.length) return;
    let alive = true;
    const load = async () => {
      for (let i = 0; i < missing.length; i += CHUNK) {
        try {
          const r = await get<{ results: Result[]; pending: number[] }>(`/api/results?ids=${missing.slice(i, i + CHUNK).join(',')}`);
          for (const x of r.results) known.set(x.id, x);
        } catch { /* sonuçlar sonraki turda yeniden denenir */ }
      }
      if (alive) bump((n) => n + 1);
    };
    load();
    // Henüz bitmemiş ya da alınamamış maçlar için seyrek yeniden dene.
    const t = setInterval(load, 120000);
    return () => { alive = false; clearInterval(t); };
  }, [key]);
  return known;
}

// Bir maçta ortak grubum olan arkadaşlarımın tahminleri (başlamamış maçta yalnızca kaç kişinin girdiği).
export type MatchPicks = { revealed: { profile_id: string; name: string; h: number; a: number; updated_at: string }[]; pending: number };
export const setPick = (secret: string, matchId: number, h: number, a: number, kickoffTs: number) =>
  rpc('set_pick', { p_secret: secret, p_match: matchId, p_home: h, p_away: a, p_kickoff: new Date(kickoffTs * 1000).toISOString() });
