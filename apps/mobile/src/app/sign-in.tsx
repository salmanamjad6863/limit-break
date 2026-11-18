import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
import { AuthError, RESEND_SECONDS, requestCode, verifyCode } from '@/features/session';
import { env } from '@/lib/env';
import { useTheme } from '@/theme';
import { Button, Page, PressableScale, Text } from '@/ui';

/** Wrong codes allowed per emailed code before a fresh one is required (Supabase also rate-limits per IP). */
const MAX_ATTEMPTS = 5;

/**
 * "Enter the System": passwordless email sign-in. One screen, two steps (email → code).
 * Works for new and returning hunters alike; onboarding follows for new accounts.
 */
export default function SignIn() {
  const { c, spacing, radius, type } = useTheme();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const codeRef = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const fail = (e: unknown) => setError(e instanceof AuthError ? e.message : 'Something went wrong. Try again.');

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const normalized = await requestCode(step === 'email' ? email : sentTo);
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
      await verifyCode(sentTo, value);
      // The session listener takes it from here (onboarding for new accounts, Home for returning ones).
    } catch (e) {
      const next = attempts + 1;
      setAttempts(next);
      setCode('');
      if (next >= MAX_ATTEMPTS) setError('Too many wrong codes. Request a new code.');
      else fail(e);
    } finally {
      setBusy(false);
    }
  };

  const onCode = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 10);
    setCode(digits);
    if (digits.length === env.otpLength) void verify(digits);
  };

  const locked = attempts >= MAX_ATTEMPTS;
  const input = {
    color: c.text, fontFamily: type.headline.font, fontSize: 20, paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    borderRadius: radius.md, borderWidth: 1, borderColor: error ? c.danger : c.border, backgroundColor: c.surface,
  } as const;

  return (
    <Page>
      <View style={{ gap: spacing[2], marginTop: spacing[8] }}>
        <Text variant="label" color={c.accentGlow}>{step === 'email' ? 'THE SYSTEM' : 'VERIFICATION'}</Text>
        <Text variant="title">{step === 'email' ? 'Enter the System' : 'Check your email'}</Text>
        <Text dim>
          {step === 'email'
            ? 'Sign in or create your hunter account with your email. We send a one-time code. No password needed.'
            : `We sent a ${env.otpLength}-digit code to ${sentTo}. It expires soon, so enter it now.`}
        </Text>
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

      {error ? <Text variant="caption" color={c.danger} accessibilityLiveRegion="polite">{error}</Text> : null}

      {step === 'email' ? (
        <Button label="Send code" onPress={send} loading={busy} disabled={busy || email.trim().length < 3} />
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
