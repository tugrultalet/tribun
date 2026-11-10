// Firebase erişimi (iOS/Android): Analytics, Crashlytics, Remote Config ve Messaging tek yerden.
// Expo Go'da Firebase'in yerel modülü yoktur; o zaman her çağrı sessizce hiçbir şey yapmaz (uygulama çökmez).
/* eslint-disable @typescript-eslint/no-require-imports */
type Mods = {
  analytics: typeof import('@react-native-firebase/analytics');
  crashlytics: typeof import('@react-native-firebase/crashlytics');
  remoteConfig: typeof import('@react-native-firebase/remote-config');
  messaging: typeof import('@react-native-firebase/messaging');
};
let mods: Mods | null | undefined;
function load(): Mods | null {
  if (mods !== undefined) return mods;
  try {
    require('@react-native-firebase/app').getApp();
    mods = {
      analytics: require('@react-native-firebase/analytics'),
      crashlytics: require('@react-native-firebase/crashlytics'),
      remoteConfig: require('@react-native-firebase/remote-config'),
      messaging: require('@react-native-firebase/messaging'),
    };
  } catch {
    mods = null;
  }
  return mods;
}
const safe = (fn: () => unknown) => { try { const r = fn(); if (r && typeof (r as Promise<unknown>).catch === 'function') (r as Promise<unknown>).catch(() => {}); } catch { /* yok say */ } };

export const firebaseAvailable = (): boolean => load() !== null;

// Analytics olay adları en çok 40 karakter, parametre değerleri metin/sayı olmalı.
export function fbEvent(name: string, params?: Record<string, unknown>): void {
  const m = load(); if (!m) return;
  const clean: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (typeof v === 'number') clean[k] = v; else if (typeof v === 'boolean') clean[k] = v ? 1 : 0; else if (v != null) clean[k] = String(v).slice(0, 100);
  }
  safe(() => m.analytics.logEvent(m.analytics.getAnalytics(), name.slice(0, 40), clean));
}
export function fbScreen(name: string): void {
  const m = load(); if (!m) return;
  safe(() => m.analytics.logScreenView(m.analytics.getAnalytics(), { screen_name: name, screen_class: name }));
}
export function fbError(error: unknown, context?: string): void {
  const m = load(); if (!m) return;
  const err = error instanceof Error ? error : new Error(String(error));
  safe(() => { const c = m.crashlytics.getCrashlytics(); if (context) m.crashlytics.log(c, context.slice(0, 1000)); m.crashlytics.recordError(c, err); });
}

// Remote Config: varsayılanlarla başlar, saatte en çok bir kez sunucudan yeniler. Değerler metin olarak döner.
export async function fbRemoteValues(defaults: Record<string, string>): Promise<Record<string, string> | null> {
  const m = load(); if (!m) return null;
  try {
    const rc = m.remoteConfig.getRemoteConfig();
    rc.defaultConfig = defaults;
    rc.settings = { ...rc.settings, minimumFetchIntervalMillis: __DEV__ ? 60000 : 3600000 };
    await m.remoteConfig.fetchAndActivate(rc);
    const out: Record<string, string> = {};
    for (const k of Object.keys(defaults)) out[k] = m.remoteConfig.getString(rc, k);
    return out;
  } catch {
    return null;
  }
}

// Bildirim izni (iOS sistem penceresi). İzin verilirse true.
export async function fbPushPermission(): Promise<boolean> {
  const m = load(); if (!m) return false;
  try {
    const msg = m.messaging.getMessaging();
    const status = await m.messaging.requestPermission(msg);
    return status === m.messaging.AuthorizationStatus.AUTHORIZED || status === m.messaging.AuthorizationStatus.PROVISIONAL;
  } catch {
    return false;
  }
}
// Konu aboneliklerini istenen listeye eşitler (ör. ana takım: team_645). Sunucu gol/maç bildirimini konuya gönderir.
export async function fbSubscribe(topics: string[], previous: string[]): Promise<boolean> {
  const m = load(); if (!m) return false;
  try {
    const msg = m.messaging.getMessaging();
    for (const t of previous.filter((x) => !topics.includes(x))) await m.messaging.unsubscribeFromTopic(msg, t);
    for (const t of topics.filter((x) => !previous.includes(x))) await m.messaging.subscribeToTopic(msg, t);
    return true;
  } catch {
    return false;
  }
}
// Bildirime dokunulunca (uygulama arka plandayken ya da kapalıyken açıldıysa) verisiyle çağrılır.
export function fbOnNotificationOpen(handler: (data: Record<string, string>) => void): () => void {
  const m = load(); if (!m) return () => {};
  try {
    const msg = m.messaging.getMessaging();
    m.messaging.getInitialNotification(msg).then((n) => { if (n?.data) handler(n.data as Record<string, string>); }).catch(() => {});
    return m.messaging.onNotificationOpenedApp(msg, (n) => { if (n?.data) handler(n.data as Record<string, string>); });
  } catch {
    return () => {};
  }
}
