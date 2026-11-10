const SOON = 48 * 3600000;

// Saf mantık (testli): önümüzdeki 48 saatte başlayacak, henüz tahmin girilmemiş maç sayısı.
export function pendingCount(fixtures: { id: number; st: string; ts: number }[], picked: Set<number>, now = Date.now()): number {
  return fixtures.filter((f) => f.st === 'ns' && f.ts * 1000 > now && f.ts * 1000 - now < SOON && !picked.has(f.id)).length;
}
