import type { PrismaClient } from '@lb/db';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

const fakePrisma = {
  profile: { findUnique: async () => null },
  entitlement: { findFirst: async () => null },
} as unknown as PrismaClient;

const app = (paywallEnabled = false) =>
  createApp({
    prisma: fakePrisma,
    paywallEnabled,
    verifyToken: async (t) => {
      if (t !== 'good') throw new Error('bad');
      return { userId: '00000000-0000-4000-8000-000000000001' };
    },
  });

describe('api shell', () => {
  it('health is public', async () => {
    const res = await app().request('/health');
    expect(res.status).toBe(200);
  });
  it('/me requires a valid token', async () => {
    expect((await app().request('/me')).status).toBe(401);
    expect((await app().request('/me', { headers: { Authorization: 'Bearer nope' } })).status).toBe(401);
    const ok = await app().request('/me', { headers: { Authorization: 'Bearer good' } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ onboarded: false, state: null });
  });
  it('feature gates are open while the paywall is off, and close premium-only when on', async () => {
    const h = { headers: { Authorization: 'Bearer good' } };
    const off = (await (await app(false).request('/features', h)).json()) as any;
    expect(off.features.aiPhotoLog.enabled).toBe(true);
    const on = (await (await app(true).request('/features', h)).json()) as any;
    expect(on.features.aiPhotoLog.enabled).toBe(false);
    expect(on.features.logger.enabled).toBe(true);
  });
  it('onboarding validates input', async () => {
    const res = await app().request('/me/onboarding', {
      method: 'POST', headers: { Authorization: 'Bearer good', 'Content-Type': 'application/json' },
      body: JSON.stringify({ hunterName: 'x' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('onboarding', () => {
  it('creates HunterState with assessment stats and 200 XP', async () => {
    const calls: Record<string, any> = {};
    const prisma = {
      profile: {
        upsert: (a: any) => ((calls.profile = a), a),
        findUnique: async () => ({ onboardedAt: new Date(), hunterName: 'Ren', heroId: 'ren', heroClass: 'HYBRID', state: null }),
      },
      hunterState: { upsert: (a: any) => ((calls.state = a), a) },
      bodyMetric: { create: (a: any) => ((calls.weight = a), a), findFirst: async () => ({ weightKg: 80 }) },
      $transaction: async (ops: unknown[]) => ops,
      entitlement: { findFirst: async () => null },
    } as unknown as PrismaClient;
    const a = createApp({ prisma, paywallEnabled: false, verifyToken: async () => ({ userId: '00000000-0000-4000-8000-000000000001' }) });
    const body = {
      hunterName: 'Ren', heroId: 'ren', goal: 'cut', experience: 'novice', location: 'HOME', equipment: [],
      daysPerWeek: 4, sessionMinutes: 45, questTime: '07:00', heroClass: 'HYBRID', sex: 'male',
      birthDate: '2000-01-01', heightCm: 178, weightKg: 80, bodyFatPct: null, lifestyle: 'light',
      injuries: [], parqAnyYes: false, nutritionMode: 'full', fatPreference: 'balanced', timezone: 'Asia/Karachi',
      assessment: { pushups: 22, plankSec: 80, squats60: 40 }, notificationsOptIn: true,
    };
    const res = await a.request('/me/onboarding', {
      method: 'POST', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    expect(calls.state.create).toMatchObject({ xp: 200, level: 2, str: 50, end: 50 });
    expect(calls.profile.create.baselines).toEqual(body.assessment);
    expect(calls.weight.data).toMatchObject({ weightKg: 80, source: 'onboarding' });
  });
});
