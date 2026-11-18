import { useLocalSearchParams } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
import {
  AuthError, RESEND_SECONDS, requestCode, requestSaveCode, startGuest, useSession, verifyCode, verifySaveCode,
} from '@/features/session';
import { env } from '@/lib/env';
import { useTheme } from '@/theme';
import { Button, Page, PressableScale, ScreenHeader, Text } from '@/ui';

/** Wrong codes allowed per emailed code before a fresh one is required (Supabase also rate-limits per IP). */
const MAX_ATTEMPTS = 5;

type Mode = 'save' | 'signin';

const COPY = {
  save: {
    kicker: 'SAVE YOUR PROGRESS',
    title: 'Keep your hunter forever',
    body: 'Add your email to save your rank, XP, workouts and nutrition to your account. Sign in on any phone with a one-time code. No password.',
    cta: 'Send code',
  },
  signin: {
    kicker: 'THE SYSTEM',
    title: 'Sign in',
    body: 'Enter the email of your hunter account. We send a one-time code. No password needed.',
    cta: 'Send code',
  },
} as const;

/**
 * Passwordless email codes, two modes:
 * - save   (guest → saved account): same account, nothing moves
 * - signin (returning hunter, new phone, or after signing out)
 * Shown as a modal for guests, and as the start screen after a sign-out.
 */
export default function SignIn() {
  const { c, spacing, radius, type } = useTheme();
  const params = useLocalSearchParams<{ mode?: string }>();
  const status = useSession((s) => s.status);
  const isGuest = useSession((s) => s.isGuest);
  const [mode, setMode] = useState<Mode>(isGuest && params.mode === 'save' ? 'save' : 'signin');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const codeRef = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const fail = (e: unknown) => setError(e instanceof AuthError ? e : new AuthError('unknown', 'Something went wrong. Try again.'));

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const target = step === 'email' ? email : sentTo;
      const normalized = mode === 'save' ? await requestSaveCode(target) : await requestCode(target);
      setSentTo(normalized);
      setStep('code');
      setCode('');
      setAttempts(0);
      setCooldown(RESEND_SECONDS);
      setTimeout(() => codeRef.current?.focus(), 250);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = code) => {
    if (busy || attempts >= MAX_ATTEMPTS) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'save') await verifySaveCode(sentTo, value);
      else await verifyCode(sentTo, value);
      // The session listener takes over: once the account is saved / signed in, the route guard closes this screen.
    } catch (e) {
      const next = attempts + 1;
      setAttempts(next);
      setCode('');
      if (next >= MAX_ATTEMPTS) setError(new AuthError('expired', 'Too many wrong codes. Request a new code.'));
      else fail(e);
    } finally {
      setBusy(false);
    }
  };

  const guest = async () => {
    setBusy(true);
    setError(null);
    try {
      await startGuest();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const onCode = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 10);
    const pasted = digits.length - code.length > 1; // paste or iOS/Android code autofill
    setCode(digits);
    // Auto-submit only a pasted/autofilled code of the expected length; typed codes are sent with Verify,
    // so a project set to a longer code (Supabase allows 6–10) never gets cut off early.
    if (pasted && digits.length >= env.otpLength) void verify(digits);
  };

  const switchToSignIn = () => {
    setMode('signin');
    setStep('email');
    setError(null);
    setCooldown(0);
  };

  const locked = attempts >= MAX_ATTEMPTS;
  const copy = COPY[mode];
  const input = {
    color: c.text, fontFamily: type.headline.font, fontSize: 20, paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    borderRadius: radius.md, borderWidth: 1, borderColor: error ? c.danger : c.border, backgroundColor: c.surface,
  } as const;

  return (
    <Page header={isGuest ? <ScreenHeader title="" icon="close" /> : undefined}>
      <View style={{ gap: spacing[2], marginTop: isGuest ? 0 : spacing[8] }}>
        <Text variant="label" color={c.accentGlow}>{step === 'email' ? copy.kicker : 'VERIFICATION'}</Text>
        <Text variant="title">{step === 'email' ? copy.title : 'Check your email'}</Text>
        <Text dim>{step === 'email' ? copy.body : `We sent a ${env.otpLength}-digit code to ${sentTo}. It expires soon, so enter it now.`}</Text>
        {isGuest && mode === 'signin' && step === 'email' ? (
          <Text variant="caption" color={c.warning}>Signing in to another account replaces the guest progress on this phone.</Text>
        ) : null}
      </View>

      {step === 'email' ? (
        <View style={{ gap: spacing[2] }}>
          <Text variant="label" dim>Email</Text>
          <TextInput
            value={email}
            onChangeText={(v) => { setEmail(v); setError(null); }}
            onSubmitEditing={send}
            placeholder="you@example.com"
            placeholderTextColor={c.textMuted}
            selectionColor={c.accentGlow}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            maxLength={254}
            accessibilityLabel="Email address"
            style={input}
          />
        </View>
      ) : (
        <View style={{ gap: spacing[2] }}>
          <Text variant="label" dim>Code</Text>
          <TextInput
            ref={codeRef}
            value={code}
            onChangeText={onCode}
            onSubmitEditing={() => void verify()}
            placeholder={'•'.repeat(env.otpLength)}
            placeholderTextColor={c.textMuted}
            selectionColor={c.accentGlow}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={10}
            editable={!locked}
            accessibilityLabel="One-time code"
            style={{ ...input, fontSize: 28, letterSpacing: 8, textAlign: 'center' }}
          />
        </View>
      )}

      {error ? <Text variant="caption" color={c.danger} accessibilityLiveRegion="polite">{error.message}</Text> : null}
      {error?.kind === 'exists' ? <Button variant="secondary" label="Sign in to that account" onPress={switchToSignIn} /> : null}

      {step === 'email' ? (
        <View style={{ gap: spacing[3] }}>
          <Button label={copy.cta} onPress={send} loading={busy} disabled={busy || email.trim().length < 3} />
          {isGuest && mode === 'save' ? <Button variant="ghost" label="I already have an account" onPress={switchToSignIn} /> : null}
          {status === 'signedOut' ? <Button variant="ghost" label="Start as a new hunter (no account)" onPress={guest} disabled={busy} /> : null}
        </View>
      ) : (
        <View style={{ gap: spacing[3] }}>
          {!locked ? <Button label="Verify" onPress={() => void verify()} loading={busy} disabled={busy || code.length < 6} /> : null}
          <Button
            variant={locked ? 'primary' : 'secondary'}
            label={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Send a new code'}
            onPress={send}
            disabled={busy || cooldown > 0}
          />
          <Button variant="ghost" label="Use a different email" onPress={() => { setStep('email'); setError(null); setCode(''); setCooldown(0); }} />
        </View>
      )}

      {step === 'email' && (env.termsUrl || env.privacyUrl) ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          <Text variant="caption" dim>By continuing you agree to the</Text>
          {env.termsUrl ? <Link label="Terms" url={env.termsUrl} /> : null}
          {env.termsUrl && env.privacyUrl ? <Text variant="caption" dim>and</Text> : null}
          {env.privacyUrl ? <Link label="Privacy Policy" url={env.privacyUrl} /> : null}
        </View>
      ) : null}
    </Page>
  );
}

function Link({ label, url }: { label: string; url: string }) {
  const { c } = useTheme();
  return (
    <PressableScale haptic="tap" onPress={() => Linking.openURL(url)} accessibilityRole="link" accessibilityLabel={label}>
      <Text variant="caption" color={c.accentGlow}>{label}</Text>
    </PressableScale>
  );
}
