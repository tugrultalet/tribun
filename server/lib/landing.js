// Ana sayfa (tribunapp.io/): server/public/index.html dosyası açılışta bir kez okunur.
// APP_STORE_URL tanımlıysa "App Store'dan indir" düğmeleri o adrese gider; değilse sayfa içinde kalır.
import fs from 'node:fs';
import zlib from 'node:zlib';

const FILE = new URL('../public/index.html', import.meta.url);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Sayfa Google Fonts dışında dış kaynak yüklemez; stil ve betik satır içidir.
export const LANDING_CSP = "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export function landingPage({ storeUrl, source = fs.readFileSync(FILE, 'utf8') } = {}) {
  const html = storeUrl && /^https:\/\//.test(storeUrl)
    ? source.replaceAll('class="btn pri appstore" href="#"', `class="btn pri appstore" href="${esc(storeUrl)}"`)
    : source;
  return { html, gzip: zlib.gzipSync(html) };
}
