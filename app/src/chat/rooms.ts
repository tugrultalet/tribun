// Maç odası kuralları (saf; testli). Sunucu yazmayı kendi saatiyle denetler; bu yalnızca listelemek içindir.
// Oda maçtan 1 saat önce açılır, maç bitince 1 saat daha açık kalır (bitiş bilinmiyorsa başlamadan 3 saat sonra kapanır).
export type RoomState = 'soon' | 'open' | 'closed';
const H = 3600000;
export function roomState(f: { st: string; ts: number }, now = Date.now()): RoomState {
  const k = f.ts * 1000;
  if (f.st === 'off') return 'closed';
  if (now < k - H) return 'soon';
  if (f.st === 'live') return 'open';
  return now < k + 3 * H ? 'open' : 'closed';
}
// Grup ekranında gösterilecek açık odalar ve 24 saat içinde açılacaklar (en yakın önce).
export function roomsToShow<T extends { st: string; ts: number }>(fixtures: T[], now = Date.now()): { open: T[]; soon: T[] } {
  const open = fixtures.filter((f) => roomState(f, now) === 'open').sort((a, b) => a.ts - b.ts);
  const soon = fixtures.filter((f) => roomState(f, now) === 'soon' && f.ts * 1000 - now < 25 * H).sort((a, b) => a.ts - b.ts).slice(0, 2);
  return { open, soon };
}
