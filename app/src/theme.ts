import { useColorScheme } from 'react-native';

const light = {
  dark: false,
  bg: '#F4F6FA', surface: '#FFFFFF', surface2: '#ECEFF5', line: '#DDE2EB',
  fg: '#0E1424', muted: '#5D667D', accent: '#1F4FE0', accentInk: '#FFFFFF', accentSoft: '#E3E9FD',
  live: '#E0262B', liveSoft: '#FDE5E5', win: '#16924B', draw: '#8C93A6', loss: '#D33A3A',
  zone: { cl: '#1F4FE0', el: '#E8820C', ecl: '#16924B', rel: '#D33A3A' },
  pitch: '#2F7D4E', pitchLine: 'rgba(255,255,255,0.28)',
};
export type Theme = typeof light;
const dark: Theme = {
  dark: true,
  bg: '#0B0F19', surface: '#141A27', surface2: '#1B2232', line: '#252D40',
  fg: '#EEF1F7', muted: '#8A93AB', accent: '#8BA3FF', accentInk: '#0B0F19', accentSoft: '#1D2849',
  live: '#FF5A5E', liveSoft: '#3A1719', win: '#3CC77A', draw: '#7D869B', loss: '#FF6B6B',
  zone: { cl: '#8BA3FF', el: '#FFA53D', ecl: '#3CC77A', rel: '#FF6B6B' },
  pitch: '#1E5A38', pitchLine: 'rgba(255,255,255,0.2)',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const font = { score: 'BarlowCondensed_700Bold', scoreMid: 'BarlowCondensed_600SemiBold' };
export const ZONE_NAMES = { cl: 'Şampiyonlar Ligi', el: 'Avrupa Ligi', ecl: 'Konferans Ligi', rel: 'Küme düşme' } as const;
