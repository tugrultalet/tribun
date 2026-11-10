import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, get, League, Meta, Team } from './api';
import { dedupeTeams, teamKey, type FollowedTeam } from './follow';
import { legacyToCommon } from './ids';
import { fbPushPermission, fbSubscribe, fbToken } from './fb';
import { pushTopics } from './version';
import { rpc } from './social';
import { signIn, type Provider } from './auth';

// `me`: gruplar için kimlik. `secret` yalnızca bu cihazda durur; veritabanında özeti tutulur.
// provider: profil Apple/Google hesabına bağlıysa (telefon değişince geri yüklenebilir).
type Me = { secret: string; name: string; provider?: Provider };
// `ids: 2`: numaralar API-Football'un ortak numaralarıdır (1. sürüm kayıtlarında Highlightly numaraları vardı ve
// `provider` alanı tutuluyordu).
// `v: 3`: takip modeli takım üzerinden kurulur (ana takım + her takım için turnuva seçimi); lig takibi yoktur.
// `leagues` yalnızca eski kayıtları okumak içindir. `droppedLeagues`: taşınan kullanıcıya bir kez gösterilen bilgi notu için
// kaldırılan liglerin numaraları.
type Saved = { teams: FollowedTeam[]; main?: number; onboarded: boolean; me?: Me; ids?: number; provider?: string; v?: number; leagues?: number[]; droppedLeagues?: number[];
  // Gelişmiş: "Tüm maçlarını takip et" işaretlenen turnuvalar (ana ekranda yakın tarihli tüm maçları görünür).
  full?: number[];
  // Bildirimler: notify açık/kapalı (undefined: henüz sorulmadı), topics: şu an abone olunan konular.
  notify?: boolean; topics?: string[];
  // remind: maçtan 1 saat önce tahmin hatırlatması (undefined: maç bildirimleriyle aynı).
  remind?: boolean;
  // Kilit ekranında canlı skor (Live Activity): takip edilen tüm takımlar için tek anahtar (varsayılan açık).
  liveOn?: boolean;
  // "Hesabını bağla" önerisi (ilk tahminden sonra) kapatıldı mı.
  linkHintOff?: boolean;
  // "Arkadaşlarına sor" bağlantısıyla gelindiyse: o maça tahmin kaydedilince gönderenle arkadaş olunur.
  ask?: { token: string; match: number } };
// ids: 2 boş kayıtta da bulunmalı; yoksa kayıt bir sonraki açılışta "eski" sanılıp numaraları yeniden çevrilirdi.
const EMPTY: Saved = { teams: [], onboarded: false, v: 3, ids: 2 };
const STORAGE_KEY = 'tribun:v1';

// Grup kimliği olan cihaz sırrı iOS Keychain'de (Android Keystore) saklanır, düz AsyncStorage'da değil. Web'de (yalnızca
// geliştirme önizlemesi) güvenli depo olmadığından eski yerinde kalır. Keychain kaydı şifreli yedekle yeni cihaza taşınır.
const SECRET_KEY = 'tribun.secret';
const SECURE = Platform.OS !== 'web';
async function readSecret(): Promise<string | null> {
  if (!SECURE) return null;
  try { return await SecureStore.getItemAsync(SECRET_KEY); } catch { return null; }
}
async function deleteSecret(): Promise<void> {
  if (SECURE) await SecureStore.deleteItemAsync(SECRET_KEY).catch(() => {});
}
async function writeSecret(secret: string): Promise<void> {
  if (SECURE) await SecureStore.setItemAsync(SECRET_KEY, secret, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
}
// Uygulamada profil yok ama Keychain'de sır varsa (uygulama silinip yeniden kurulduysa ya da yerel kayıt bozulduysa):
// sır geçerliyse profil adıyla geri gelir; kullanıcı yeniden giriş yapmaz. Ağ yoksa bir sonraki açılışta yine denenir.
// Çıkış yap ve hesabı sil sırrı Keychain'den de siler, o yüzden bu yol yalnızca kullanıcı çıkmadıysa çalışır.
async function restoreFromKeychain(base: Saved): Promise<Saved> {
  const kept = await readSecret();
  if (!kept) return base;
  const info = await rpc<{ name?: string; provider?: Provider | null }>('account_info', { p_secret: kept }).catch(() => null);
  return info?.name ? { ...base, me: { secret: kept, name: info.name, provider: info.provider ?? undefined } } : base;
}
// Diske (AsyncStorage) yazılan kopya: sır çıkarılır.
const toDisk = (s: Saved): Saved => (SECURE && s.me ? { ...s, me: { ...s.me, secret: '' } } : s);

// Eski kayıtları bir kereliğine ortak numaralara çevirir. Takip edilen ligler de temizlenir: eski sürümde ilk açılışta
// takımların ligleri kendiliğinden eklenirdi ve ana ekran onları kullanmazdı; artık takip edilen lig tüm maçlarıyla
// görünür, bu yüzden eski kayıtlar ana ekranı doldurmasın.
function migrate(raw: Saved): Saved {
  let s: Saved = { ...EMPTY, ...raw };
  if (s.ids !== 2) {
    const convert = s.provider === 'apifootball' ? (id: number) => id : legacyToCommon;
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
  // Ana takım bildirimlerini açar (iOS izni istenir; verilmezse false döner) ya da kapatır.
  setNotify: (on: boolean) => Promise<boolean>;
  remind: boolean;
  setRemind: (on: boolean) => Promise<boolean>;
  // Takip edilen takımların maçları kilit ekranında kendiliğinden açılsın mı (varsayılan: evet).
  liveFor: (teamId: number) => boolean;
  setLiveOn: (on: boolean) => void;
  linkHintOff: boolean;
  dismissLinkHint: () => void;
  ask?: { token: string; match: number };
  setAsk: (ask: { token: string; match: number } | undefined) => void;
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
  // Apple/Google ile giriş: profili hesaba bağlar ya da başka telefondaki profili geri yükler.
  // 'new': bu hesapla hiç profil yok; takma ad sorulup `setName` çağrılınca hesaba bağlanır.
  // token verilirse (e-posta kodu doğrulandıysa) giriş penceresi açılmaz.
  linkAccount: (provider: Provider, token?: string) => Promise<'linked' | 'restored' | 'new'>;
  setProvider: (provider: Provider | undefined) => void;
  // Web'de (tribunapp.io/t/…) yapılmış tahmini ve grubu bu cihaza alır (geçiş kodu). Başarılıysa davet edenin adı.
  claimWeb: (code: string) => Promise<string | null>;
  // Hesabı ve sunucudaki tüm verileri siler (geri alınamaz); takip tercihleri telefonda kalır.
  deleteAccount: () => Promise<void>;
  // Çıkış: yalnızca hesaba bağlı profilde. Bu telefonun anahtarı silinir; aynı ya da başka hesapla yeniden girilebilir.
  signOut: () => Promise<void>;
  reloadMeta: () => void;
};
// Girişten sonra takma ad beklenirken: aynı cihaz sırrı ve oturum anahtarı (yalnızca bellekte).
let pending: { secret: string; provider: Provider; token: string } | null = null;
const Ctx = createContext<Store | null>(null);
export const useStore = () => useContext(Ctx)!;

export function StoreProvider({ children, fallback }: { children: React.ReactNode; fallback: (error: ApiError | null, retry: () => void) => React.ReactNode }) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [startTab, setStartTab] = useState<'Groups' | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return setSaved(await restoreFromKeychain({ ...EMPTY, ids: 2 }));
      const stored: Saved = JSON.parse(raw);
      let next = migrate(stored);
      if (next.me) {
        if (next.me.secret) await writeSecret(next.me.secret); // eski sürümden: sır Keychain'e taşınır
        const secret = next.me.secret || (await readSecret());
        // Sır bulunamazsa (ör. Keychain silinmiş) takma ad yeniden sorulur.
        next = secret ? { ...next, me: { ...next.me, secret } } : { ...next, me: undefined };
      }
      if (!next.me) next = await restoreFromKeychain(next);
      const disk = JSON.stringify(toDisk(next));
      if (disk !== JSON.stringify(stored)) AsyncStorage.setItem(STORAGE_KEY, disk).catch(() => {});
      setSaved(next);
    })().catch(() => setSaved({ ...EMPTY, ids: 2 }));
  }, []);
  const reloadMeta = useCallback(() => {
    setError(null);
    get<Meta>('/api/meta').then(setMeta, setError);
  }, []);
  useEffect(reloadMeta, [reloadMeta]);

  const update = useCallback((fn: (s: Saved) => Saved) => {
    setSaved((prev) => {
      const next = fn(prev || EMPTY);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toDisk(next))).catch(() => {});
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
      setNotify: async (on) => {
        if (on && !(await fbPushPermission())) { update((s) => ({ ...s, notify: false })); return false; }
        update((s) => ({ ...s, notify: on }));
        return true;
      },
      remind: !!(saved.remind ?? saved.notify),
      setRemind: async (on) => {
        if (on && !(await fbPushPermission())) { update((s) => ({ ...s, remind: false })); return false; }
        update((s) => ({ ...s, remind: on }));
        return true;
      },
      liveFor: () => saved.liveOn !== false,
      setLiveOn: (on) => update((s) => ({ ...s, liveOn: on })),
      linkHintOff: !!saved.linkHintOff,
      dismissLinkHint: () => update((s) => ({ ...s, linkHintOff: true })),
      ask: saved.ask,
      setAsk: (ask) => update((s) => ({ ...s, ask })),
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
        await writeSecret(secret);
        let provider = saved.me?.provider;
        // Girişten sonra takma ad soruldaysa: yeni profil şimdi hesaba bağlanır.
        if (pending && pending.secret === secret) {
          await rpc('link_account', { p_secret: secret, p_provider: pending.provider }, pending.token).then(() => { provider = pending!.provider; }, () => {});
          pending = null;
        }
        update((s) => ({ ...s, me: { secret, name: profile.name, provider } }));
      },
      linkAccount: async (provider, given) => {
        const token = given ?? (await signIn(provider));
        const secret = saved.me?.secret ?? Crypto.randomUUID() + Crypto.randomUUID();
        const r = await rpc<{ status: 'linked' | 'restored' | 'new'; name?: string }>('link_account', { p_secret: secret, p_provider: provider }, token);
        if (r.status === 'new') { pending = { secret, provider, token }; return 'new'; }
        await writeSecret(secret);
        update((s) => ({ ...s, me: { secret, name: r.name ?? s.me?.name ?? '', provider } }));
        return r.status;
      },
      claimWeb: async (code) => {
        const secret = Crypto.randomUUID() + Crypto.randomUUID();
        const r = await rpc<{ name?: string; inviter?: string; error?: string }>('claim_web', { p_code: code, p_secret: secret });
        if (r.error || !r.name) return null;
        await writeSecret(secret);
        update((s) => ({ ...s, me: { secret, name: r.name! } }));
        return r.inviter ?? '';
      },
      setProvider: (provider) => update((s) => (s.me ? { ...s, me: { ...s.me, provider } } : s)),
      deleteAccount: async () => {
        if (!saved.me) return;
        await rpc('delete_account', { p_secret: saved.me.secret });
        await deleteSecret();
        update((s) => ({ ...s, me: undefined }));
      },
      signOut: async () => {
        if (!saved.me) return;
        const token = await fbToken().catch(() => null);
        await rpc('sign_out', { p_secret: saved.me.secret, p_token: token });
        await deleteSecret();
        update((s) => ({ ...s, me: undefined }));
      },
      reloadMeta,
    };
  }, [saved, meta, startTab, update, reloadMeta]);

  // Bildirim konularını (ana takım) istenen duruma eşitle: ana takım değişince ya da bildirim açılıp kapanınca.
  const wanted = saved ? pushTopics(saved).join(',') : '';
  const current = saved?.topics?.join(',') ?? '';
  useEffect(() => {
    if (!saved || wanted === current) return;
    const next = wanted ? wanted.split(',') : [];
    fbSubscribe(next, saved.topics ?? []).then((ok) => { if (ok) update((s) => ({ ...s, topics: next })); });
  }, [wanted, current]);

  // Kişiye özel bildirimler (tahmin istekleri) için bu cihazın anahtarı profile kaydedilir (oturum başına bir kez).
  const mySecret = saved?.me?.secret;
  useEffect(() => {
    if (!mySecret) return;
    fbToken().then((token) => { if (token) rpc('register_push', { p_secret: mySecret, p_token: token }).catch(() => {}); });
  }, [mySecret]);

  // Taraftar sıralaması için ana takım veritabanına bildirilir (değiştikçe).
  const myMain = saved?.main;
  useEffect(() => {
    if (!mySecret || !myMain) return;
    rpc('set_main_team', { p_secret: mySecret, p_team: myMain }).catch(() => {});
  }, [mySecret, myMain]);

  if (!store) return <>{fallback(error, reloadMeta)}</>;
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
