// Davet bağlantısının karşılama sayfası: WhatsApp'tan gelen kişi uygulamayı açar ya da kodu kopyalar.
// Sayfa durumsuzdur; grup adı bağlantıdaki `n` parametresinden gelir (veritabanına gidilmez).
const CODE = /^[A-HJ-NP-Z2-9]{6}$/;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const validCode = (code) => CODE.test(String(code || '').toUpperCase());

export function invitePage({ code, name, storeUrl, image }) {
  const c = esc(String(code).toUpperCase());
  const group = name ? esc(String(name).slice(0, 40)) : '';
  const title = group ? `${group} · Gruba katıl` : 'Tribün grubuna davetlisin';
  const desc = 'TribünApp · Davet kodu ' + c;
  const store = storeUrl && /^https:\/\//.test(storeUrl)
    ? `<a class="btn sec" href="${esc(storeUrl)}">Uygulamayı indir</a>`
    : '<p class="note">Uygulama yakında App Store\'da. Şimdilik davet koduyla katılabilirsin.</p>';
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Tribün</title>
<meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta name="description" content="${desc}">
${image ? `<meta property="og:image" content="${esc(image)}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">` : ''}
<meta name="robots" content="noindex">
<style>
:root{color-scheme:dark}*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:-apple-system,system-ui,sans-serif;color:#fff;background:linear-gradient(#9b0a2e,#1a0008 70%,#050005)}
.card{width:100%;max-width:380px;text-align:center;padding:28px 22px;border-radius:28px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(24px)}
h1{margin:0 0 6px;font-size:24px;letter-spacing:-.3px}p{margin:0;color:rgba(255,255,255,.7);line-height:1.45}
.code{margin:22px 0 6px;font-size:36px;font-weight:700;letter-spacing:8px;font-variant-numeric:tabular-nums}
.btn{display:block;margin-top:12px;padding:14px;border-radius:16px;background:#a6b4ff;color:#0b1030;font-weight:700;text-decoration:none;border:0;width:100%;font-size:16px;font-family:inherit}
.btn.sec{background:rgba(255,255,255,.14);color:#fff}.note{margin-top:14px;font-size:13px}
</style></head><body><main class="card">
<h1>${title}</h1><p>Tribün'de maçları arkadaşlarınla takip et, skor tahmini yap.</p>
<div class="code" id="code">${c}</div><p>Davet kodu</p>
<a class="btn" href="tribun://join/${c}">Uygulamada aç</a>
<button class="btn sec" id="copy" type="button">Kodu kopyala</button>
${store}
</main>
<script>document.getElementById('copy').onclick=function(){var b=this;(navigator.clipboard?navigator.clipboard.writeText('${c}'):Promise.reject()).then(function(){b.textContent='Kopyalandı'},function(){b.textContent='Kodu elle kopyala: ${c}'})}</script>
</body></html>`;
}
