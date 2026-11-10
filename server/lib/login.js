// E-postadaki giriş bağlantısı: tribunapp.io/giris?h=<token_hash>. Uygulama kuruluysa Universal Link ile doğrudan
// uygulamada açılır; açılmazsa bu sayfa "Uygulamada aç" (tribun://giris?h=…) düğmesi ve kodu yazma seçeneği sunar.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const validHash = (h) => /^[A-Za-z0-9_-]{16,128}$/.test(String(h || ''));

export function loginPage({ hash }) {
  const ok = validHash(hash);
  const h = ok ? esc(hash) : '';
  const body = ok
    ? `<h1>Tribün'e giriş</h1><p>Girişi tamamlamak için uygulamayı aç.</p>
<a class="btn" href="tribun://giris?h=${h}">Uygulamada aç</a>
<p class="note">E-postayı bilgisayarda açtıysan uygulamada <b>E-posta ile devam et</b> adımında e-postadaki 6 haneli kodu yaz.</p>`
    : `<h1>Bağlantı geçersiz</h1><p>E-postadaki 6 haneli kodu uygulamaya yazabilir ya da yeni kod isteyebilirsin.</p>`;
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Giriş · Tribün</title><meta name="robots" content="noindex">
<style>
:root{color-scheme:dark}*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:-apple-system,system-ui,sans-serif;color:#fff;background:linear-gradient(#18237A,#0C1238 60%,#06081A)}
.card{width:100%;max-width:380px;text-align:center;padding:28px 22px;border-radius:28px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16)}
h1{margin:0 0 8px;font-size:24px}p{margin:0;color:rgba(255,255,255,.72);line-height:1.45}
.btn{display:block;margin-top:18px;padding:14px;border-radius:16px;background:#9DB1FF;color:#0b1030;font-weight:700;text-decoration:none;font-size:16px}
.note{margin-top:16px;font-size:13px}
</style></head><body><main class="card">${body}</main></body></html>`;
}
