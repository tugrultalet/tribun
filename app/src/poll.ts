// Maç ekranı yalnızca gerektiği kadar yenilenir: canlıyken 15 sn, başlamasına 1 saatten az kala 1 dk,
// daha uzaksa 5 dk, bittiyse/oynanmadıysa hiç.
export function pollMs(f: { st: string; ts: number }, now = Date.now()): number | undefined {
  if (f.st === 'live') return 15000;
  if (f.st !== 'ns') return undefined;
  return f.ts * 1000 - now < 3600000 ? 60000 : 300000;
}
