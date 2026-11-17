import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { resetRateLimits } from '../src/middleware/rateLimit';
import { USER } from './fakeDb';

const prisma: any = {
  $transaction: async (fn: any) => fn(prisma),
  nutritionDay: { deleteMany: async () => {} }, food: { deleteMany: async () => {} },
  profile: { deleteMany: async () => {}, findUnique: async () => null },
  hunterState: { findUnique: async () => null },
};
const app = createApp({ prisma, paywallEnabled: false, verifyToken: async () => ({ userId: USER }) });
const req = (method: string, path: string, body?: unknown, extra: Record<string, string> = {}) =>
  app.request(path, { method, headers: { Authorization: 'Bearer token-abc', 'Content-Type': 'application/json', ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });

describe('API hardening', () => {
  beforeEach(() => resetRateLimits());

  it('sends security headers', async () => {
    const res = await req('GET', '/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBeTruthy();
  });

  it('rejects oversized bodies', async () => {
    const res = await req('POST', '/workouts/finish', { blob: 'x'.repeat(300 * 1024) });
    expect(res.status).toBe(413);
  });

  it('limits account deletion to 5 per hour without throttling GET /me', async () => {
    for (let i = 0; i < 5; i++) expect((await req('DELETE', '/me', { confirm: 'DELETE' })).status).toBe(200);
    const sixth = await req('DELETE', '/me', { confirm: 'DELETE' });
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get('retry-after')).toBeTruthy();
    for (let i = 0; i < 10; i++) expect((await req('GET', '/me')).status).toBe(200);
  });

  it('limits per caller: another user is unaffected', async () => {
    for (let i = 0; i < 6; i++) await req('DELETE', '/me', { confirm: 'DELETE' });
    expect((await req('DELETE', '/me', { confirm: 'DELETE' }, { Authorization: 'Bearer other-user-token-zzzzzzzzzzzz' })).status).toBe(200);
  });
});
