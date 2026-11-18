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
import { track } from '@/lib/analytics';
import { reportError, startMonitoring } from '@/lib/monitoring';
import { queryClient, queryPersister } from '@/lib/query';
import { Pressable, Text as RNText, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';

SplashScreen.preventAutoHideAsync();
startMonitoring();

/**
 * Root error screen (Expo Router): any render crash lands here instead of a blank screen.
 * Plain RN primitives only, so it renders even if the theme or fonts are what failed.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error, { boundary: 'root' });
  }, [error]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.dark.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
      <RNText style={{ color: colors.dark.text, fontSize: 22, fontWeight: '700', textAlign: 'center' }}>The System hit a glitch.</RNText>
      <RNText style={{ color: colors.dark.textDim, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
        Your training and progress are saved on this device. Try again; if it keeps happening, restart the app.
      </RNText>
      <Pressable onPress={retry} accessibilityRole="button" style={{ backgroundColor: colors.dark.accent, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 }}>
        <RNText style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Try again</RNText>
      </Pressable>
    </View>
  );
}

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
  const hasSession = status === 'signedIn' || status === 'demo';

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync();
    track({ event: 'app_opened' });
  }, [ready]);

  if (!ready) return null;
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.dark.background }, animation: 'fade' }}>
        <Stack.Protected guard={hasSession && onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="programs" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="exercises" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="exercise/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workout" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="trial" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="diary" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="training-settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="history" options={{ animation: 'slide_from_right' }} />
          {/* dev-only labs: inside the guard so a fresh (not-onboarded) user restored onto them still lands on onboarding */}
          <Stack.Screen name="dev/aura" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="dev/trainer" options={{ animation: 'slide_from_right' }} />
        </Stack.Protected>
        <Stack.Protected guard={hasSession && !onboarded}>
          <Stack.Screen name="awakening" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'signedOut'}>
          <Stack.Screen name="sign-in" />
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
