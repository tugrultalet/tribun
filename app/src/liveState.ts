// Live Activity durumunun saf kuralları (testli).
import type { Fixture } from './api';
export type LiveState = { home: number; away: number; minute: string; status: 'ns' | 'live' | 'ht' | 'ft' };

// Sunucudaki lib/live.js ile aynı kural (ilk durum uygulamadan, sonrakiler sunucudan gelir).
export function liveStateOf(f: Pick<Fixture, 'st' | 's' | 'min' | 'extra' | 'short' | 'time'>): LiveState {
  const s = f.s ?? [0, 0];
  const status = f.st === 'live' ? (f.short === 'HT' ? 'ht' : 'live') : f.st === 'ft' ? 'ft' : 'ns';
  const minute = status === 'ht' ? 'DA' : status === 'ft' ? 'MS' : status === 'live' ? `${f.min ?? ''}${f.extra ? `+${f.extra}` : ''}'` : (f.time || '');
  return { home: s[0], away: s[1], minute, status };
}

// Canlı takip yalnızca canlı ya da 6 saat içinde başlayacak maç için açılır (sunucu da aynı kuralı uygular).
export const canFollow = (f: Pick<Fixture, 'st' | 'ts'>, now = Date.now()) =>
  f.st === 'live' || (f.st === 'ns' && f.ts * 1000 - now < 6 * 3600000 && f.ts * 1000 > now - 3 * 3600000);

