// Kilit ekranı / Dynamic Island canlı skor (Live Activity, iOS 18+) ve ana ekran widget'ı verisi.
import { Platform } from 'react-native';
import { endLive, liveMatches, liveSupported, startLive } from '../modules/tribun-live';
import { Fixture, get } from './api';
import { abbr } from './chat/timeline';
import { gradientFor } from './teamColors';

export { liveSupported, liveMatches };

export { canFollow, liveStateOf } from './liveState';
import { liveStateOf } from './liveState';

const color = (name: string) => gradientFor(name)[0] ?? '#9DB1FF';

export async function followOnLockScreen(f: Fixture, league: string, pick?: { h: number; a: number } | null): Promise<void> {
  const { channel } = await get<{ channel: string; env: string }>(`/api/live/${f.id}/channel`);
  await startLive({
    matchId: f.id, homeName: f.h.name, awayName: f.a.name, homeAbbr: abbr(f.h.name), awayAbbr: abbr(f.a.name),
    homeColor: color(f.h.name), awayColor: color(f.a.name), league, pick: pick ? `${pick.h}–${pick.a}` : null,
  }, liveStateOf(f), channel);
}
export const stopFollowing = (id: number) => endLive(id);

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
      id: f.id, home: f.h.name, away: f.a.name, homeAbbr: abbr(f.h.name), awayAbbr: abbr(f.a.name),
      homeColor: color(f.h.name), awayColor: color(f.a.name), ts: f.ts, status: f.st,
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
  try {
    if (!storage || !Ext) return;
    storage.set('widget', JSON.stringify({ ...snap, updated: Date.now() / 1000 }));
    Ext.reloadWidget();
  } catch { /* widget yoksa (web, Expo Go) */ }
}
