// Eski kayıtlar Highlightly numaralarıyla tutulmuştu: hl = af * 851 + 784. Sunucu artık her zaman API-Football
// numaralarını ("ortak numara") verir; bu işlev eski numarayı ortak numaraya çevirir (sunucudaki lib/ids.js ile aynıdır).
export function toCommon(hl: number): number {
  const x = (hl - 784) / 851;
  return Number.isInteger(x) && x > 0 ? x : -hl;
}

// Eski kaydı taşırken kullanılır: yalnızca formüle uyan (gerçekten Highlightly'den gelmiş) numarayı çevirir, diğerini
// olduğu gibi bırakır. Zaten ortak olan numarayı (ör. 645) toCommon'a vermek onu -645 yapıyordu; gruplardaki ve takip
// listesindeki "eksi numaralı kopya" sorununun kaynağı buydu.
export function legacyToCommon(id: number): number {
  const x = (id - 784) / 851;
  return Number.isInteger(x) && x > 0 ? x : id;
}
