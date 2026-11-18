import type { PrismaClient } from '@lb/db';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { fakeDb, USER, uuid } from './fakeDb';

const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const set = (n: number, o: Record<string, unknown> = {}) => ({
  id: uuid(100 + n), exerciseId: 'bench-press', order: n, reps: 5, weightKg: 100, rir: 2, rpe: null,
  durationS: null, distanceM: null, isWarmup: false, completedAt: iso(60_000), ...o,
});
const body = (sets: unknown[], o: Record<string, unknown> = {}) => ({
  id: uuid(1), plannedWorkoutId: null, programId: 'linear-strength', dayId: 'a', sessionRpe: 8, cardio: [],
  startedAt: iso(3_600_000), finishedAt: iso(0), plannedHardSets: 3, sets, ...o,
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

  it('rejects client finish times that would dodge the daily cap; clamps absurd durations', async () => {
    const { db, prisma } = fakeDb();
    const H = 3_600_000;
    expect((await post(prisma, body([set(1)], { finishedAt: iso(-2 * H) }))).status).toBe(400); // in the future
    expect((await post(prisma, body([set(1)], { startedAt: iso(H), finishedAt: iso(2 * H) }))).status).toBe(400); // ends before it starts
    expect((await post(prisma, body([set(1)], { startedAt: iso(9 * 24 * H), finishedAt: iso(8 * 24 * H) }))).status).toBe(400); // older than 7 days
    expect(db.ledger).toHaveLength(0);
    expect((await post(prisma, body([set(1)], { finishedAt: iso(-60_000) }))).status).toBe(200); // small clock skew is fine
    const long = await post(prisma, body([set(1)], { id: uuid(2), startedAt: iso(30 * H), finishedAt: iso(H) }));
    expect(long.status).toBe(200);
    const s = db.sessions.find((x) => x.id === uuid(2));
    expect(s.finishedAt.getTime() - s.startedAt.getTime()).toBe(6 * H);
  });

  it('AP is paid once per level: edit-down/edit-up and delete + re-finish never re-grant it', async () => {
    const { db, prisma } = fakeDb();
    const app = createApp({ prisma, paywallEnabled: false, verifyToken: async () => ({ userId: USER }) });
    const call = (method: string, path: string, b: unknown) =>
      app.request(path, { method, headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    await post(prisma, body([set(1), set(2), set(3)]));
    expect(db.state.level).toBe(2);
    const ap = db.state.apUnspent;
    expect(ap).toBeGreaterThan(0);
    // edit down below level 2, then back up
    await call('PATCH', `/workouts/${uuid(1)}`, { editId: uuid(50), sets: [set(1, { weightKg: 70 })], notes: null, sessionRpe: 7 });
    expect(db.state.level).toBe(1);
    await call('PATCH', `/workouts/${uuid(1)}`, { editId: uuid(51), sets: [set(1), set(2), set(3)], notes: null, sessionRpe: 7 });
    expect(db.state.level).toBe(2);
    expect(db.state.apUnspent).toBe(ap);
    // delete and finish it again under a new id
    await app.request(`/workouts/${uuid(1)}`, { method: 'DELETE', headers: { Authorization: 'Bearer x' } });
    expect(db.state.level).toBe(1);
    const again = (await (await post(prisma, body([set(11), set(12), set(13)], { id: uuid(3) }))).json()) as any;
    expect(again.level).toBe(2);
    expect(again.rewards.find((r: any) => r.type === 'levelUp').ap).toBe(0);
    expect(db.state.apUnspent).toBe(ap);
  });

  it('a concurrent duplicate finish (unique violation) answers as a duplicate, not a 500', async () => {
    const { db, prisma } = fakeDb();
    const first = (await (await post(prisma, body([set(1)]))).json()) as any;
    // the racing copy passed the "already exists?" check before the winner committed
    const racing = { ...prisma, $transaction: async () => { throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }); } } as any;
    const res = await post(racing, body([set(1)]));
    expect(res.status).toBe(200);
    expect(((await res.json()) as any)).toMatchObject({ duplicate: true, granted: first.granted });
    expect(db.ledger).toHaveLength(1);
  });

  it('edits reuse the finished cardio entries (same XP as finish)', async () => {
    const { db, prisma } = fakeDb();
    const app = createApp({ prisma, paywallEnabled: false, verifyToken: async () => ({ userId: USER }) });
    const cardio = [{ minutes: 20, rpe: 9 }, { minutes: 20, rpe: 3 }];
    const r = (await (await post(prisma, body([], { kind: 'quick', plannedHardSets: 0, cardio }))).json()) as any;
    expect(db.sessions[0].cardio).toEqual(cardio);
    const e = (await (await app.request(`/workouts/${uuid(1)}`, {
      method: 'PATCH', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' },
      body: JSON.stringify({ editId: uuid(52), sets: [], notes: 'n', sessionRpe: 5 }),
    })).json()) as any;
    expect(e.xp).toBe(r.granted);
    expect(e.delta).toBe(0);
  });
});
