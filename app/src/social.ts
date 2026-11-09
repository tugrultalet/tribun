import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { ApiError, Fixture, Team } from './api';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

export type Group = {
  id: string; name: string; code: string; team: Team; members: number;
  last_message: { body: string; name: string; created_at: string } | null;
};
export type Member = { id: string; name: string };
export type Prediction = { profile_id: string; match_id: number; h: number; a: number; updated_at: string };
export type GroupDetail = { group: Group; me: string; members: Member[]; predictions: Prediction[] };
export type Message = { id: number; profile_id: string; name: string; body: string; created_at: string };

// Veritabanındaki izinli fonksiyonlardan birini çağırır (bkz. supabase/migrations).
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
  } catch {
    throw new ApiError('network', 'Bağlantı kurulamadı. İnternetini kontrol et.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError('social', body?.message || `İşlem başarısız (${res.status}).`);
  return body as T;
}

// useApi'nin veritabanı fonksiyonları için karşılığı. `args` null ise beklemede kalır.
export function useRpc<T>(fn: string, args: Record<string, unknown> | null, refreshMs?: number) {
  const focused = useIsFocused();
  const key = args ? JSON.stringify(args) : null;
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const current = useRef(key);
  current.current = key;

  const load = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    try {
      const d = await rpc<T>(fn, JSON.parse(key));
      if (current.current === key) { setData(d); setError(null); }
    } catch (e) {
      if (current.current === key) setError(e as ApiError);
    } finally {
      if (current.current === key) setLoading(false);
    }
  }, [fn, key]);

  useEffect(() => {
    if (!key || !focused) return;
    load();
    if (!refreshMs) return;
    const t = setInterval(load, refreshMs);
    return () => clearInterval(t);
  }, [key, focused, refreshMs, load]);

  return { data, error, loading, reload: load };
}

/* ---------- Tahmin kuralları ---------- */
// Tahmin, maç başlamadan önce (veritabanı saatine göre) girildiyse geçerlidir.
export const isValid = (p: Prediction, f: Fixture) => new Date(p.updated_at).getTime() < f.ts * 1000;
export const hasStarted = (f: Fixture) => f.st !== 'ns' || Date.now() >= f.ts * 1000;
// Tam skor 3 puan, doğru sonuç 1 puan. Maç bitmediyse ya da tahmin geç girildiyse null.
export function points(p: Prediction, f: Fixture): number | null {
  if (f.st !== 'ft' || !f.s || !isValid(p, f)) return null;
  if (p.h === f.s[0] && p.a === f.s[1]) return 3;
  return Math.sign(p.h - p.a) === Math.sign(f.s[0] - f.s[1]) ? 1 : 0;
}
export type Standing = { member: Member; total: number; exact: number; played: number };
export function leaderboard(detail: GroupDetail, fixtures: Fixture[]): Standing[] {
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  return detail.members
    .map((member) => {
      const scored = detail.predictions
        .filter((p) => p.profile_id === member.id)
        .map((p) => { const f = byId.get(p.match_id); return f ? points(p, f) : null; })
        .filter((n): n is number => n !== null);
      return { member, total: scored.reduce((a, b) => a + b, 0), exact: scored.filter((n) => n === 3).length, played: scored.length };
    })
    .sort((a, b) => b.total - a.total || b.exact - a.exact || a.member.name.localeCompare(b.member.name, 'tr'));
}
