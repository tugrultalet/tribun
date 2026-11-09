import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Team } from './api';

export type RootParams = {
  Onboarding: undefined;
  Tabs: undefined;
  Match: { id: number };
  League: { id: number };
  Team: { team: Team };
  Picker: undefined;
  MyTeams: undefined;
  Group: { id: string };
  Chat: { id: string; name: string };
};
export type TabParams = { Home: undefined; Groups: undefined; Leagues: undefined; Settings: undefined };
export const useNav = () => useNavigation<NativeStackNavigationProp<RootParams>>();
