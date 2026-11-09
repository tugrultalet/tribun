// Highlightly'nin numaraları API-Football'unkilerin düz bir dönüşümüdür: hl = af * 851 + 784.
// Lig, takım ve maç numaralarında 1.000'den fazla kayıtta (hepsinde) doğrulandı; Highlightly'deki 100 maçın hepsinin
// API-Football karşılığı aynı günün kayıtlı verisinde bulundu.
//
// Uygulama, veritabanı ve sunucu dışarıya her zaman API-Football numaralarını ("ortak numara") verir. Böylece
// veri kaynağı değişince takipteki takımlar, gruplar ve tahminler bozulmaz.
const A = 851, B = 784;

// Highlightly numarasından ortak numara. Formüle uymayan bir numara çıkarsa, ortak numaralarla çakışmasın diye
// negatifi kullanılır (fromCommon bunu geri çevirir).
export function toCommon(hl) {
  const x = (Number(hl) - B) / A;
  return Number.isInteger(x) && x > 0 ? x : -Number(hl);
}
export function fromCommon(id) {
  const n = Number(id);
  return n < 0 ? -n : n * A + B;
}
