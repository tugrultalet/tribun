// "5 kişiden 4'ü": sayının iyelik eki (Türkçe ses uyumu, sayının okunuşuna göre).
const ONES = ['', "'i", "'si", "'ü", "'ü", "'i", "'sı", "'si", "'i", "'u"];
const TENS = ['', "'u", "'si", "'u", "'ı", "'si", "'ı", "'i", "'i", "'ı"];
export function possessive(n: number): string {
  if (n % 100 === 0 && n > 0) return `${n}${n % 1000 === 0 ? "'i" : "'ü"}`;
  if (n % 10) return `${n}${ONES[n % 10]}`;
  return `${n}${TENS[Math.floor(n / 10) % 10]}`;
}
