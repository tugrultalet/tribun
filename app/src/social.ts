import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useAppActive } from './appState';
import { ApiError, Fixture, Team } from './api';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

export type Group = {
  id: string; name: string; code: string; team: Team; members: number;
  // Kapsam: boşsa grubun takımının maçları; {type:'leagues'} ise seçilen turnuvaların maçları.
  scope?: { type: 'leagues'; ids: number[] } | null;
  last_message: { body: string; name: string; created_at: string } | null;
};
import type { Detail, Member, Prediction } from './groups/standings';
export type { Member, Prediction };
export type GroupDetail = Detail & { group: Group };
export type Message = { id: number; profile_id: string; name: string; body: string; created_at: string };

// Veritabanındaki izinli fonksiyonlardan birini çağırır (bkz. supabase/migrations).
// `token`: giriş yapılmış kullanıcının oturum anahtarı (yalnızca hesap bağlama için).
export async function rpc<T>(fn: string, args: Record<string, unknown>, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token ?? SUPABASE_KEY}`, 'Content-Type': 'application/json' },
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
  const isFocused = useIsFocused();
  const appActive = useAppActive();
  const focused = isFocused && appActive;
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
