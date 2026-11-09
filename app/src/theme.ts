// Tek, koyu tema: lacivertten siyaha geçişli zemin üzerinde yarı saydam paneller.
const theme = {
  dark: true,
  bg: '#0B1030',
  gradient: ['#18237A', '#0C1238', '#06081A'] as readonly [string, string, string],
  surface: 'rgba(255,255,255,0.07)', surface2: 'rgba(255,255,255,0.13)', line: 'rgba(255,255,255,0.16)',
  fg: '#FFFFFF', muted: '#A7ABC8', accent: '#9DB1FF', accentInk: '#0B1030', accentSoft: 'rgba(157,177,255,0.18)',
  live: '#FF5A52', liveSoft: 'rgba(255,90,82,0.2)', win: '#30D158', draw: '#8E8E93', loss: '#FF5A52',
  zone: { cl: '#9DB1FF', el: '#FFA53D', ecl: '#30D158', rel: '#FF5A52' },
  pitch: '#1E5A38', pitchLine: 'rgba(255,255,255,0.2)',
};
export type Theme = typeof theme;

export function useTheme(): Theme {
  return theme;
}

export const ZONE_NAMES = { cl: 'Şampiyonlar Ligi', el: 'Avrupa Ligi', ecl: 'Konferans Ligi', rel: 'Küme düşme' } as const;
