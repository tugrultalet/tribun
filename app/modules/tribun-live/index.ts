// Maç Live Activity köprüsü (iOS 18+). Modül yoksa (web, Expo Go, eski derleme) her şey sessizce devre dışı kalır.
import { requireOptionalNativeModule } from 'expo';

type Native = {
  isSupported(): boolean;
  activeMatches(): number[];
  start(attributesJson: string, stateJson: string, channelId: string | null): Promise<string>;
  update(matchId: number, stateJson: string): Promise<void>;
  end(matchId: number): Promise<void>;
  saveLogos(logos: Record<string, string>): Promise<number>;
  activeMulti(): number[][];
  startMulti(attributesJson: string, stateJson: string): Promise<string>;
  updateMulti(stateJson: string): Promise<void>;
  endMulti(): Promise<void>;
  addListener?(event: 'onLiveToken', cb: (e: { token: string; matches: number[] }) => void): { remove(): void };
};

const native = requireOptionalNativeModule<Native>('TribunLive');

export type LiveAttributes = {
  matchId: number; homeId: number; awayId: number; homeName: string; awayName: string; homeAbbr: string; awayAbbr: string;
  homeColor: string; awayColor: string; league: string; pick?: string | null;
};
export type LiveState = { home: number; away: number; minute: string; status: 'ns' | 'live' | 'ht' | 'ft'; note?: string | null; clock?: number | null };

// Her fonksiyon ayrı denetlenir: telefondaki derleme daha eskiyse (ör. saveLogos yok) uygulama çökmez, o özellik atlanır.
const has = <K extends keyof Native>(k: K): boolean => typeof native?.[k] === 'function';

export const liveSupported = (): boolean => { try { return has('isSupported') && !!native!.isSupported(); } catch { return false; } };
export const liveMatches = (): number[] => { try { return has('activeMatches') ? native!.activeMatches() : []; } catch { return []; } };
export async function startLive(a: LiveAttributes, s: LiveState, channel: string | null): Promise<boolean> {
  if (!has('start')) return false;
  await native!.start(JSON.stringify(a), JSON.stringify(s), channel);
  return true;
}
export const updateLive = (matchId: number, s: LiveState): Promise<void> =>
  has('update') ? native!.update(matchId, JSON.stringify(s)).catch(() => {}) : Promise.resolve();
export const endLive = (matchId: number): Promise<void> => (has('end') ? native!.end(matchId).catch(() => {}) : Promise.resolve());
// Takım logolarını widget'ların okuyabileceği App Group klasörüne kaydeder ({ takımNo: adres }).
export const saveLogos = (logos: Record<string, string>): Promise<number> =>
  has('saveLogos') ? native!.saveLogos(logos).catch(() => 0) : Promise.resolve(0);

/* ---------- Çoklu maç kartı (aynı anda birden fazla maç) ---------- */
export type MultiTeam = { id: number; abbr: string; color: string };
export type MultiAttributes = { matches: { id: number; home: MultiTeam; away: MultiTeam }[] };
export type MultiSlot = LiveState & { id: number };
export const multiActive = (): number[][] => { try { return has('activeMulti') ? native!.activeMulti() : []; } catch { return []; } };
export async function startMulti(a: MultiAttributes, slots: MultiSlot[]): Promise<boolean> {
  if (!has('startMulti')) return false;
  await native!.startMulti(JSON.stringify(a), JSON.stringify({ slots }));
  return true;
}
export const updateMulti = (slots: MultiSlot[]): Promise<void> =>
  has('updateMulti') ? native!.updateMulti(JSON.stringify({ slots })).catch(() => {}) : Promise.resolve();
export const endMulti = (): Promise<void> => (has('endMulti') ? native!.endMulti().catch(() => {}) : Promise.resolve());
// Kartın güncelleme anahtarı geldiğinde (sunucuya kaydedilir).
export function onLiveToken(cb: (e: { token: string; matches: number[] }) => void): () => void {
  try { const sub = native?.addListener?.('onLiveToken', cb); return () => sub?.remove(); } catch { return () => {}; }
}
