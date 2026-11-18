/**
 * Guest-first auth (PLAN.md §7) with passwordless email codes (Supabase Auth):
 * - first launch: a guest (anonymous) account, so anyone can train right away
 * - "Save your progress": the guest adds an email + code → the SAME account becomes permanent (no data moves)
 * - "Sign in": a returning hunter on a new phone gets a code and signs in to their account
 * No passwords to leak, reuse or reset. Apple / Google can be added next to these later.
 *
 * Supabase setup this relies on: docs/launch/AUTH.md.
 */
import { z } from 'zod';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

/** Set by an explicit sign-out; cleared when a guest starts or anyone signs in. */
export const SIGNED_OUT_FLAG = 'lb.session.signedOut';

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
  constructor(public kind: 'invalid' | 'rate' | 'expired' | 'exists' | 'network' | 'unknown', message: string) {
    super(message);
  }
}

/**
 * User-facing messages never echo server internals. Sign-in never reveals whether an email has an account;
 * only "Save your progress" says so, because the user must then sign in to that account instead.
 */
function toAuthError(e: unknown): AuthError {
  if (e instanceof AuthError) return e;
  const err = e as { status?: number; code?: string; message?: string; name?: string };
  const code = err?.code ?? '';
  if (code === 'email_exists' || code === 'user_already_exists') return new AuthError('exists', 'This email already has an account. Sign in to it instead.');
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

/** Starts a guest account (Supabase anonymous sign-in). Rate-limited per IP by Supabase. */
export async function startGuest(): Promise<void> {
  storage.remove(SIGNED_OUT_FLAG);
  const { error } = await client().auth.signInAnonymously();
  if (error) throw toAuthError(error);
}

/**
 * Save your progress: attaches an email to the current guest account and emails a code
 * (Supabase "Change email address" template). The user id stays the same, so nothing is migrated.
 */
export async function requestSaveCode(rawEmail: string): Promise<string> {
  const parsed = EmailSchema.safeParse(rawEmail);
  if (!parsed.success) throw new AuthError('invalid', parsed.error.issues[0]?.message ?? 'Enter a valid email address.');
  const { error } = await client().auth.updateUser({ email: parsed.data });
  if (error) throw toAuthError(error);
  return parsed.data;
}

/** Confirms the email on the guest account; afterwards it is a normal (non-anonymous) account. */
export async function verifySaveCode(email: string, rawCode: string): Promise<void> {
  const parsed = CodeSchema.safeParse(rawCode);
  if (!parsed.success) throw new AuthError('invalid', parsed.error.issues[0]?.message ?? 'Enter the code from the email.');
  const { error } = await client().auth.verifyOtp({ email, token: parsed.data, type: 'email_change' });
  if (error) throw toAuthError(error);
  // Pull the fresh token (is_anonymous: false) so the API and UI see a saved account right away.
  await client().auth.refreshSession();
}

/**
 * Signs out. 'local' revokes this device's refresh token on the server; 'global' revokes every session
 * of the account (use after a lost phone). Local data is wiped by the SIGNED_OUT handler.
 */
export async function signOut(scope: 'local' | 'global' = 'local'): Promise<void> {
  // After a deliberate sign-out, show the sign-in screen instead of silently starting a new guest.
  storage.set(SIGNED_OUT_FLAG, true);
  const { error } = await client().auth.signOut({ scope });
  // Offline or already-revoked token: the session is still removed from this device.
  if (error && scope === 'global') throw toAuthError(error);
}
