// "Arkadaşına sor": bağlantı ve paylaşım metni (saf; testli).
export const ASK_BASE = 'https://tribunapp.io/t/';
export const askLink = (token: string) => `${ASK_BASE}${token}`;
// Mesaj: tek cümle ve bağlantı. Bağlantı gerekli: WhatsApp maç kartı önizlemesini ondan kurar, dokununca uygulama
// (yoksa web sayfası) açılır.
export function askMessage(o: { home: string; away: string; pick?: { h: number; a: number } | null; token: string }): string {
  const line = o.pick
    ? `${o.home} - ${o.away} maçı ${o.pick.h}-${o.pick.a} biter dedim. Senin skor tahminin ne?`
    : `${o.home} - ${o.away} maçı için tahminimi yaptım. Senin skor tahminin ne?`;
  return `${line}\n${askLink(o.token)}`;
}
// Web'den gelen geçiş kodu: panodaki "TRIBUN-ABCD2345".
export function claimCodeFrom(text: string | null | undefined): string | null {
  const m = /TRIBUN-([A-HJ-NP-Z2-9]{8})/.exec(String(text ?? '').toUpperCase());
  return m ? m[1] : null;
}
