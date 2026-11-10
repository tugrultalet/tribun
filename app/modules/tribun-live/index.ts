// Maç Live Activity köprüsü (iOS 18+). Modül yoksa (web, Expo Go, eski derleme) her şey sessizce devre dışı kalır.
import { requireOptionalNativeModule } from 'expo';

type Native = {
  isSupported(): boolean;
  activeMatches(): number[];
  start(attributesJson: string, stateJson: string, channelId: string | null): Promise<string>;
  update(matchId: number, stateJson: string): Promise<void>;
  end(matchId: number): Promise<void>;
  saveLogos(logos: Record<string, string>): Promise<number>;
};

const native = requireOptionalNativeModule<Native>('TribunLive');

export type LiveAttributes = {
  matchId: number; homeId: number; awayId: number; homeName: string; awayName: string; homeAbbr: string; awayAbbr: string;
  homeColor: string; awayColor: string; league: string; pick?: string | null;
};
export type LiveState = { home: number; away: number; minute: string; status: 'ns' | 'live' | 'ht' | 'ft'; note?: string | null; clock?: number | null };

export const liveSupported = (): boolean => { try { return !!native?.isSupported(); } catch { return false; } };
export const liveMatches = (): number[] => { try { return native?.activeMatches() ?? []; } catch { return []; } };
export async function startLive(a: LiveAttributes, s: LiveState, channel: string | null): Promise<boolean> {
  if (!native) return false;
  await native.start(JSON.stringify(a), JSON.stringify(s), channel);
  return true;
}
export const updateLive = (matchId: number, s: LiveState) => native?.update(matchId, JSON.stringify(s)) ?? Promise.resolve();
export const endLive = (matchId: number) => native?.end(matchId) ?? Promise.resolve();
// Takım logolarını widget'ların okuyabileceği App Group klasörüne kaydeder ({ takımNo: adres }).
export const saveLogos = (logos: Record<string, string>): Promise<number> => native?.saveLogos(logos).catch(() => 0) ?? Promise.resolve(0);
