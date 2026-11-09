import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, Fixture, get, League, Meta, Team } from './api';
import { toCommon } from './ids';
import { rpc } from './social';

// `me`: gruplar için kimlik. `secret` yalnızca bu cihazda durur; veritabanında özeti tutulur.
type Me = { secret: string; name: string };
// `ids: 2`: numaralar API-Football'un ortak numaralarıdır (1. sürüm kayıtlarında Highlightly numaraları vardı ve
// `provider` alanı tutuluyordu).
type Saved = { teams: Team[]; leagues: number[]; onboarded: boolean; me?: Me; ids?: number; provider?: string };
const EMPTY: Saved = { teams: [], leagues: [], onboarded: false };
const STORAGE_KEY = 'tribun:v1';

// Eski kayıtları bir kereliğine ortak numaralara çevirir. Takip edilen ligler de temizlenir: eski sürümde ilk açılışta
// takımların ligleri kendiliğinden eklenirdi ve ana ekran onları kullanmazdı; artık takip edilen lig tüm maçlarıyla
// görünür, bu yüzden eski kayıtlar ana ekranı doldurmasın.
function migrate(raw: Saved): Saved {
  const s: Saved = { ...EMPTY, ...raw };
  if (s.ids === 2) return s;
  const convert = s.provider === 'apifootball' ? (id: number) => id : toCommon;
  return { ...s, teams: s.teams.map((t) => ({ ...t, id: convert(t.id) })), leagues: [], ids: 2, provider: undefined };
}

type Store = Saved & {
  meta: Meta;
  league: (id: number) => League | undefined;
  followsTeam: (id: number) => boolean;
  followsLeague: (id: number) => boolean;
  followsMatch: (f: Fixture) => boolean;
  toggleTeam: (team: Team) => void;
  toggleLeague: (id: number) => void;
  finishOnboarding: (teams: Team[], leagues: number[]) => void;
  restartOnboarding: () => void;
  setName: (name: string) => Promise<void>;
  reloadMeta: () => void;
};
const Ctx = createContext<Store | null>(null);
export const useStore = () => useContext(Ctx)!;

export function StoreProvider({ children, fallback }: { children: React.ReactNode; fallback: (error: ApiError | null, retry: () => void) => React.ReactNode }) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return setSaved({ ...EMPTY, ids: 2 });
        const stored: Saved = JSON.parse(raw);
        const migrated = migrate(stored);
        if (stored.ids !== 2) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)).catch(() => {});
        setSaved(migrated);
      })
      .catch(() => setSaved({ ...EMPTY, ids: 2 }));
  }, []);
  const reloadMeta = useCallback(() => {
    setError(null);
    get<Meta>('/api/meta').then(setMeta, setError);
  }, []);
  useEffect(reloadMeta, [reloadMeta]);

  const update = useCallback((fn: (s: Saved) => Saved) => {
    setSaved((prev) => {
      const next = fn(prev || EMPTY);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const store = useMemo<Store | null>(() => {
    if (!saved || !meta) return null;
    const teamIds = new Set(saved.teams.map((t) => t.id));
    const leagueIds = new Set(saved.leagues);
    return {
      ...saved,
      meta,
      league: (id) => meta.leagues.find((l) => l.id === id),
      followsTeam: (id) => teamIds.has(id),
      followsLeague: (id) => leagueIds.has(id),
      followsMatch: (f) => teamIds.has(f.h.id) || teamIds.has(f.a.id) || leagueIds.has(f.lg),
      toggleTeam: (team) => update((s) => ({ ...s, teams: s.teams.some((t) => t.id === team.id) ? s.teams.filter((t) => t.id !== team.id) : [...s.teams, team] })),
      toggleLeague: (id) => update((s) => ({ ...s, leagues: s.leagues.includes(id) ? s.leagues.filter((l) => l !== id) : [...s.leagues, id] })),
      finishOnboarding: (teams, leagues) => update(() => ({ teams, leagues, onboarded: true })),
      restartOnboarding: () => update((s) => ({ ...s, onboarded: false })),
      setName: async (name) => {
        const secret = saved.me?.secret ?? Crypto.randomUUID() + Crypto.randomUUID();
        const profile = await rpc<{ name: string }>('register', { p_secret: secret, p_name: name });
        update((s) => ({ ...s, me: { secret, name: profile.name } }));
      },
      reloadMeta,
    };
  }, [saved, meta, update, reloadMeta]);

  if (!store) return <>{fallback(error, reloadMeta)}</>;
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
