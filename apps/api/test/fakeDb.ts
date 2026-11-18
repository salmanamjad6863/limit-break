import type { PrismaClient } from '@lb/db';

export const USER = '00000000-0000-4000-8000-000000000001';
export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** In-memory Prisma double covering what the workout and progression services use. */
/** Minimal Prisma `where` matcher: equality, {gte,lte}, {in}, {not}. */
export function matches(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([k, cond]) => {
    const v = row[k];
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
      const c = cond as any;
      if ('in' in c) return c.in.includes(v);
      if ('not' in c) return v !== c.not;
      if ('gte' in c || 'lte' in c) return (c.gte == null || v >= c.gte) && (c.lte == null || v <= c.lte);
      return true; // nested relation filters ignored
    }
    return v === cond;
  });
}

export function fakeDb(opts: { level?: number; xp?: number; rank?: string; baselines?: unknown; streak?: Record<string, unknown>; onboarded?: string } = {}) {
  const db = {
    events: new Map<string, any>(),
    sessions: [] as any[],
    sets: [] as any[],
    ledger: [] as any[],
    trials: [] as any[],
    quests: [] as any[],
    records: [{ userId: USER, exerciseId: 'bench-press', e1rmKg: 90, achievedAt: new Date('2026-11-01'), setId: null }] as any[],
    notes: [] as any[],
    state: {
      userId: USER, xp: opts.xp ?? 0, level: opts.level ?? 1, apUnspent: 0, rank: opts.rank ?? 'E', str: 10, agi: 10, end: 10, vit: 10, spi: 10,
      streak: 0, longest: 0, shields: 2, questScale: 0.6, consecutiveFails: 0, shieldsMonth: null, penaltyDate: null, lastResolved: null, sickDates: [],
      ...(opts.streak ?? {}),
    } as any,
    profile: {
      id: USER, timezone: 'UTC', sex: 'male', birthDate: new Date('1998-01-01'), experience: 'novice', daysPerWeek: 3,
      hunterName: 'Ren', heroId: 'ren', heroClass: 'HYBRID', questTime: '07:00', notificationsOptIn: true,
      baselines: opts.baselines ?? { pushups: 22, plankSec: 80, squats60: 40 }, onboardedAt: new Date(opts.onboarded ?? '2026-11-01T12:00:00Z'),
      createdAt: new Date('2026-11-01'), injuries: [] as string[], location: 'HOME',
    },
  };
  const tx = {
    event: {
      findUnique: async ({ where }: any) => db.events.get(where.id) ?? null,
      create: async ({ data }: any) => db.events.set(data.id, data),
      update: async ({ where, data }: any) => db.events.set(where.id, { ...db.events.get(where.id), ...data }),
    },
    profile: {
      findUnique: async () => db.profile,
      update: async ({ data }: any) => Object.assign(db.profile, data),
    },
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
      findMany: async ({ where }: any = {}) => db.records.filter((r) => matches(r, where)),
      deleteMany: async ({ where }: any) => { db.records = db.records.filter((r) => !matches(r, where)); },
      createMany: async ({ data }: any) => db.records.push(...data.map((d: any) => ({ ...d, achievedAt: d.achievedAt ?? new Date() }))),
    },
    xpLedger: {
      aggregate: async () => ({ _sum: { amount: db.ledger.reduce((s, l) => s + l.amount, 0) } }),
      create: async ({ data }: any) => db.ledger.push({ ...data, createdAt: new Date() }),
      findMany: async () => db.ledger,
    },
    workoutSession: {
      create: async ({ data }: any) => db.sessions.push({ kind: 'program', source: 'app', name: null, notes: null, sessionRpe: null, xpGranted: 0, cardioMinutes: 0, finishedAt: null, plannedHardSets: 0, ...data }),
      findMany: async ({ where, include }: any = {}) =>
        db.sessions.filter((x) => matches(x, where)).map((x) => ({ ...x, cardioMinutes: x.cardioMinutes ?? 0, ...(include?.sets ? { sets: db.sets.filter((st) => st.sessionId === x.id) } : {}) })),
      findUnique: async ({ where }: any) => {
        const x = db.sessions.find((r) => r.id === where.id);
        return x ? { ...x, sets: db.sets.filter((st) => st.sessionId === x.id).map((st) => ({ ...st, completedAt: new Date(st.completedAt) })) } : null;
      },
      update: async ({ where, data }: any) => Object.assign(db.sessions.find((r) => r.id === where.id), data),
      delete: async ({ where }: any) => {
        db.sessions = db.sessions.filter((r) => r.id !== where.id);
        db.sets = db.sets.filter((st) => st.sessionId !== where.id);
      },
      count: async () => db.sessions.length,
      findFirst: async () => (db.sessions.length ? { startedAt: new Date(db.sessions.at(-1).startedAt) } : null),
    },
    workoutSet: {
      createMany: async ({ data }: any) => db.sets.push(...data.map((d: any) => ({ setType: 'normal', ...d }))),
      deleteMany: async ({ where }: any) => { db.sets = db.sets.filter((st) => !matches(st, where)); },
      findMany: async ({ where }: any = {}) =>
        where?.sessionId ? db.sets.filter((s) => matches(s, where)) : db.sets.filter((s) => !s.isWarmup && (s.reps ?? 0) >= 5).map((s) => ({ exerciseId: s.exerciseId })),
      count: async () => db.sets.filter((s) => !s.isWarmup).length,
    },
    trialAttempt: {
      findMany: async () => [...db.trials].reverse().map((t) => ({ ...t, results: t.results })),
      create: async ({ data }: any) => db.trials.push({ ...data, createdAt: new Date() }),
    },
    questInstance: {
      findMany: async ({ where }: any = {}) => db.quests.filter((q) => matches(q, where)),
      findFirst: async ({ where }: any = {}) => db.quests.find((q) => matches(q, where)) ?? null,
      count: async ({ where }: any = {}) => db.quests.filter((q) => matches(q, where)).length,
      create: async ({ data }: any) => {
        if (db.quests.some((q) => q.userId === data.userId && q.localDate === data.localDate && q.templateId === data.templateId)) throw new Error('unique violation');
        const row = { status: 'ACTIVE', completedAt: null, ...data };
        db.quests.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const q = db.quests.find((x) => x.id === where.id);
        Object.assign(q, data);
        return q;
      },
      delete: async ({ where }: any) => {
        db.quests = db.quests.filter((x) => x.id !== where.id);
      },
    },
    entitlement: { findFirst: async () => null },
    exerciseNote: {
      findMany: async () => db.notes,
      deleteMany: async ({ where }: any) => { db.notes = db.notes.filter((n) => !matches(n, where)); },
      upsert: async ({ where, create, update }: any) => {
        const n = db.notes.find((x) => x.exerciseId === where.userId_exerciseId.exerciseId);
        if (n) Object.assign(n, update); else db.notes.push(create);
      },
    },
  };
  const prisma = { ...tx, $transaction: async (fn: any) => fn(tx) } as unknown as PrismaClient;
  return { db, prisma };
}
