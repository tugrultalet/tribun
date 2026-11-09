import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';

// Tribün sunucusunun adresi. Telefonda denerken bilgisayarın yerel ağ IP'sini ya da yayındaki sunucuyu verin.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8787').replace(/\/$/, '');

export type Team = { id: number; name: string; logo: string };
export type Fixture = {
  id: number; lg: number; round: string; ts: number; date: string; time: string;
  st: 'ns' | 'live' | 'ft' | 'off'; short: string; min: number | null; extra: number | null;
  h: Team; a: Team; s: [number, number] | null; pen: [number, number] | null;
};
export type League = { id: number; name: string; country: string; type: 'main' | 'cup'; logo: string };
export type Meta = {
  plan: string | null; limitDay: number | null; used: number | null; remaining: number | null; error?: string;
  today: string; window: { from: number; to: number }; season: number; liveTtl: number; leagues: League[];
};
export type Day = { date: string; fixtures: Fixture[]; stale?: boolean };
export type MatchEvent = { min: number; extra: number | null; side: 'h' | 'a'; k: 'goal' | 'miss' | 'y' | 'r' | 'sub' | 'var' | 'other'; p: string; x: string | null };
export type LineupPlayer = { no: number | null; name: string; pos: string | null; row: number | null; col: number | null };
export type Lineup = { teamId: number; formation: string | null; coach: string | null; color: string | null; numColor: string | null; xi: LineupPlayer[]; subs: LineupPlayer[] };
export type Stat = { label: string; unit: string; h: number; a: number };
export type Match = { fixture: Fixture; venue: string | null; referee: string | null; events: MatchEvent[]; stats: Stat[]; stale?: boolean };
export type Lineups = { lineups: Lineup[] };
export type Zone = 'cl' | 'el' | 'ecl' | 'rel';
export type StandingRow = { rank: number; team: Team; pts: number; gd: number; p: number; w: number; d: number; l: number; gf: number; ga: number; form: string; zone: Zone | null };
export type Standings = { league: number; season: number; current: boolean; groups: { name: string; rows: StandingRow[] }[] };
export type LeagueFixtures = { league: number; limited: boolean; fixtures: Fixture[] };
export type TeamData = { team: Team; league: number | null; limited: boolean; fixtures: Fixture[] };
export type Squad = { team: Team; players: { id: number; name: string; age: number | null; no: number | null; pos: string }[]; from: { date: string; rival: string } | null };
export type LeagueTeams = { league: number; season: number; current: boolean; teams: Team[] };

export class ApiError extends Error {
  constructor(public kind: string, message: string) { super(message); }
}

export async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path);
  } catch {
    throw new ApiError('network', `Sunucuya ulaşılamadı (${API_URL}).`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new ApiError(body?.error?.kind || 'server', body?.error?.message || `Sunucu hatası (${res.status}).`);
  return body as T;
}

const memory = new Map<string, unknown>();

// Önce bellekteki son yanıtı gösterir, arkada yeniler. `refreshMs` verilirse ekran odaktayken periyodik yeniler.
export function useApi<T>(path: string | null, refreshMs?: number) {
  const focused = useIsFocused();
  const [data, setData] = useState<T | undefined>(() => (path ? (memory.get(path) as T | undefined) : undefined));
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const current = useRef(path);

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const d = await get<T>(path);
      memory.set(path, d);
      if (current.current === path) { setData(d); setError(null); }
    } catch (e) {
      if (current.current === path) setError(e as ApiError);
    } finally {
      if (current.current === path) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    current.current = path;
    setData(path ? (memory.get(path) as T | undefined) : undefined);
    setError(null);
  }, [path]);

  useEffect(() => {
    if (!path || !focused) return;
    load();
    if (!refreshMs) return;
    const t = setInterval(load, refreshMs);
    return () => clearInterval(t);
  }, [path, focused, refreshMs, load]);

  return { data, error, loading, reload: load };
}
