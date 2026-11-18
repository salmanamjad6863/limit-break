import { afterEach, describe, expect, it, vi } from 'vitest';

describe('env', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('treats blank optional keys (KEY=) as unset instead of failing', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://x@localhost/x');
    vi.stubEnv('SUPABASE_URL', 'https://abc.supabase.co');
    vi.stubEnv('SENTRY_DSN', '');
    vi.stubEnv('MODERATOR_IDS', '');
    vi.stubEnv('PAYWALL_ENABLED', '');
    vi.resetModules();
    const { env } = await import('../src/lib/env');
    const e = env();
    expect(e.SENTRY_DSN).toBeUndefined();
    expect(e.MODERATOR_IDS).toBeUndefined();
    expect(e.PAYWALL_ENABLED).toBe(false);
  });
  it('still rejects a malformed value that is actually set', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://x@localhost/x');
    vi.stubEnv('SUPABASE_URL', 'https://abc.supabase.co');
    vi.stubEnv('SENTRY_DSN', 'not a url');
    vi.resetModules();
    const { env } = await import('../src/lib/env');
    expect(() => env()).toThrow();
  });
});
