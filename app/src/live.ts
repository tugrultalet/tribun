// Kilit ekranı / Dynamic Island canlı skor (Live Activity, iOS 18+) ve ana ekran widget'ı verisi.
import { Platform } from 'react-native';
import { endLive, liveMatches, liveStartToken, liveSupported, onStartToken, saveLogos, startLive, updateLive } from '../modules/tribun-live';
import { Fixture, get } from './api';
import { abbr } from './chat/timeline';
import { rpc } from './social';
import { gradientFor } from './teamColors';

export { liveSupported, liveMatches };

export { canFollow, liveStateOf } from './liveState';
import { liveStateOf } from './liveState';

const color = (name: string) => gradientFor(name)[0] ?? '#9DB1FF';
const logosOf = (f: Fixture): Record<string, string> => Object.fromEntries([f.h, f.a].filter((t) => t.logo).map((t) => [String(t.id), t.logo]));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Başlatır ve 2 sn sonra etkinliğin gerçekten açık kaldığını doğrular. iPhone kanala bağlı etkinliği hemen kapatırsa
// kanalsız (yerel) dener; sonuç teşhis için döner: 'channel' | 'local' | 'closed'.
export async function followOnLockScreen(f: Fixture, league: string, pick?: { h: number; a: number } | null): Promise<'channel' | 'local' | 'nochannel' | 'closed'> {
  // Sunucu kanal açamazsa (ör. Apple tarafında yayın kapalı) hata göstermek yerine kanalsız açılır: skor uygulama açıkken güncellenir.
  const channel = await get<{ channel: string; env: string }>(`/api/live/${f.id}/channel`).then((r) => r.channel, () => null);
  // Logolar önce kaydedilir: kilit ekranı ve Dynamic Island ağdan resim yükleyemez.
  await saveLogos(logosOf(f));
  const attrs = attrsOf(f, league, pick);
  dropAutoStart(f.id); // elle açıldı: sunucu 1 saat kala ikinci bir kart açmasın
  if (!channel) {
    await startLive(attrs, liveStateOf(f), null);
    await wait(2000);
    return liveMatches().includes(f.id) ? 'nochannel' : 'closed';
  }
  await startLive(attrs, liveStateOf(f), channel);
  await wait(2000);
  if (liveMatches().includes(f.id)) return 'channel';
  await startLive(attrs, liveStateOf(f), null);
  await wait(2000);
  return liveMatches().includes(f.id) ? 'local' : 'closed';
}
export const stopFollowing = (id: number) => endLive(id);

// Live Activity'nin sabit bilgileri (uygulamadaki MatchActivityAttributes ile aynı alanlar).
export function attrsOf(f: Fixture, league: string, pick?: { h: number; a: number } | null) {
  return {
    matchId: f.id, homeId: f.h.id, awayId: f.a.id, homeName: f.h.name, awayName: f.a.name, homeAbbr: abbr(f.h.name), awayAbbr: abbr(f.a.name),
    homeColor: color(f.h.name), awayColor: color(f.a.name), league, pick: pick ? `${pick.h}–${pick.a}` : null,
  };
}

/* ---------- Kapalı uygulamada otomatik açılma (push-to-start) ---------- */
// Takip edilen takımların önümüzdeki maçları ve telefonun başlatma anahtarı sunucuya kaydedilir; sunucu maçı 1 saat kala
// kilit ekranında açar (uygulama kapalı olsa da). Logolar önceden kaydedilir (kilit ekranı ağdan resim yükleyemez).
export type AutoItem = { matchId: number; ts: number; attrs: ReturnType<typeof attrsOf> };
let lastSent = '';
let lastItems: AutoItem[] = [];
let lastToken: string | null = null;
async function sendAuto(token: string, items: AutoItem[]) {
  const key = token + JSON.stringify(items);
  if (key === lastSent) return;
  lastSent = key;
  await rpc('set_live_autostart', { p_token: token, p_items: items }).catch(() => { lastSent = ''; });
}
// Başlatma anahtarı yoksa (eski iOS/derleme) false döner; o zaman uygulama açıkken başlatma yolu kullanılır.
export function autoStartAvailable(): boolean { return !!(lastToken ?? liveStartToken()); }
export function syncAutoStart(fixtures: Fixture[], leagueName: (lg: number) => string): void {
  if (Platform.OS !== 'ios') return;
  const token = lastToken ?? liveStartToken();
  if (!token) return;
  lastToken = token;
  const now = Date.now();
  const active = liveMatches();
  const items = fixtures
    .filter((f) => f.st === 'ns' && f.ts * 1000 > now && f.ts * 1000 - now < 8 * 86400000 && !active.includes(f.id))
    .sort((a, b) => a.ts - b.ts).slice(0, 20)
    .map((f) => ({ matchId: f.id, ts: f.ts, attrs: attrsOf(f, leagueName(f.lg), null) }));
  lastItems = items;
  saveLogos(Object.assign({}, ...fixtures.filter((f) => items.some((i) => i.matchId === f.id)).map(logosOf))).catch(() => 0);
  sendAuto(token, items).catch(() => {});
}
function dropAutoStart(matchId: number) {
  if (!lastToken || !lastItems.some((i) => i.matchId === matchId)) return;
  lastItems = lastItems.filter((i) => i.matchId !== matchId);
  sendAuto(lastToken, lastItems).catch(() => {});
}
// Anahtar yenilenince (iOS zaman zaman değiştirir) son liste yeni anahtarla tekrar kaydedilir.
onStartToken((token) => {
  lastToken = token;
  if (lastItems.length) sendAuto(token, lastItems).catch(() => {});
});

// Kanalsız (yerel) açılmış etkinliği uygulama açıkken günceller; kanallı etkinliği sunucu zaten günceller, aynı içerik
// gönderilmesinin zararı yok. Maç bitince etkinlik kapanır.
const lastLocal = new Map<number, string>();
export function refreshLocal(f: Fixture): void {
  if (!liveMatches().includes(f.id)) return;
  const s = liveStateOf(f);
  const key = JSON.stringify(s);
  if (lastLocal.get(f.id) === key) return;
  lastLocal.set(f.id, key);
  updateLive(f.id, s).catch(() => {});
}

/* ---------- Ana ekran widget'ı ---------- */
// Widget deposu yalnızca iOS'ta yüklenir (modül web'de çalışmaz).
type Storage = { set(key: string, value: string): void };
const Ext: { new (group: string): Storage; reloadWidget(name?: string): void } | null =
  Platform.OS === 'ios' ? require('@bacons/apple-targets').ExtensionStorage : null;
const storage = Ext ? new Ext('group.com.sportvisor.tribun') : null;
export type WidgetRank = { group: string; rank: number; total: number; points: number };
export function widgetSnapshot(f: Fixture | undefined, league: string, rank: WidgetRank | undefined) {
  return {
    match: f ? {
      id: f.id, homeId: f.h.id, awayId: f.a.id, home: f.h.name, away: f.a.name, homeAbbr: abbr(f.h.name), awayAbbr: abbr(f.a.name),
      homeColor: color(f.h.name), awayColor: color(f.a.name), homeLogo: f.h.logo, awayLogo: f.a.logo, ts: f.ts, status: f.st,
      homeScore: f.s ? f.s[0] : null, awayScore: f.s ? f.s[1] : null, league,
    } : null,
    rank: rank ?? null,
  };
}
let lastWidget = '';
export function saveWidget(snap: ReturnType<typeof widgetSnapshot>): void {
  const text = JSON.stringify(snap);
  if (text === lastWidget) return;
  lastWidget = text;
  if (!storage || !Ext) return;
  const m = snap.match;
  // Logolar kaydedildikten sonra widget yenilenir (ilk kayıtta renkli rozet yerine logo görünsün).
  (m ? saveLogos({ [String(m.homeId)]: m.homeLogo, [String(m.awayId)]: m.awayLogo }) : Promise.resolve(0)).finally(() => {
    try {
      storage.set('widget', JSON.stringify({ ...snap, updated: Date.now() / 1000 }));
      Ext.reloadWidget();
    } catch { /* widget yoksa (web, Expo Go) */ }
  });
}
