import type { PrismaClient } from '@lb/db';

export const USER = '00000000-0000-4000-8000-000000000001';
export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** In-memory Prisma double covering what the workout and progression services use. */
export function fakeDb(opts: { level?: number; xp?: number; rank?: string; baselines?: unknown } = {}) {
  const db = {
    events: new Map<string, any>(),
    sessions: [] as any[],
    sets: [] as any[],
    ledger: [] as any[],
    trials: [] as any[],
    records: [{ exerciseId: 'bench-press', e1rmKg: 90, achievedAt: new Date('2026-11-01') }] as any[],
    state: { userId: USER, xp: opts.xp ?? 0, level: opts.level ?? 1, apUnspent: 0, rank: opts.rank ?? 'E', str: 10, agi: 10, end: 10, vit: 10, spi: 10 } as any,
    profile: {
      id: USER, timezone: 'UTC', sex: 'male', birthDate: new Date('1998-01-01'), experience: 'novice', daysPerWeek: 3,
      heroClass: 'HYBRID', baselines: opts.baselines ?? { pushups: 22, plankSec: 80, squats60: 40 }, onboardedAt: new Date('2026-11-01'),
    },
  };
  const tx = {
    event: {
      findUnique: async ({ where }: any) => db.events.get(where.id) ?? null,
      create: async ({ data }: any) => db.events.set(data.id, data),
      update: async ({ where, data }: any) => db.events.set(where.id, { ...db.events.get(where.id), ...data }),
    },
    profile: { findUnique: async () => db.profile },
    hunterState: {
      findUnique: async () => db.state,
      update: async ({ data }: any) => {
        const next = { ...db.state };
        for (const [k, v] of Object.entries(data)) next[k] = typeof v === 'object' && v && 'increment' in (v as any) ? db.state[k] + (v as any).increment : v;
        db.state = next;
      },
    },
    bodyMetric: { findFirst: async () => ({ weightKg: 80 }) },
    personalRecord: {
      findMany: async () => db.records,
      createMany: async ({ data }: any) => db.records.push(...data.map((d: any) => ({ ...d, achievedAt: d.achievedAt ?? new Date() }))),
    },
    xpLedger: {
      aggregate: async () => ({ _sum: { amount: db.ledger.reduce((s, l) => s + l.amount, 0) } }),
      create: async ({ data }: any) => db.ledger.push({ ...data, createdAt: new Date() }),
      findMany: async () => db.ledger,
    },
    workoutSession: {
      create: async ({ data }: any) => db.sessions.push(data),
      count: async () => db.sessions.length,
      findFirst: async () => (db.sessions.length ? { startedAt: new Date(db.sessions.at(-1).startedAt) } : null),
    },
    workoutSet: {
      createMany: async ({ data }: any) => db.sets.push(...data),
      findMany: async () => db.sets.filter((s) => !s.isWarmup && (s.reps ?? 0) >= 5).map((s) => ({ exerciseId: s.exerciseId })),
      count: async () => db.sets.filter((s) => !s.isWarmup).length,
    },
    trialAttempt: {
      findMany: async () => [...db.trials].reverse().map((t) => ({ ...t, results: t.results })),
      create: async ({ data }: any) => db.trials.push({ ...data, createdAt: new Date() }),
    },
    entitlement: { findFirst: async () => null },
  };
  const prisma = { ...tx, $transaction: async (fn: any) => fn(tx) } as unknown as PrismaClient;
  return { db, prisma };
}
