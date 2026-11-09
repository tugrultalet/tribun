import { useColorScheme } from 'react-native';

// iOS'un gruplu liste görünümüne göre: gri zemin, beyaz kartlar, ince ayırıcılar.
const light = {
  dark: false,
  bg: '#F2F2F7', surface: '#FFFFFF', surface2: '#E9E9EE', line: 'rgba(60,60,67,0.2)',
  fg: '#0B0B0F', muted: '#6E6E76', accent: '#1F4FE0', accentInk: '#FFFFFF', accentSoft: '#E4EAFD',
  live: '#FF3B30', liveSoft: '#FFE5E3', win: '#1FA64A', draw: '#8E8E93', loss: '#E5342A',
  zone: { cl: '#1F4FE0', el: '#E8820C', ecl: '#1FA64A', rel: '#E5342A' },
  pitch: '#2F7D4E', pitchLine: 'rgba(255,255,255,0.28)',
  hero: ['#1B2350', '#4A2A66', '#B4553B'] as const,
};
export type Theme = Omit<typeof light, 'hero'> & { hero: readonly [string, string, string] };
const dark: Theme = {
  dark: true,
  bg: '#000000', surface: '#1C1C1E', surface2: '#2C2C2E', line: 'rgba(84,84,88,0.6)',
  fg: '#FFFFFF', muted: '#98989F', accent: '#7C9BFF', accentInk: '#000000', accentSoft: '#1A2447',
  live: '#FF453A', liveSoft: '#3A1512', win: '#30D158', draw: '#8E8E93', loss: '#FF453A',
  zone: { cl: '#7C9BFF', el: '#FFA53D', ecl: '#30D158', rel: '#FF453A' },
  pitch: '#1E5A38', pitchLine: 'rgba(255,255,255,0.2)',
  hero: ['#141B40', '#3B2152', '#8E4330'],
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const font = { score: 'BarlowCondensed_700Bold', scoreMid: 'BarlowCondensed_600SemiBold' };
export const ZONE_NAMES = { cl: 'Şampiyonlar Ligi', el: 'Avrupa Ligi', ecl: 'Konferans Ligi', rel: 'Küme düşme' } as const;
