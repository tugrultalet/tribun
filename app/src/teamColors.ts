// Takımların ana rengi. Veri kaynağı renk vermediği için elle tutulur; listede olmayan takım varsayılan laciverti alır.
const COLORS: [string, string][] = [
  ['galatasaray', '#A90432'], ['fenerbahçe', '#0B2A7A'], ['beşiktaş', '#3A3A40'], ['trabzonspor', '#7A1E33'],
  ['başakşehir', '#C2551A'], ['samsunspor', '#C40812'], ['göztepe', '#B8860B'], ['kasımpaşa', '#13284B'],
  ['eyüpspor', '#5B2C83'], ['alanyaspor', '#C4661A'], ['konyaspor', '#00703A'], ['gaziantep', '#A30D22'],
  ['rizespor', '#00703A'], ['kocaelispor', '#00703A'], ['gençlerbirliği', '#A30D22'], ['amedspor', '#00703A'],
  ['çorum', '#A30D22'], ['erzurumspor', '#1F4FA8'], ['antalyaspor', '#B80A16'], ['kayserispor', '#B8860B'],
  ['arsenal', '#C00008'], ['manchester city', '#3B7CB0'], ['liverpool', '#A60D22'], ['chelsea', '#034694'],
  ['manchester united', '#B0201A'], ['tottenham', '#132257'], ['newcastle', '#3A3A40'], ['aston villa', '#670E36'],
  ['real madrid', '#2B3A8C'], ['barcelona', '#8A0038'], ['atletico', '#A32A1D'], ['atlético', '#A32A1D'],
  ['bayern', '#B00424'], ['dortmund', '#A68A00'], ['leverkusen', '#B01B1A'], ['leipzig', '#B00634'],
  ['juventus', '#3A3A40'], ['inter', '#0A1E8C'], ['milan', '#A80709'], ['napoli', '#0E7FAB'], ['roma', '#8E1F2F'],
  ['paris', '#004170'], ['psg', '#004170'], ['marseille', '#1F86B0'], ['ajax', '#A80E24'], ['psv', '#B0151B'],
  ['feyenoord', '#B00510'], ['benfica', '#B32424'], ['porto', '#00428C'], ['sporting', '#006646'],
];
// Liglerin ana rengi (Highlightly lig kimliğine göre).
const LEAGUE_COLORS: Record<number, string> = {
  173537: '#B3131B', // Süper Lig
  33973: '#4A1D6E', // Premier League
  119924: '#B8321F', // La Liga
  115669: '#0B2E7A', // Serie A
  67162: '#B00014', // Bundesliga
  52695: '#16306B', // Ligue 1
  75672: '#A81226', // Eredivisie
  80778: '#0F5A3C', // Primeira Liga
  2486: '#18237A', // Şampiyonlar Ligi
  3337: '#B5560A', // Avrupa Ligi
  722432: '#0E7A3A', // Konferans Ligi
};
export const DEFAULT_GRADIENT: readonly [string, string, string] = ['#18237A', '#0C1238', '#06081A'];

function mix(hex: string, towards: [number, number, number], amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const rgb = [n >> 16, (n >> 8) & 255, n & 255].map((c, i) => Math.round(c + (towards[i] - c) * amount));
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

const fade = (base: string): readonly [string, string, string] => [mix(base, [0, 0, 0], 0.15), mix(base, [6, 8, 26], 0.72), '#06070F'];

// Zemin geçişi: üstte lig ya da takım rengi, aşağıya doğru siyaha yakın. Lig verilmişse o önceliklidir.
export function gradientFor(teamName?: string, leagueId?: number): readonly [string, string, string] {
  if (leagueId && LEAGUE_COLORS[leagueId]) return fade(LEAGUE_COLORS[leagueId]);
  const name = (teamName || '').toLocaleLowerCase('tr');
  const hit = name ? COLORS.find(([key]) => name.includes(key)) : undefined;
  return hit ? fade(hit[1]) : DEFAULT_GRADIENT;
}
