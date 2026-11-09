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
};
export type TabParams = { Home: undefined; Leagues: undefined; MyTeams: undefined; Settings: undefined };
export const useNav = () => useNavigation<NativeStackNavigationProp<RootParams>>();
