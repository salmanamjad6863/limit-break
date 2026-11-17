/**
 * Fixed-window rate limits per caller (signed-in token, else IP). In-memory: correct for one API
 * instance; when scaling out, swap the store for Redis/Upstash behind the same interface.
 */
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../lib/types';

export interface RateRule {
  /** requests allowed per window */
  limit: number;
  windowMs: number;
}

const buckets = new Map<string, { count: number; resetAt: number }>();
let sweepAt = 0;

/** The caller key: never the raw token (only a short suffix), so logs/memory hold no credentials. */
function callerKey(auth: string | undefined, ip: string | undefined) {
  if (auth?.startsWith('Bearer ')) return `u:${auth.slice(-24)}`;
  return `ip:${ip ?? 'unknown'}`;
}

export const rateLimit = (name: string, rule: RateRule) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const now = Date.now();
    if (now > sweepAt) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
      sweepAt = now + 60_000;
    }
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip');
    const key = `${name}:${callerKey(c.req.header('authorization'), ip)}`;
    const b = buckets.get(key);
    if (!b || b.resetAt <= now) buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    else if (++b.count > rule.limit) {
      c.header('Retry-After', String(Math.ceil((b.resetAt - now) / 1000)));
      throw new HTTPException(429, { message: 'too many requests, slow down' });
    }
    await next();
  });

/** Test helper. */
export const resetRateLimits = () => buckets.clear();
