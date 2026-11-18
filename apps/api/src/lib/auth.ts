import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

/** Only Supabase's asymmetric signing algorithms; never HS256 (shared secret) or 'none'. */
export const ACCEPTED_ALGS = ['ES256', 'RS256'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Claims every API call requires on top of a valid signature: role `authenticated` and a UUID subject.
 * Guest (anonymous) accounts are allowed (guest-first, PLAN.md §7) and flagged so routes like the
 * community can require a saved account (`requireSavedAccount`).
 */
export function assertUserClaims(payload: JWTPayload): { userId: string; isGuest: boolean } {
  if (typeof payload.sub !== 'string' || !UUID.test(payload.sub)) throw new Error('token has no valid subject');
  if (payload.role !== 'authenticated') throw new Error('token role is not authenticated');
  return { userId: payload.sub, isGuest: payload.is_anonymous === true };
}

/**
 * Verifies Supabase access tokens against the project's JWKS (asymmetric signing keys).
 * Supabase → Project Settings → JWT Keys: use the new asymmetric keys (ES256/RS256).
 */
export function supabaseVerifier(supabaseUrl: string) {
  const issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;
  return tokenVerifier(issuer, createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)));
}

/** Signature (JWKS, asymmetric only) + issuer + audience + expiry (jose) + user claims. Exported for tests. */
export function tokenVerifier(issuer: string, keys: Parameters<typeof jwtVerify>[1]) {
  return async (token: string) => {
    const { payload } = await jwtVerify(token, keys as never, { issuer, audience: 'authenticated', algorithms: ACCEPTED_ALGS });
    return assertUserClaims(payload);
  };
}

/**
 * Admin headers for Supabase. New secret keys (sb_secret_…) are not JWTs: send them only as `apikey`
 * (the gateway authorises them). Legacy service_role keys are JWTs and also go in Authorization.
 */
const adminHeaders = (key: string): Record<string, string> =>
  key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };

/** Deletes the auth user with the service role (Supabase Admin API). Profile rows cascade from auth.users (0002). */
export function supabaseAdminDeleter(supabaseUrl: string, serviceRoleKey: string) {
  return async (userId: string) => {
    const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: adminHeaders(serviceRoleKey),
    });
    if (!res.ok && res.status !== 404) throw new Error(`auth delete failed: ${res.status}`);
  };
}

/** Supabase Storage signed URLs with the service role (uploads go straight from the phone to storage). */
export function supabaseStorage(supabaseUrl: string, serviceRoleKey: string) {
  const base = `${supabaseUrl.replace(/\/$/, '')}/storage/v1`;
  const headers = { ...adminHeaders(serviceRoleKey), 'Content-Type': 'application/json' };
  return {
    async signUpload(bucket: string, path: string) {
      const res = await fetch(`${base}/object/upload/sign/${bucket}/${path}`, { method: 'POST', headers });
      if (!res.ok) throw new Error(`sign upload failed: ${res.status}`);
      const { url } = (await res.json()) as { url: string };
      return `${base}${url}`;
    },
    async signRead(bucket: string, path: string, seconds: number) {
      const res = await fetch(`${base}/object/sign/${bucket}/${path}`, { method: 'POST', headers, body: JSON.stringify({ expiresIn: seconds }) });
      if (!res.ok) throw new Error(`sign read failed: ${res.status}`);
      const { signedURL } = (await res.json()) as { signedURL: string };
      return `${base}${signedURL}`;
    },
  };
}
