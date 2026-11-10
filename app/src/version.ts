// Sürüm karşılaştırma (saf, testli): "1.2.10" > "1.2.9". Eksik kısımlar 0 sayılır, sayı olmayanlar yok sayılır.
export function versionLess(a: string, b: string): boolean {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0), pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
// Bildirim konuları (saf, testli): bildirimler açıksa ana takımın konusu (ör. team_645, negatif numara: team_-5).
export const pushTopics = (s: { notify?: boolean; main?: number }): string[] => (s.notify && s.main != null ? [`team_${s.main}`] : []);
