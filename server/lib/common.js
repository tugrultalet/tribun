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

// Desteklenen ligler. `ids`: kaynağın kendi lig kimliği. `tv`: ligin Türkiye'deki yayıncısı (2026/27).
// Yayın hakları lig bazında satıldığı için elle tutulur; her sezon başında güncellenmelidir.
export const CATALOG = [
  { key: 'tr', name: 'Süper Lig', country: 'Türkiye', type: 'main', tv: 'beIN Sports', ids: { apifootball: 203, highlightly: 173537 } },
  { key: 'pl', name: 'Premier League', country: 'İngiltere', type: 'main', tv: 'beIN Sports', ids: { apifootball: 39, highlightly: 33973 } },
  { key: 'laliga', name: 'La Liga', country: 'İspanya', type: 'main', tv: 'S Sport', ids: { apifootball: 140, highlightly: 119924 } },
  { key: 'seriea', name: 'Serie A', country: 'İtalya', type: 'main', tv: 'S Sport', ids: { apifootball: 135, highlightly: 115669 } },
  { key: 'buli', name: 'Bundesliga', country: 'Almanya', type: 'main', tv: 'S Sport', ids: { apifootball: 78, highlightly: 67162 } },
  { key: 'ligue1', name: 'Ligue 1', country: 'Fransa', type: 'main', tv: 'beIN Sports', ids: { apifootball: 61, highlightly: 52695 } },
  { key: 'ere', name: 'Eredivisie', country: 'Hollanda', type: 'main', tv: 'S Sport', ids: { apifootball: 88, highlightly: 75672 } },
  { key: 'por', name: 'Primeira Liga', country: 'Portekiz', type: 'main', tv: 'S Sport', ids: { apifootball: 94, highlightly: 80778 } },
  { key: 'cl', name: 'Şampiyonlar Ligi', country: 'UEFA', type: 'cup', tv: 'TRT', ids: { apifootball: 2, highlightly: 2486 } },
  { key: 'el', name: 'Avrupa Ligi', country: 'UEFA', type: 'cup', tv: 'TRT', ids: { apifootball: 3, highlightly: 3337 } },
  { key: 'ecl', name: 'Konferans Ligi', country: 'UEFA', type: 'cup', tv: 'TRT', ids: { apifootball: 848, highlightly: 722432 } },
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
