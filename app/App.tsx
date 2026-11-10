import React from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from 'react-native';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { StatusBar } from 'expo-status-bar';
import { createNavigationContainerRef, DarkTheme, LinkingOptions, NavigationContainer } from '@react-navigation/native';
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
import Chat from './src/screens/Chat';
import Feedback from './src/screens/Feedback';
import { reportError, screen } from './src/telemetry';
import { APP_VERSION } from './src/config';
import { fbOnNotificationOpen } from './src/fb';
import { startRemoteConfig, useRemote } from './src/remoteConfig';
import { versionLess } from './src/version';

const navRef = createNavigationContainerRef<RootParams>();
import Group from './src/screens/Group';
import Groups from './src/screens/Groups';
import Onboarding from './src/screens/Onboarding';
import Picker from './src/screens/Picker';
import Settings from './src/screens/Settings';
import Team from './src/screens/Team';

// Davet bağlantısı: tribun://join/ABC234 → Gruplar sekmesi, katılma formu kodla dolu.
const LINKING: LinkingOptions<RootParams> = { prefixes: ['tribun://'], config: { screens: { Tabs: { screens: { Groups: 'join/:code' } } } } };
const Stack = createNativeStackNavigator<RootParams>();
const Tab = createBottomTabNavigator<TabParams>();
const IOS = Platform.OS === 'ios';
// Yerel sekmeler yalnızca iOS'ta oluşturulur; diğer platformlarda oluşturmak hata verir.
const NativeTab = IOS ? createNativeBottomTabNavigator<TabParams>() : null;
// iOS 26'da çubuklar kendiliğinden Liquid Glass'tır; daha eski iOS'ta bulanık malzeme kullanılır.
const BAR_BLUR = IOS && !isLiquidGlassAvailable() ? ('systemChromeMaterial' as const) : undefined;

const TABS = [
  { name: 'Home', title: 'Maçlarım', component: Home, symbol: 'soccerball', icon: Icon.tabHome },
  { name: 'Groups', title: 'Gruplar', component: Groups, symbol: 'person.3.fill', icon: Icon.tabGroups },
  { name: 'Leagues', title: 'Keşfet', component: Leagues, symbol: 'trophy.fill', icon: Icon.tabLeagues },
  { name: 'Settings', title: 'Ayarlar', component: Settings, symbol: 'gearshape.fill', icon: Icon.tabSettings },
] as const;

function TabsScreen() {
  const t = useTheme();
  const startTab = useStore().startTab;
  const insets = useSafeAreaInsets();
  if (NativeTab) {
    // Yerel iOS sekme çubuğu. Başlığı ekranın kendisi çizer ki en üste otursun.
    return (
      <NativeTab.Navigator initialRouteName={startTab} screenOptions={{
        headerShown: false,
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
    <Tab.Navigator initialRouteName={startTab} screenOptions={{
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
          <Stack.Screen name="MyTeams" component={MyTeams} options={{ title: 'Takımlarım' }} />
          <Stack.Screen name="Group" component={Group} />
          <Stack.Screen name="Chat" component={Chat} />
          <Stack.Screen name="Feedback" component={Feedback} options={{ title: 'Geri bildirim' }} />
        </>
      ) : (
        <Stack.Screen name="Onboarding" component={Onboarding} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}

// Görüntülenen ekranın adı (analiz için).
function currentRoute(state: unknown): string | undefined {
  let s = state as { index?: number; routes?: { name: string; state?: unknown }[] } | undefined;
  let name: string | undefined;
  while (s?.routes?.length) {
    const r = s.routes[s.index ?? 0];
    name = r.name;
    s = r.state as typeof s;
  }
  return name;
}

// Beklenmeyen bir hata tüm uygulamayı beyaz ekrana düşürmesin: hata raporlanır, kullanıcı yeniden deneyebilir.
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown, info: { componentStack?: string | null }) { reportError(error, info.componentStack ?? 'render'); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <Crashed onRetry={() => this.setState({ failed: false })} />;
  }
}
function Crashed({ onRetry }: { onRetry: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14, backgroundColor: t.bg }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: t.fg }}>Bir şeyler ters gitti</Text>
      <Text style={{ textAlign: 'center', color: t.muted, lineHeight: 21 }}>Hata kaydedildi. Tekrar dene; sorun sürerse Ayarlar → Geri bildirim gönder ile bize yaz.</Text>
      <Pressable onPress={onRetry} accessibilityRole="button" style={{ paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12, backgroundColor: t.accent }}>
        <Text style={{ fontWeight: '700', color: t.accentInk }}>Yeniden dene</Text>
      </Pressable>
    </View>
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

// Remote Config'teki en düşük sürümün altındaysa uygulama yerine güncelleme ekranı.
function UpdateGate({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const rc = useRemote();
  if (!versionLess(APP_VERSION, rc.min_version)) return <>{children}</>;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14, backgroundColor: t.bg }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: t.fg }}>Güncelleme gerekli</Text>
      <Text style={{ textAlign: 'center', color: t.muted, lineHeight: 21 }}>Tribün'ün bu sürümü artık desteklenmiyor. Devam etmek için uygulamayı güncelle.</Text>
      {rc.store_url ? (
        <Pressable onPress={() => Linking.openURL(rc.store_url).catch(() => {})} accessibilityRole="button" style={{ paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, backgroundColor: t.accent }}>
          <Text style={{ fontWeight: '700', color: t.accentInk }}>App Store'da güncelle</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function App() {
  const t = useTheme();
  // Uzak ayarlar açılışta bir kez alınır; bildirime dokunulunca ilgili maç açılır.
  React.useEffect(() => {
    startRemoteConfig();
    return fbOnNotificationOpen((data) => {
      const id = Number(data.matchId);
      if (!Number.isSafeInteger(id) || id === 0) return;
      const go = () => (navRef.isReady() ? navRef.navigate('Match', { id }) : setTimeout(go, 300));
      go();
    });
  }, []);
  const navTheme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: t.bg, card: t.bg, text: t.fg, border: t.line, primary: t.accent } };
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <StoreProvider fallback={(error, retry) => <Splash error={error} retry={retry} />}>
        <ErrorBoundary>
          <UpdateGate>
          <NavigationContainer ref={navRef} theme={navTheme} linking={Platform.OS === 'web' ? undefined : LINKING}
            onStateChange={(s) => { const name = currentRoute(s); if (name) screen(name); }}>
            <Root />
          </NavigationContainer>
          </UpdateGate>
        </ErrorBoundary>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
