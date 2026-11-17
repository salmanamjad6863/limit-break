import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Verifies Supabase access tokens against the project's JWKS (asymmetric signing keys).
 * Supabase → Project Settings → JWT Keys: use the new asymmetric keys (ES256/RS256).
 */
export function supabaseVerifier(supabaseUrl: string) {
  const issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return async (token: string) => {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: 'authenticated' });
    if (!payload.sub) throw new Error('token has no subject');
    return { userId: payload.sub };
  };
}

/** Deletes the auth user with the service role (Supabase Admin API). Profile rows cascade from auth.users (0002). */
export function supabaseAdminDeleter(supabaseUrl: string, serviceRoleKey: string) {
  return async (userId: string) => {
    const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!res.ok && res.status !== 404) throw new Error(`auth delete failed: ${res.status}`);
  };
}

/** Supabase Storage signed URLs with the service role (uploads go straight from the phone to storage). */
export function supabaseStorage(supabaseUrl: string, serviceRoleKey: string) {
  const base = `${supabaseUrl.replace(/\/$/, '')}/storage/v1`;
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' };
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
