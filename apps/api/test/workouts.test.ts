import type { PrismaClient } from '@lb/db';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

const USER = '00000000-0000-4000-8000-000000000001';

/** Minimal in-memory Prisma double covering what finishWorkout uses. */
function fakeDb() {
  const db = {
    events: new Map<string, any>(),
    sessions: [] as any[],
    sets: [] as any[],
    ledger: [] as any[],
    records: [{ exerciseId: 'bench-press', e1rmKg: 90 }] as any[],
    state: { userId: USER, xp: 0, level: 1, apUnspent: 0 },
  };
  const tx = {
    event: { findUnique: async ({ where }: any) => db.events.get(where.id) ?? null, create: async ({ data }: any) => db.events.set(data.id, data) },
    profile: { findUnique: async () => ({ timezone: 'UTC' }) },
    hunterState: {
      findUnique: async () => db.state,
      update: async ({ data }: any) => {
        db.state = { ...db.state, xp: data.xp, level: data.level, apUnspent: db.state.apUnspent + data.apUnspent.increment };
      },
    },
    bodyMetric: { findFirst: async () => ({ weightKg: 80 }) },
    personalRecord: { findMany: async () => db.records, createMany: async ({ data }: any) => db.records.push(...data) },
    xpLedger: {
      aggregate: async () => ({ _sum: { amount: db.ledger.reduce((s, l) => s + l.amount, 0) } }),
      create: async ({ data }: any) => db.ledger.push(data),
    },
    workoutSession: { create: async ({ data }: any) => db.sessions.push(data) },
    workoutSet: { createMany: async ({ data }: any) => db.sets.push(...data) },
  };
  const prisma = { ...tx, $transaction: async (fn: any) => fn(tx), entitlement: { findFirst: async () => null } } as unknown as PrismaClient;
  return { db, prisma };
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const set = (n: number, o: Record<string, unknown> = {}) => ({
  id: uuid(100 + n), exerciseId: 'bench-press', order: n, reps: 5, weightKg: 100, rir: 2, rpe: null,
  durationS: null, distanceM: null, isWarmup: false, completedAt: '2026-11-17T10:00:00Z', ...o,
});
const body = (sets: unknown[]) => ({
  id: uuid(1), plannedWorkoutId: null, programId: 'linear-strength', dayId: 'a', sessionRpe: 8, cardio: [],
  startedAt: '2026-11-17T09:00:00Z', finishedAt: '2026-11-17T10:00:00Z', plannedHardSets: 3, sets,
});

describe('POST /workouts/finish', () => {
  const post = (prisma: PrismaClient, b: unknown) =>
    createApp({ prisma, paywallEnabled: false, verifyToken: async () => ({ userId: USER }) }).request('/workouts/finish', {
      method: 'POST', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: JSON.stringify(b),
    });

  it('grants XP, detects the PR, levels up and writes the ledger', async () => {
    const { db, prisma } = fakeDb();
    const res = await post(prisma, body([set(1), set(2), set(3)]));
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.granted).toBe(30 + 50 + 25); // 3 sets, completion bonus, 1 PR
    expect(json.prs[0].exerciseId).toBe('bench-press');
    expect(json.level).toBe(2);
    expect(db.ledger[0].amount).toBe(105);
    expect(db.sets.length).toBe(3);
    expect(db.state.xp).toBe(105);
  });

  it('is idempotent: the same workout id never pays twice', async () => {
    const { db, prisma } = fakeDb();
    await post(prisma, body([set(1)]));
    const again = (await (await post(prisma, body([set(1)]))).json()) as any;
    expect(again.duplicate).toBe(true);
    expect(db.ledger.length).toBe(1);
    expect(db.sessions.length).toBe(1);
  });

  it('implausible sets are stored but earn nothing, and the event is flagged', async () => {
    const { db, prisma } = fakeDb();
    const json = (await (await post(prisma, body([set(1, { weightKg: 900 })]))).json()) as any;
    expect(json.granted).toBe(0);
    expect(db.events.get(uuid(1)).flagged).toBe(true);
  });
});
