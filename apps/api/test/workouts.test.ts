import type { PrismaClient } from '@lb/db';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { fakeDb, USER, uuid } from './fakeDb';

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
    // stats recomputed from real data after the workout
    expect(db.state.str).toBeGreaterThan(10);
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
