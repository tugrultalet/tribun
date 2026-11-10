// Live Activity durumunun saf kuralları (testli).
import type { Fixture } from './api';
export type LiveState = { home: number; away: number; minute: string; status: 'ns' | 'live' | 'ht' | 'ft'; clock: number | null };

// Sunucudaki lib/live.js ile aynı kural (ilk durum uygulamadan, sonrakiler sunucudan gelir).
export function liveStateOf(f: Pick<Fixture, 'st' | 's' | 'min' | 'extra' | 'short' | 'time'>, now = Date.now()): LiveState {
  const s = f.s ?? [0, 0];
  const status = f.st === 'live' ? (f.short === 'HT' ? 'ht' : 'live') : f.st === 'ft' ? 'ft' : 'ns';
  const minute = status === 'ht' ? 'Devre arası' : status === 'ft' ? 'Maç sonu' : status === 'live' ? `${f.min ?? ''}${f.extra ? `+${f.extra}` : ''}'` : (f.time || '');
  // clock: maçın 0. dakikası sayılan an (unix sn); süre çubuğu buna göre kendiliğinden ilerler.
  const clock = status === 'live' && f.min != null ? Math.floor(now / 1000) - f.min * 60 : null;
  return { home: s[0], away: s[1], minute, status, clock };
}

// Canlı takip yalnızca canlı ya da 6 saat içinde başlayacak maç için açılır (sunucu da aynı kuralı uygular).
export const canFollow = (f: Pick<Fixture, 'st' | 'ts'>, now = Date.now()) =>
  f.st === 'live' || (f.st === 'ns' && f.ts * 1000 - now < 6 * 3600000 && f.ts * 1000 > now - 3 * 3600000);

