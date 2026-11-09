import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from './src/api';
import { RootParams, TabParams } from './src/nav';
import { StoreProvider, useStore } from './src/store';
import { useTheme } from './src/theme';
import { Icon } from './src/ui';
import Home from './src/screens/Home';
import League from './src/screens/League';
import Leagues from './src/screens/Leagues';
import Match from './src/screens/Match';
import MyTeams from './src/screens/MyTeams';
import Onboarding from './src/screens/Onboarding';
import Picker from './src/screens/Picker';
import Settings from './src/screens/Settings';
import Team from './src/screens/Team';

const Stack = createNativeStackNavigator<RootParams>();
const Tab = createBottomTabNavigator<TabParams>();

function TabsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: t.accent,
      tabBarInactiveTintColor: t.muted,
      tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.line, height: 58 + insets.bottom, paddingTop: 4 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
    }}>
      <Tab.Screen name="Home" component={Home} options={{ title: 'Maçlarım', tabBarIcon: ({ color }) => <Icon.tabHome color={color} /> }} />
      <Tab.Screen name="Leagues" component={Leagues} options={{ title: 'Ligler', tabBarIcon: ({ color }) => <Icon.tabLeagues color={color} /> }} />
      <Tab.Screen name="MyTeams" component={MyTeams} options={{ title: 'Takımlarım', tabBarIcon: ({ color }) => <Icon.tabTeams color={color} /> }} />
      <Tab.Screen name="Settings" component={Settings} options={{ title: 'Ayarlar', tabBarIcon: ({ color }) => <Icon.tabSettings color={color} /> }} />
    </Tab.Navigator>
  );
}

function Root() {
  const t = useTheme();
  const { onboarded } = useStore();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
      {onboarded ? (
        <>
          <Stack.Screen name="Tabs" component={TabsScreen} />
          <Stack.Screen name="Match" component={Match} />
          <Stack.Screen name="League" component={League} />
          <Stack.Screen name="Team" component={Team} />
          <Stack.Screen name="Picker" component={Picker} options={{ presentation: 'modal' }} />
        </>
      ) : (
        <Stack.Screen name="Onboarding" component={Onboarding} />
      )}
    </Stack.Navigator>
  );
}

// Sunucu yanıt verene kadar (ya da veremezse) gösterilen açılış ekranı.
function Splash({ error, retry }: { error: ApiError | null; retry: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14, backgroundColor: t.bg }}>
      {error ? (
        <>
          <Text style={{ fontSize: 17, fontWeight: '700', color: t.fg }}>Bağlanılamadı</Text>
          <Text style={{ textAlign: 'center', color: t.muted, lineHeight: 21 }}>{error.message}</Text>
          <Pressable onPress={retry} accessibilityRole="button" style={{ paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12, backgroundColor: t.accent }}>
            <Text style={{ fontWeight: '700', color: t.accentInk }}>Yeniden dene</Text>
          </Pressable>
        </>
      ) : <ActivityIndicator color={t.muted} />}
    </View>
  );
}

export default function App() {
  const t = useTheme();
  const [fontsLoaded] = useFonts({ BarlowCondensed_600SemiBold, BarlowCondensed_700Bold });
  const base = t.dark ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, background: t.bg, card: t.bg, text: t.fg, border: t.line, primary: t.accent } };
  return (
    <SafeAreaProvider>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      {fontsLoaded ? (
        <StoreProvider fallback={(error, retry) => <Splash error={error} retry={retry} />}>
          <NavigationContainer theme={navTheme}><Root /></NavigationContainer>
        </StoreProvider>
      ) : <Splash error={null} retry={() => {}} />}
    </SafeAreaProvider>
  );
}
