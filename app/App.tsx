import React from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable';
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
const IOS = Platform.OS === 'ios';
// Yerel sekmeler yalnızca iOS'ta oluşturulur; diğer platformlarda oluşturmak hata verir.
const NativeTab = IOS ? createNativeBottomTabNavigator<TabParams>() : null;
// iOS 26'da çubuklar kendiliğinden Liquid Glass'tır; daha eski iOS'ta bulanık malzeme kullanılır.
const BAR_BLUR = IOS && !isLiquidGlassAvailable() ? ('systemChromeMaterial' as const) : undefined;

const TABS = [
  { name: 'Home', title: 'Maçlarım', component: Home, symbol: 'soccerball', icon: Icon.tabHome },
  { name: 'Leagues', title: 'Ligler', component: Leagues, symbol: 'trophy.fill', icon: Icon.tabLeagues },
  { name: 'MyTeams', title: 'Takımlarım', component: MyTeams, symbol: 'tshirt.fill', icon: Icon.tabTeams },
  { name: 'Settings', title: 'Ayarlar', component: Settings, symbol: 'gearshape.fill', icon: Icon.tabSettings },
] as const;

function TabsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  if (NativeTab) {
    // Yerel iOS sekme çubuğu ve büyük başlıklar.
    return (
      <NativeTab.Navigator screenOptions={{
        headerShown: true,
        headerLargeTitleEnabled: true,
        headerTransparent: true,
        headerBlurEffect: BAR_BLUR,
        headerShadowVisible: false,
        headerTintColor: t.accent,
        headerLargeTitleStyle: { color: t.fg },
        headerTitleStyle: { color: t.fg },
        tabBarActiveTintColor: t.accent,
        tabBarMinimizeBehavior: 'onScrollDown',
      }}>
        {TABS.map((tab) => (
          <NativeTab.Screen key={tab.name} name={tab.name} component={tab.component}
            options={{ title: tab.title, tabBarIcon: { type: 'sfSymbol', name: tab.symbol } }} />
        ))}
      </NativeTab.Navigator>
    );
  }
  // Web ve Android: yüzen, yarı saydam sekme çubuğu.
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: t.accent,
      tabBarInactiveTintColor: t.muted,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      tabBarStyle: {
        position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 14), marginHorizontal: 16, height: 64, paddingTop: 6, paddingBottom: 6,
        borderRadius: 32, borderTopWidth: 0, borderWidth: 1, borderColor: t.line, overflow: 'hidden',
        backgroundColor: 'rgba(22,24,44,0.72)',
        ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)' } as object) : null),
        shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 8,
      },
    }}>
      {TABS.map((tab) => (
        <Tab.Screen key={tab.name} name={tab.name} component={tab.component}
          options={{ title: tab.title, tabBarIcon: ({ color }) => <tab.icon color={color} /> }} />
      ))}
    </Tab.Navigator>
  );
}

function Root() {
  const t = useTheme();
  const { onboarded } = useStore();
  return (
    <Stack.Navigator screenOptions={{
      headerShown: IOS,
      headerTransparent: true,
      headerBlurEffect: BAR_BLUR,
      headerShadowVisible: false,
      headerBackButtonDisplayMode: 'minimal',
      headerTintColor: t.accent,
      headerTitleStyle: { color: t.fg },
      title: '',
      contentStyle: { backgroundColor: t.bg },
    }}>
      {onboarded ? (
        <>
          <Stack.Screen name="Tabs" component={TabsScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Match" component={Match} />
          <Stack.Screen name="League" component={League} />
          <Stack.Screen name="Team" component={Team} />
          <Stack.Screen name="Picker" component={Picker} options={{ presentation: 'modal', title: 'Takım ekle' }} />
        </>
      ) : (
        <Stack.Screen name="Onboarding" component={Onboarding} options={{ headerShown: false }} />
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
  const navTheme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: t.bg, card: t.bg, text: t.fg, border: t.line, primary: t.accent } };
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <StoreProvider fallback={(error, retry) => <Splash error={error} retry={retry} />}>
        <NavigationContainer theme={navTheme}><Root /></NavigationContainer>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
