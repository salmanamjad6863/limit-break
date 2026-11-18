/**
 * Email one-time-code sign-in (Supabase Auth, passwordless). One flow for new and returning users:
 * request a code → type the code → signed in. No passwords to leak, reuse or reset.
 *
 * Supabase setup this relies on: docs/launch/AUTH.md.
 */
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'That email is too long.')
  .pipe(z.email('Enter a valid email address.'));

/** Supabase email OTP length is configurable (6–10 digits); accept any of them. */
export const CodeSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, ''))
  .pipe(z.string().regex(/^\d{6,10}$/, 'Enter the code from the email.'));

/** Seconds before another code can be requested (Supabase's own per-email limit is 60 s). */
export const RESEND_SECONDS = 60;

export class AuthError extends Error {
  constructor(public kind: 'invalid' | 'rate' | 'expired' | 'network' | 'unknown', message: string) {
    super(message);
  }
}

/**
 * User-facing messages stay generic on purpose: they never reveal whether an email has an account
 * (no account enumeration) and never echo server internals.
 */
function toAuthError(e: unknown): AuthError {
  if (e instanceof AuthError) return e;
  const err = e as { status?: number; code?: string; message?: string; name?: string };
  const code = err?.code ?? '';
  if (err?.status === 429 || code.includes('rate_limit')) return new AuthError('rate', 'Too many attempts. Wait a minute and try again.');
  if (code === 'otp_expired' || code === 'otp_disabled' || err?.status === 403) return new AuthError('expired', 'That code is wrong or has expired. Request a new one.');
  if (code === 'validation_failed' || code === 'email_address_invalid') return new AuthError('invalid', 'Enter a valid email address.');
  if (err?.name === 'AuthRetryableFetchError' || /network|fetch/i.test(err?.message ?? '')) return new AuthError('network', 'No connection. Check your internet and try again.');
  return new AuthError('unknown', 'Something went wrong. Try again.');
}

function client() {
  if (!supabase) throw new AuthError('unknown', 'Sign-in is not configured in this build.');
  return supabase;
}

/** Sends a one-time code to the email. New emails get an account; existing ones just sign in. */
export async function requestCode(rawEmail: string): Promise<string> {
  const parsed = EmailSchema.safeParse(rawEmail);
  if (!parsed.success) throw new AuthError('invalid', parsed.error.issues[0]?.message ?? 'Enter a valid email address.');
  const { error } = await client().auth.signInWithOtp({ email: parsed.data, options: { shouldCreateUser: true } });
  if (error) throw toAuthError(error);
  return parsed.data;
}

/** Exchanges the emailed code for a session. The session lands in encrypted storage (src/lib/storage.ts). */
export async function verifyCode(email: string, rawCode: string): Promise<void> {
  const parsed = CodeSchema.safeParse(rawCode);
  if (!parsed.success) throw new AuthError('invalid', parsed.error.issues[0]?.message ?? 'Enter the code from the email.');
  const { data, error } = await client().auth.verifyOtp({ email, token: parsed.data, type: 'email' });
  if (error) throw toAuthError(error);
  if (!data.session) throw new AuthError('expired', 'That code is wrong or has expired. Request a new one.');
}

/**
 * Signs out. 'local' revokes this device's refresh token on the server; 'global' revokes every session
 * of the account (use after a lost phone). Local data is wiped by the SIGNED_OUT handler.
 */
export async function signOut(scope: 'local' | 'global' = 'local'): Promise<void> {
  const { error } = await client().auth.signOut({ scope });
  // Offline or already-revoked token: the session is still removed from this device.
  if (error && scope === 'global') throw toAuthError(error);
}
