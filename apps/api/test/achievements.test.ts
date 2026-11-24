import type { PrismaClient } from '@lb/db';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

const USER = '00000000-0000-4000-8000-000000000001';

function fake(o: { workouts?: number; prs?: number; level?: number; rank?: string; streak?: number; sessions?: { startedAt: string; finishedAt: string; localDate: string }[] } = {}) {
  const unlocks: any[] = [];
  const ledger: any[] = [];
  const essence: any[] = [];
  const profile: any = { timezone: 'UTC', title: null };
  const state: any = { userId: USER, xp: 0, level: o.level ?? 1, rank: o.rank ?? 'E', longest: o.streak ?? 0, streak: 0, apUnspent: 0, apGrantedLevel: 1 };
  const calls: any = { where: [] as unknown[] };
  const prisma: any = {
    profile: { findUnique: async () => profile, update: async ({ data }: any) => Object.assign(profile, data) },
    hunterState: { findUnique: async () => state, update: async ({ data }: any) => Object.assign(state, data) },
    workoutSession: {
      count: async ({ where }: any) => (calls.where.push(where), where.programId ? 0 : o.workouts ?? 0),
      aggregate: async () => ({ _sum: { cardioMinutes: 0 } }),
      findMany: async () => o.sessions ?? [],
    },
    personalRecord: { count: async () => o.prs ?? 0 },
    questInstance: { count: async () => 0 },
    challenge: { count: async () => 0 },
    event: { count: async () => 0, create: async () => ({}) },
    trialAttempt: { count: async () => 0 },
    nutritionDay: { count: async () => 0 },
    $queryRaw: async () => [{ kg: 1500 }],
    achievementUnlock: {
      findMany: async () => unlocks,
      create: async ({ data }: any) => {
        if (unlocks.some((u) => u.achievementId === data.achievementId && u.tier === data.tier)) throw Object.assign(new Error('dup'), { code: 'P2002' });
        unlocks.push(data);
      },
    },
    essenceLedger: {
      findUnique: async () => null,
      aggregate: async () => ({ _sum: { amount: 0 } }),
      create: async ({ data }: any) => essence.push(data),
    },
    xpLedger: {
      aggregate: async ({ where }: any) => ({ _sum: { amount: ledger.filter((l) => l.localDate === where.localDate).reduce((s, l) => s + l.amount, 0) } }),
      create: async ({ data }: any) => ledger.push(data),
    },
    entitlement: { findFirst: async () => null },
  };
  prisma.$transaction = async (fn: any) => fn(prisma);
  const app = createApp({ prisma: prisma as PrismaClient, paywallEnabled: false, verifyToken: async () => ({ userId: USER }) });
  const req = (path: string, init: { method?: string; json?: unknown } = {}) =>
    app.request(path, { method: init.method ?? 'GET', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: init.json ? JSON.stringify(init.json) : undefined });
  return { req, unlocks, ledger, profile, calls, essence };
}

describe('achievements', () => {
  it('earns every tier reached, pays XP once per tier, and only counts live-logged workouts', async () => {
    const { req, unlocks, calls, essence } = fake({ workouts: 30, prs: 1, rank: 'D' });
    const body = (await (await req('/achievements/check', { method: 'POST' })).json()) as any;
    const got = body.rewards.filter((r: any) => r.type === 'achievement').map((r: any) => `${r.achievementId}:${r.tier}`);
    // 30 workouts → bronze + silver; 1 PR; D-Rank; 1.5 t lifted → bronze Tonnage
    expect(got).toEqual(['iron-will:0', 'iron-will:1', 'tonnage:0', 'limit-breaker:0', 'rank-up:0']);
    expect(body.rewards).toContainEqual({ type: 'xp', amount: 50, reason: 'achievement:iron-will:1' });
    expect(unlocks).toHaveLength(5);
    // Essence for cosmetics: bronze 10, silver 20 (one row per tier)
    expect(essence.filter((e: any) => e.reason === 'achievement').map((e: any) => e.amount)).toEqual([10, 20, 10, 10, 10]);
    expect(calls.where[0]).toMatchObject({ source: 'app', finishedAt: { not: null } });
    const iron = body.progress.find((p: any) => p.id === 'iron-will');
    expect(iron).toMatchObject({ value: 30, earned: 1, next: 100 });
    expect(Object.keys(iron.unlockedAt)).toEqual(['0', '1']);

    // checking again pays nothing
    const again = (await (await req('/achievements/check', { method: 'POST' })).json()) as any;
    expect(again.rewards).toEqual([]);
  });

  it('titles can be worn only once earned', async () => {
    const { req, profile } = fake({ workouts: 100 });
    expect((await req('/achievements/title', { method: 'PUT', json: { title: 'Iron Devotee' } })).status).toBe(400);
    const body = (await (await req('/achievements/check', { method: 'POST' })).json()) as any;
    expect(body.titles.map((t: any) => t.title)).toContain('Iron Devotee');
    expect((await req('/achievements/title', { method: 'PUT', json: { title: 'Iron Devotee' } })).status).toBe(200);
    expect(profile.title).toBe('Iron Devotee');
    expect(((await (await req('/achievements/check', { method: 'POST' })).json()) as any).equippedTitle).toBe('Iron Devotee');
    await req('/achievements/title', { method: 'PUT', json: { title: null } });
    expect(profile.title).toBeNull();
  });

  it('hidden achievements unlock from workout timing', async () => {
    const dawn = Array.from({ length: 7 }, (_, i) => ({
      startedAt: `2026-11-${String(10 + i).padStart(2, '0')}T05:00:00Z`, finishedAt: `2026-11-${String(10 + i).padStart(2, '0')}T05:40:00Z`, localDate: `2026-11-${String(10 + i).padStart(2, '0')}`,
    }));
    const { req } = fake({ workouts: 7, sessions: dawn });
    const body = (await (await req('/achievements/check', { method: 'POST' })).json()) as any;
    expect(body.rewards).toContainEqual({ type: 'achievement', achievementId: 'dawn-hunter', tier: 0 });
    expect(body.rewards).toContainEqual({ type: 'xp', amount: 150, reason: 'achievement:dawn-hunter:0' });
    expect(body.titles.map((t: any) => t.title)).toContain('Dawn Hunter');
  });
});
