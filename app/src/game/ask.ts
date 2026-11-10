// "Arkadaşına sor": bağlantı ve paylaşım metni (saf; testli).
export const ASK_BASE = 'https://tribunapp.io/t/';
export const askLink = (token: string) => `${ASK_BASE}${token}`;
// Mesaj yalnızca bağlantı: WhatsApp ondan maç kartı önizlemesini kurar; başlığı ("… maçı 1-1 biter dedim. Senin skor
// tahminin ne?") sunucu yazar. Dokununca uygulama (yoksa web sayfası) açılır.
export function askMessage(o: { home: string; away: string; pick?: { h: number; a: number } | null; token: string }): string {
  return askLink(o.token);
}
// Web'den gelen geçiş kodu: panodaki "TRIBUN-ABCD2345".
export function claimCodeFrom(text: string | null | undefined): string | null {
  const m = /TRIBUN-([A-HJ-NP-Z2-9]{8})/.exec(String(text ?? '').toUpperCase());
  return m ? m[1] : null;
}
