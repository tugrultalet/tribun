// Sunucunun iki veri kaynağının (Highlightly, API-Football) paylaştığı yardımcılar ve lig kataloğu.
export const TZ = 'Europe/Istanbul';
export const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;

export const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
export const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
export const today = (offset = 0) => dayFmt.format(Date.now() + offset * DAY);
export function currentSeason() {
  const [y, m] = today().split('-').map(Number);
  return m >= 7 ? y : y - 1;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Hata türleri: bad, notfound, config, plan, blocked, quota, upstream.
export function fail(kind, message) {
  return Object.assign(new Error(message), { kind });
}

// Desteklenen ligler ve turnuvalar. `id`: API-Football numarası (uygulamanın ortak numarası). `type`: main = ülke ligi,
// cup = UEFA kupaları, intl = milli takım turnuvaları, domcup = ülke kupaları. `tv`: Türkiye'deki yayıncı (2026/27);
// yayın hakları lig bazında satıldığı için elle tutulur ve her sezon başında güncellenmelidir. Bilinmeyenlerde yoktur.
export const CATALOG = [
  { key: 'tr', id: 203, name: 'Süper Lig', country: 'Türkiye', type: 'main', tv: 'beIN Sports' },
  { key: 'pl', id: 39, name: 'Premier League', country: 'İngiltere', type: 'main', tv: 'beIN Sports' },
  { key: 'laliga', id: 140, name: 'La Liga', country: 'İspanya', type: 'main', tv: 'S Sport' },
  { key: 'seriea', id: 135, name: 'Serie A', country: 'İtalya', type: 'main', tv: 'S Sport' },
  { key: 'buli', id: 78, name: 'Bundesliga', country: 'Almanya', type: 'main', tv: 'S Sport' },
  { key: 'ligue1', id: 61, name: 'Ligue 1', country: 'Fransa', type: 'main', tv: 'beIN Sports' },
  { key: 'ere', id: 88, name: 'Eredivisie', country: 'Hollanda', type: 'main', tv: 'S Sport' },
  { key: 'por', id: 94, name: 'Primeira Liga', country: 'Portekiz', type: 'main', tv: 'S Sport' },
  { key: 'cl', id: 2, name: 'Şampiyonlar Ligi', country: 'UEFA', type: 'cup', tv: 'TRT' },
  { key: 'el', id: 3, name: 'Avrupa Ligi', country: 'UEFA', type: 'cup', tv: 'TRT' },
  { key: 'ecl', id: 848, name: 'Konferans Ligi', country: 'UEFA', type: 'cup', tv: 'TRT' },
  { key: 'wc', id: 1, name: 'Dünya Kupası', country: 'FIFA', type: 'intl' },
  { key: 'euro', id: 4, name: 'Avrupa Şampiyonası', country: 'UEFA', type: 'intl' },
  { key: 'nl', id: 5, name: 'UEFA Uluslar Ligi', country: 'UEFA', type: 'intl' },
  { key: 'wcq', id: 32, name: 'Dünya Kupası Elemeleri (Avrupa)', country: 'UEFA', type: 'intl' },
  { key: 'euroq', id: 960, name: 'Avrupa Şampiyonası Elemeleri', country: 'UEFA', type: 'intl' },
  { key: 'trcup', id: 206, name: 'Türkiye Kupası', country: 'Türkiye', type: 'domcup', tv: 'ATV / A Spor' },
  { key: 'trsuper', id: 551, name: 'Süper Kupa', country: 'Türkiye', type: 'domcup', tv: 'ATV / A Spor' },
  { key: 'facup', id: 45, name: 'FA Cup', country: 'İngiltere', type: 'domcup' },
  { key: 'eflcup', id: 48, name: 'EFL Cup', country: 'İngiltere', type: 'domcup' },
  { key: 'copa', id: 143, name: 'Copa del Rey', country: 'İspanya', type: 'domcup' },
  { key: 'coppa', id: 137, name: 'Coppa Italia', country: 'İtalya', type: 'domcup' },
  { key: 'dfb', id: 81, name: 'DFB-Pokal', country: 'Almanya', type: 'domcup' },
  { key: 'cdf', id: 66, name: 'Coupe de France', country: 'Fransa', type: 'domcup' },
  { key: 'knvb', id: 90, name: 'KNVB Beker', country: 'Hollanda', type: 'domcup' },
  { key: 'taca', id: 96, name: 'Taça de Portugal', country: 'Portekiz', type: 'domcup' },
];

const ROUNDS = { 'Round of 16': 'Son 16', 'Quarter-finals': 'Çeyrek final', 'Semi-finals': 'Yarı final', Final: 'Final' };
export function roundLabel(round = '') {
  const m = /^(Regular Season|League Stage) - (\d+)$/.exec(round || '');
  if (m) return `${m[2]}. hafta`;
  return ROUNDS[round] || round || '';
}

// "2 - 1" biçimindeki skoru [2, 1] yapar.
export function pair(text) {
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(text || '');
  return m ? [Number(m[1]), Number(m[2])] : null;
}
