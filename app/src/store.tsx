import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, get, League, Meta, Team } from './api';
import { dedupeTeams, teamKey, type FollowedTeam } from './follow';
import { toCommon } from './ids';
import { rpc } from './social';

// `me`: gruplar için kimlik. `secret` yalnızca bu cihazda durur; veritabanında özeti tutulur.
type Me = { secret: string; name: string };
// `ids: 2`: numaralar API-Football'un ortak numaralarıdır (1. sürüm kayıtlarında Highlightly numaraları vardı ve
// `provider` alanı tutuluyordu).
// `v: 3`: takip modeli takım üzerinden kurulur (ana takım + her takım için turnuva seçimi); lig takibi yoktur.
// `leagues` yalnızca eski kayıtları okumak içindir. `droppedLeagues`: taşınan kullanıcıya bir kez gösterilen bilgi notu için
// kaldırılan liglerin numaraları.
type Saved = { teams: FollowedTeam[]; main?: number; onboarded: boolean; me?: Me; ids?: number; provider?: string; v?: number; leagues?: number[]; droppedLeagues?: number[];
  // Gelişmiş: "Tüm maçlarını takip et" işaretlenen turnuvalar (ana ekranda yakın tarihli tüm maçları görünür).
  full?: number[] };
const EMPTY: Saved = { teams: [], onboarded: false, v: 3 };
const STORAGE_KEY = 'tribun:v1';

// Eski kayıtları bir kereliğine ortak numaralara çevirir. Takip edilen ligler de temizlenir: eski sürümde ilk açılışta
// takımların ligleri kendiliğinden eklenirdi ve ana ekran onları kullanmazdı; artık takip edilen lig tüm maçlarıyla
// görünür, bu yüzden eski kayıtlar ana ekranı doldurmasın.
function migrate(raw: Saved): Saved {
  let s: Saved = { ...EMPTY, ...raw };
  if (s.ids !== 2) {
    const convert = s.provider === 'apifootball' ? (id: number) => id : toCommon;
    s = { ...s, teams: s.teams.map((t) => ({ ...t, id: convert(t.id) })), leagues: [], ids: 2, provider: undefined };
  }
  if (s.v !== 3) {
    // Takip modeli sadeleşti: ilk takip edilen takım ana takım olur; takip edilen ligler kaybolur (çipe dönüşmez).
    // Hiç takımı olmayan kullanıcı ilk açılışa döner, yoksa ana ekranı boş kalırdı.
    const dropped = (s.leagues ?? []).filter((id) => id > 0);
    s = { ...s, v: 3, main: s.main ?? s.teams[0]?.id, leagues: undefined, droppedLeagues: dropped.length ? dropped : undefined, onboarded: s.teams.length ? s.onboarded : false };
  }
  // Aynı takımın kopyaları (farklı kaynaklardan ya da tekrarlı kayıtlardan) tek takıma indirilir.
  const d = dedupeTeams(s.teams, s.main);
  return { ...s, teams: d.teams, main: d.main };
}

type Store = Saved & {
  meta: Meta;
  league: (id: number) => League | undefined;
  mainTeam: FollowedTeam | undefined;
  followsTeam: (id: number) => boolean;
  toggleTeam: (team: Team, kind?: 'club' | 'national') => void;
  setMain: (id: number) => void;
  // Numarası sunucuyla eşleşmeyen takımı doğru kayıtla değiştirir (kind ve turnuva seçimi korunur).
  replaceTeam: (oldId: number, team: Team) => void;
  followsFull: (id: number) => boolean;
  toggleFull: (id: number) => void;
  setTeamSel: (id: number, sel: number[] | undefined) => void;
  // Ana ekranın ilk açılacağı sekme (kalıcı değil): ilk açılışta "grup kur" seçilirse Gruplar.
  startTab: 'Groups' | undefined;
  finishOnboarding: (teams: FollowedTeam[], main: number | undefined, startTab?: 'Groups') => void;
  dismissNotice: () => void;
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
  const [startTab, setStartTab] = useState<'Groups' | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return setSaved({ ...EMPTY, ids: 2 });
        const stored: Saved = JSON.parse(raw);
        const migrated = migrate(stored);
        if (JSON.stringify(migrated) !== raw) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)).catch(() => {});
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
    return {
      ...saved,
      meta,
      league: (id) => meta.leagues.find((l) => l.id === id),
      mainTeam: saved.teams.find((t) => t.id === saved.main),
      followsTeam: (id) => teamIds.has(id),
      toggleTeam: (team, kind) => update((s) => {
        // Aynı takım başka bir numarayla zaten takipteyse yeni kopya eklenmez; dokunmak onu çıkarır.
        const same = s.teams.find((t) => t.id === team.id || teamKey(t) === teamKey({ name: team.name, kind: kind === 'national' ? 'national' : undefined }));
        if (same) {
          const teams = s.teams.filter((t) => t.id !== same.id);
          // Ana takım takipten çıkarsa sıradaki takım ana takım olur.
          return { ...s, teams, main: s.main === same.id ? teams[0]?.id : s.main };
        }
        const added: FollowedTeam = kind === 'national' ? { ...team, kind: 'national' } : team;
        return { ...s, teams: [...s.teams, added], main: s.main ?? team.id };
      }),
      setMain: (id) => update((s) => ({ ...s, main: id })),
      replaceTeam: (oldId, team) => update((s) => {
        const teams = s.teams.map((t) => (t.id === oldId ? { ...t, id: team.id, name: team.name, logo: team.logo } : t));
        const d = dedupeTeams(teams, s.main === oldId ? team.id : s.main);
        return { ...s, teams: d.teams, main: d.main };
      }),
      followsFull: (id) => (saved.full ?? []).includes(id),
      toggleFull: (id) => update((s) => ({ ...s, full: (s.full ?? []).includes(id) ? (s.full ?? []).filter((x) => x !== id) : [...(s.full ?? []), id] })),
      setTeamSel: (id, sel) => update((s) => ({ ...s, teams: s.teams.map((t) => (t.id === id ? { ...t, sel } : t)) })),
      startTab,
      finishOnboarding: (teams, main, tab) => {
        setStartTab(tab);
        const d = dedupeTeams(teams, main ?? teams[0]?.id);
        update((s) => ({ ...s, teams: d.teams, main: d.main, onboarded: true }));
      },
      dismissNotice: () => update((s) => ({ ...s, droppedLeagues: undefined })),
      restartOnboarding: () => update((s) => ({ ...s, onboarded: false })),
      setName: async (name) => {
        const secret = saved.me?.secret ?? Crypto.randomUUID() + Crypto.randomUUID();
        const profile = await rpc<{ name: string }>('register', { p_secret: secret, p_name: name });
        update((s) => ({ ...s, me: { secret, name: profile.name } }));
      },
      reloadMeta,
    };
  }, [saved, meta, startTab, update, reloadMeta]);

  if (!store) return <>{fallback(error, reloadMeta)}</>;
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
