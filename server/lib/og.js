// Paylaşım önizleme görseli (WhatsApp vb. og:image), 1200×630. Takım rengi kullanılmaz: kime gönderilirse
// gönderilsin tarafsız.
// SVG olarak kurulur, resvg ile PNG'ye çevrilir; yazı tipi depoda (Inter, SIL Open Font License).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
// Inter: yazılar; Outfit: skor rakamları (yuvarlak, bayraksız "1"). İkisi de SIL Open Font License.
const FONTS = ['Inter-Bold.ttf', 'Inter-SemiBold.ttf', 'Outfit-Bold.ttf'].map((f) => path.join(dir, f));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Uzun adlar küçülür (ör. "Manchester United"); çok uzunsa kesilir.
const nameSize = (n) => (n.length <= 10 ? 46 : n.length <= 14 ? 40 : n.length <= 18 ? 33 : 28);
const clip = (n) => (n.length > 24 ? `${n.slice(0, 23)}…` : n);

// Live Activity kartı gibi: yumuşak lavanta-lacivert zemin üzerinde koyu, yuvarlak köşeli kart. Kartta üstte lig ve
// maç saati, ortada logolar/adlar ve büyük tahmin skoru, altta "<ad> bu skoru dedi · Sen ne diyorsun?" ve "Tahmin et".
export function matchSvg({ home, away, homeLogo, awayLogo, pick, sender, league, when }) {
  const LX = 250, RX = 950, LOGO = 150, LY = 300;
  const logo = (uri, cx) => (uri ? `<image href="${uri}" x="${cx - LOGO / 2}" y="${LY - LOGO / 2 - 20}" width="${LOGO}" height="${LOGO}" preserveAspectRatio="xMidYMid meet"/>` : `<circle cx="${cx}" cy="${LY - 20}" r="70" fill="#ffffff" fill-opacity="0.08"/>`);
  const name = (n, cx) => `<text x="${cx}" y="${LY + 100}" text-anchor="middle" font-family="Inter" font-weight="600" font-size="${Math.min(nameSize(n), 40)}" fill="#ffffff">${esc(clip(n))}</text>`;
  // Skor: rakamlar ayrı yerleştirilir (sol rakam sağa, sağ rakam sola yaslı), arada ince yuvarlak tire.
  const digit = (n, x, anchor) => `<text x="${x}" y="${LY + 32}" text-anchor="${anchor}" font-family="Outfit" font-weight="700" font-size="156" fill="#ffffff">${n}</text>`;
  const mid = pick
    ? `${digit(pick.h, 552, 'end')}<rect x="578" y="${LY - 25}" width="44" height="12" rx="6" fill="#A7ABC8"/>${digit(pick.a, 648, 'start')}`
    : `<text x="600" y="${LY + 25}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="110" fill="#A7ABC8">?</text>`;
  const ask = sender ? `${esc(sender)}${pick ? ' bu skoru dedi' : ' tahminini yaptı'}` : 'Skor tahmini';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#A9B6F5"/><stop offset="0.5" stop-color="#B9ACEB"/><stop offset="1" stop-color="#E5B9D9"/></linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1D2766"/><stop offset="1" stop-color="#0E1440"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="70" y="72" width="1060" height="500" rx="56" fill="#2A2466" fill-opacity="0.18"/>
  <rect x="70" y="56" width="1060" height="500" rx="56" fill="url(#card)"/>
  <rect x="70.5" y="56.5" width="1059" height="499" rx="56" fill="none" stroke="#ffffff" stroke-opacity="0.12"/>
  <text x="130" y="128" font-family="Inter" font-weight="600" font-size="28" fill="#A7ABC8">${esc(clip(league || 'Maç'))}</text>
  <text x="1070" y="128" text-anchor="end" font-family="Inter" font-weight="700" font-size="28" fill="#9DB1FF">${esc(when || '')}</text>
  ${logo(homeLogo, LX)}${logo(awayLogo, RX)}
  ${mid}
  ${name(home, LX)}${name(away, RX)}
  <rect x="130" y="448" width="940" height="2" fill="#ffffff" fill-opacity="0.1"/>
  <text x="130" y="505" font-family="Inter" font-weight="600" font-size="30" fill="#ffffff">${ask}<tspan fill="#A7ABC8">&#160;· Senin tahminin ne?</tspan></text>
  <rect x="860" y="468" width="210" height="54" rx="27" fill="#9DB1FF"/>
  <text x="965" y="504" text-anchor="middle" font-family="Inter" font-weight="700" font-size="26" fill="#0B1030">Tahmin et ›</text>
  <text x="600" y="602" text-anchor="middle" font-family="Inter" font-weight="700" font-size="24" fill="#2B2A6B" fill-opacity="0.6">Tribün</text>
</svg>`;
}

export function renderPng(svg) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Inter' } }).render().asPng();
}

// Logoyu indirip data URI yapar (önizleme görseli dış kaynak yüklemez). Hata olursa logo yerine boş daire çizilir.
export async function logoUri(url, fetchImpl = fetch) {
  if (!url) return null;
  try {
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const type = r.headers.get('content-type') || 'image/png';
    if (!/^image\/(png|jpeg|webp)/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
  } catch { return null; }
}
