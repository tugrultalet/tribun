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
  // match verilirse grubun o maçın odası (yoksa genel sohbet).
  // derby: derbi odası (kırmızı tonlu zemin, başlıkta 🔥).
  Chat: { id: string; name: string; match?: number; home?: string; away?: string; kickoff?: number; derby?: boolean };
  Feedback: undefined;
  Settings: undefined;
  Member: { id: string; name: string };
  Ask: { token: string };
  Account: undefined;
  PickHistory: undefined;
  // E-postadaki giriş bağlantısı: h = Supabase token_hash.
  EmailLink: { h?: string } | undefined;
};
// Groups.code: davet bağlantısından (tribun://join/KOD) gelen kod; katılma formu bununla açılır.
export type TabParams = { Home: undefined; Groups: { code?: string } | undefined; Leagues: undefined; Profile: undefined };
export const useNav = () => useNavigation<NativeStackNavigationProp<RootParams>>();
