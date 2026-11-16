import '@/global.css';
import { DelaGothicOne_400Regular } from '@expo-google-fonts/dela-gothic-one';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Rajdhani_600SemiBold, Rajdhani_700Bold } from '@expo-google-fonts/rajdhani';
import { colors } from '@lb/tokens';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { CinematicOverlay } from '@/features/celebrations';
import { useMe } from '@/features/progression';
import { useAuthBootstrap, useSession } from '@/features/session';
import { queryClient, queryPersister } from '@/lib/query';

SplashScreen.preventAutoHideAsync();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.dark.background, card: colors.dark.surface, primary: colors.dark.accent },
};

function Bootstrap() {
  useAuthBootstrap();
  const status = useSession((s) => s.status);
  const [fontsLoaded] = useFonts({
    DelaGothicOne_400Regular, Rajdhani_600SemiBold, Rajdhani_700Bold,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });
  const me = useMe();
  const meSettled = status === 'demo' || !me.isLoading;
  const ready = fontsLoaded && status !== 'booting' && meSettled;
  // If the API is unreachable, keep the user in the app (offline cache) rather than forcing onboarding.
  const onboarded = me.data ? me.data.onboarded : true;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.dark.background }, animation: 'fade' }}>
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="programs" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="exercises" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="exercise/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workout" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="awakening" />
        </Stack.Protected>
      </Stack>
      <CinematicOverlay />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.dark.background }}>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: queryPersister }}>
        <ThemeProvider value={navTheme}>
          <StatusBar style="light" />
          <Bootstrap />
        </ThemeProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
