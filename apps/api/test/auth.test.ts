import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { tokenVerifier } from '../src/lib/auth';

const ISSUER = 'https://abc.supabase.co/auth/v1';
const USER = '6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b';

let verify: (t: string) => Promise<{ userId: string }>;
let sign: (claims: Record<string, unknown>, opts?: { iss?: string; aud?: string; exp?: string }) => Promise<string>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256' };
  verify = tokenVerifier(ISSUER, createLocalJWKSet({ keys: [jwk] }));
  sign = (claims, opts = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setIssuer(opts.iss ?? ISSUER)
      .setAudience(opts.aud ?? 'authenticated')
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '1h')
      .sign(privateKey);
});

const user = { sub: USER, role: 'authenticated', is_anonymous: false, email: 'a@b.co' };

describe('access token verification', () => {
  it('accepts a signed-in email user', async () => {
    await expect(verify(await sign(user))).resolves.toEqual({ userId: USER });
  });

  it('rejects anonymous (guest) sessions', async () => {
    await expect(verify(await sign({ ...user, is_anonymous: true }))).rejects.toThrow(/anonymous/);
  });

  it('rejects other roles, bad subjects, wrong issuer/audience and expired tokens', async () => {
    await expect(verify(await sign({ ...user, role: 'service_role' }))).rejects.toThrow();
    await expect(verify(await sign({ ...user, sub: 'not-a-uuid' }))).rejects.toThrow();
    await expect(verify(await sign(user, { iss: 'https://evil.example/auth/v1' }))).rejects.toThrow();
    await expect(verify(await sign(user, { aud: 'anon' }))).rejects.toThrow();
    await expect(verify(await sign(user, { exp: '-1m' }))).rejects.toThrow();
  });

  it('rejects HS256 tokens signed with a shared secret and unsigned tokens', async () => {
    const hs = await new SignJWT(user).setProtectedHeader({ alg: 'HS256' }).setIssuer(ISSUER).setAudience('authenticated')
      .setExpirationTime('1h').sign(new TextEncoder().encode('x'.repeat(32)));
    await expect(verify(hs)).rejects.toThrow();
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ ...user, iss: ISSUER, aud: 'authenticated' })).toString('base64url')}.`;
    await expect(verify(none)).rejects.toThrow();
  });

  it('rejects a token signed by a different key', async () => {
    const other = await generateKeyPair('ES256');
    const forged = await new SignJWT(user).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setIssuer(ISSUER)
      .setAudience('authenticated').setExpirationTime('1h').sign(other.privateKey);
    await expect(verify(forged)).rejects.toThrow();
  });
});
