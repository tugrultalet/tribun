// "Arkadaş ekle" bağlantısı: tribunapp.io/a/KOD. Uygulama kuruluysa Universal Link ile uygulamada açılır (davet edenle
// arkadaş olunur); açılmazsa bu sayfa "Uygulamada aç" ve uygulamayı indirme seçeneği sunar.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const validFriendCode = (c) => /^[A-HJ-NP-Z2-9]{8}$/i.test(String(c || ''));

export function friendPage({ code, name, storeUrl, image }) {
  const c = esc(String(code).toUpperCase());
  const who = name ? esc(String(name).slice(0, 30)) : '';
  const title = who ? `${who} seni Tribün'e davet ediyor` : 'Tribün daveti';
  const store = storeUrl && /^https:\/\//.test(storeUrl) ? `<a class="btn sec" href="${esc(storeUrl)}">Uygulamayı indir</a>` : '';
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Tribün</title>
<meta property="og:title" content="${title}"><meta property="og:description" content="TribünApp"><meta property="og:site_name" content="Tribün">
${image ? `<meta property="og:image" content="${esc(image)}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">` : ''}
<meta name="robots" content="noindex">
<style>
:root{color-scheme:dark}*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:-apple-system,system-ui,sans-serif;color:#fff;background:linear-gradient(#18237A,#0C1238 60%,#06081A)}
.card{width:100%;max-width:380px;text-align:center;padding:28px 22px;border-radius:28px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16)}
h1{margin:0 0 8px;font-size:23px}p{margin:0;color:rgba(255,255,255,.72);line-height:1.45}
.btn{display:block;margin-top:14px;padding:14px;border-radius:16px;background:#9DB1FF;color:#0b1030;font-weight:700;text-decoration:none;font-size:16px}
.btn.sec{background:rgba(255,255,255,.14);color:#fff}.note{margin-top:14px;font-size:13px}
</style></head><body><main class="card">
<h1>${title}</h1><p>Skor tahminlerinizi karşılaştırın, maçları birlikte takip edin.</p>
<a class="btn" href="tribun://a/${c}">Uygulamada aç</a>${store}
<p class="note">Uygulamayı indirdiysen bu bağlantıya tekrar dokun; arkadaş olursunuz.</p>
</main></body></html>`;
}
