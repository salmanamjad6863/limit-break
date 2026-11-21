import '@/global.css';
import { DelaGothicOne_400Regular } from '@expo-google-fonts/dela-gothic-one';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Rajdhani_600SemiBold, Rajdhani_700Bold } from '@expo-google-fonts/rajdhani';
import { CONSENT_VERSION } from '@lb/contracts';
import { colors } from '@lb/tokens';
import { defaultShouldDehydrateQuery, onlineManager, useIsRestoring } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { CinematicOverlay } from '@/features/celebrations';
import { progressionKeys, useMe } from '@/features/progression';
import { useAuthBootstrap, useSession } from '@/features/session';
import { useTrainingRestore } from '@/features/training/sync';
import { track } from '@/lib/analytics';
import { reportError, startMonitoring } from '@/lib/monitoring';
import { queryClient, queryPersister } from '@/lib/query';
import { ActivityIndicator, Pressable, Text as RNText, StyleSheet, View } from 'react-native';
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

/** Plain RN primitives (fonts may not be loaded yet). As an overlay it covers the navigator without unmounting it. */
function Blocker({ overlay, error }: { overlay: boolean; error: boolean }) {
  const retry = () => {
    // Try the network again even if the app thinks it's offline; a failure marks it offline again.
    onlineManager.setOnline(true);
    void queryClient.refetchQueries({ queryKey: progressionKeys.me() });
  };
  return (
    <View style={[overlay ? StyleSheet.absoluteFill : { flex: 1 }, { backgroundColor: colors.dark.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }]}>
      {error ? (
        <>
          <RNText style={{ color: colors.dark.text, fontSize: 22, fontWeight: '700', textAlign: 'center' }}>Can’t reach the System.</RNText>
          <RNText style={{ color: colors.dark.textDim, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
            Your hunter couldn’t be loaded. Check your connection and try again.
          </RNText>
          <Pressable onPress={retry} accessibilityRole="button" style={{ backgroundColor: colors.dark.accent, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 }}>
            <RNText style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Try again</RNText>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator color={colors.dark.accent} />
      )}
    </View>
  );
}

function Bootstrap() {
  useTrainingRestore();
  const isRestoring = useIsRestoring();
  const status = useSession((s) => s.status);
  const isGuest = useSession((s) => s.isGuest);
  const [fontsLoaded] = useFonts({
    DelaGothicOne_400Regular, Rajdhani_600SemiBold, Rajdhani_700Bold,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });
  const me = useMe();
  const meSettled = status === 'demo' || !me.isLoading;
  const ready = fontsLoaded && !isRestoring && status !== 'booting' && meSettled;
  // Signed in but no profile at all (never loaded, offline or the API failing): a retry screen, not the tabs.
  // Offline WITH a cached profile stays in the app.
  const meMissing = status === 'signedIn' && !me.data && !me.isLoading;
  const settled = ready && !meMissing;
  const onboarded = me.data ? me.data.onboarded : true;
  const hasSession = status === 'signedIn' || status === 'demo';
  // Existing hunters re-confirm when the privacy/health-data terms change. `undefined` = a profile cached by an
  // older build (field unknown): wait for the server's answer instead of flashing the consent screen.
  const needsConsent = status === 'signedIn' && onboarded && !!me.data && me.data.consentVersion !== undefined && me.data.consentVersion !== CONSENT_VERSION;

  const computed = {
    app: hasSession && onboarded && !needsConsent,
    consent: needsConsent,
    awakening: hasSession && !onboarded,
    signIn: status === 'signedOut' || (status === 'signedIn' && isGuest),
    signInModal: status !== 'signedOut',
  };
  // While loading again (sign-in, account switch) the guards keep their last settled values, so the navigator
  // never sees a half-known state; a loading / retry layer covers it instead.
  const [lastGuards, setLastGuards] = useState(computed);
  const g = settled ? computed : lastGuards;
  const { app, consent, awakening, signIn, signInModal } = computed;
  useEffect(() => {
    if (settled) setLastGuards({ app, consent, awakening, signIn, signInModal });
  }, [settled, app, consent, awakening, signIn, signInModal]);
  // Once the navigator has been shown it is never unmounted (that would reset navigation and screen state).
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (settled) setShown(true);
  }, [settled]);

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync();
    track({ event: 'app_opened' });
  }, [ready]);

  if (!shown && !settled) return ready && meMissing ? <Blocker overlay={false} error /> : null;
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.dark.background }, animation: 'fade' }}>
        <Stack.Protected guard={g.app}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="programs" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="program/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="exercises" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="exercise/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="workout" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="trial" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="diary" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="training-settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="history" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="progress" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
          {/* community screens (Sprint 9) */}
          <Stack.Screen name="community/compose" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="community/handle" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="community/post/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="community/hunter/[handle]" options={{ animation: 'slide_from_right' }} />
          {/* dev-only labs: inside the guard so a fresh (not-onboarded) user restored onto them still lands on onboarding */}
          <Stack.Screen name="dev/aura" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="dev/trainer" options={{ animation: 'slide_from_right' }} />
        </Stack.Protected>
        <Stack.Protected guard={g.consent}>
          <Stack.Screen name="consent" options={{ gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Protected guard={g.awakening}>
          <Stack.Screen name="awakening" />
        </Stack.Protected>
        {/* after a sign-out: the start screen; for guests: "Save your progress" / "Sign in" as a modal */}
        <Stack.Protected guard={g.signIn}>
          <Stack.Screen name="sign-in" options={g.signInModal ? { presentation: 'modal', animation: 'slide_from_bottom' } : undefined} />
        </Stack.Protected>
      </Stack>
      <CinematicOverlay />
      {!settled ? <Blocker overlay error={ready && meMissing} /> : null}
    </>
  );
}

export default function RootLayout() {
  useAuthBootstrap();
  const status = useSession((s) => s.status);
  // The persisted cache belongs to one account: restore it only once the session (its owner) is known.
  // Mounted once and then kept, so the navigator below is never torn down.
  const [sessionKnown, setSessionKnown] = useState(false);
  useEffect(() => {
    if (status !== 'booting') setSessionKnown(true);
  }, [status]);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.dark.background }}>
      {sessionKnown ? (
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: queryPersister,
            // queries marked meta.persist === false (e.g. the training-state snapshot) are never written to disk
            dehydrateOptions: { shouldDehydrateQuery: (q) => defaultShouldDehydrateQuery(q) && q.meta?.persist !== false },
          }}
          // Replay offline changes saved before the app was closed, then refresh what they touched.
          onSuccess={() => queryClient.resumePausedMutations().then(() => queryClient.invalidateQueries())}
        >
          <ThemeProvider value={navTheme}>
            <StatusBar style="light" />
            <Bootstrap />
          </ThemeProvider>
        </PersistQueryClientProvider>
      ) : null}
    </GestureHandlerRootView>
  );
}
