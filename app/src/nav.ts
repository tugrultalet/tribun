import { NavigatorScreenParams, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Team } from './api';

export type RootParams = {
  Onboarding: undefined;
  Tabs: NavigatorScreenParams<TabParams> | undefined;
  Match: { id: number };
  League: { id: number };
  Team: { team: Team };
  Picker: undefined;
  MyTeams: undefined;
  Group: { id: string };
  Chat: { id: string; name: string };
};
// Groups.code: davet bağlantısından (tribun://join/KOD) gelen kod; katılma formu bununla açılır.
export type TabParams = { Home: undefined; Groups: { code?: string } | undefined; Leagues: undefined; Settings: undefined };
export const useNav = () => useNavigation<NativeStackNavigationProp<RootParams>>();
