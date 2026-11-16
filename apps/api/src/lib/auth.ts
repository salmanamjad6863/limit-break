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
