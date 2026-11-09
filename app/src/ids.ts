// Eski kayıtlar Highlightly numaralarıyla tutulmuştu: hl = af * 851 + 784. Sunucu artık her zaman API-Football
// numaralarını ("ortak numara") verir; bu işlev eski numarayı ortak numaraya çevirir (sunucudaki lib/ids.js ile aynıdır).
export function toCommon(hl: number): number {
  const x = (hl - 784) / 851;
  return Number.isInteger(x) && x > 0 ? x : -hl;
}
