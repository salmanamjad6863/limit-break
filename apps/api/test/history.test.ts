import { gameDate } from '@lb/engine';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { fakeDb, USER, uuid } from './fakeDb';

const OTHER = '00000000-0000-4000-8000-0000000000ff';
const now = new Date();
const today = gameDate(now, 'UTC');
const set = (n: number, o: Record<string, unknown> = {}) => ({
  id: uuid(100 + n), exerciseId: 'bench-press', order: n, reps: 5, weightKg: 100, rir: 2, rpe: null,
  durationS: null, distanceM: null, isWarmup: false, setType: 'normal', completedAt: now.toISOString(), ...o,
});
const finish = (sets: unknown[]) => ({
  id: uuid(1), plannedWorkoutId: null, programId: 'linear-strength', dayId: 'a', sessionRpe: 8, cardio: [], kind: 'program', name: 'Workout A', notes: 'felt strong',
  startedAt: new Date(now.getTime() - 3_600_000).toISOString(), finishedAt: now.toISOString(), plannedHardSets: 3, sets,
});
const call = (prisma: any, method: string, path: string, body?: unknown) =>
  createApp({ prisma, paywallEnabled: false, verifyToken: async () => ({ userId: USER }) }).request(path, {
    method, headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async (r: Response) => (await r.json()) as any;

describe('Workout history (SYSTEMS.md §3.11)', () => {
  it('lists and details finished workouts with name, notes, set types and PRs', async () => {
    const { prisma } = fakeDb();
    await call(prisma, 'POST', '/workouts/finish', finish([set(1), set(2), set(3, { setType: 'failure' })]));
    const list = await json(await call(prisma, 'GET', '/workouts'));
    expect(list.workouts[0]).toMatchObject({ id: uuid(1), name: 'Workout A', notes: 'felt strong', workingSets: 3, volumeKg: 1500, xp: 105, kind: 'program' });
    expect(list.workouts[0].prs[0].exerciseId).toBe('bench-press');
    const detail = await json(await call(prisma, 'GET', `/workouts/${uuid(1)}`));
    expect(detail.sets.map((s: any) => s.setType)).toEqual(['normal', 'normal', 'failure']);
  });

  it('edits recompute XP as a diff, idempotently, and drop a PR the edit removes', async () => {
    const { db, prisma } = fakeDb();
    await call(prisma, 'POST', '/workouts/finish', finish([set(1), set(2), set(3)]));
    expect(db.state.xp).toBe(105);
    // fix a typo: the sets were 70 kg, not 100 (e1RM ≈ 86 < 90 best) → no PR, one set removed
    const edit = { editId: uuid(50), sets: [set(1, { weightKg: 70 }), set(2, { weightKg: 70 })], notes: 'fixed', sessionRpe: 7 };
    const r = await json(await call(prisma, 'PATCH', `/workouts/${uuid(1)}`, edit));
    expect(r.xp).toBe(20); // 2 sets × 10, no completion bonus (2 of 3 planned), no PR
    expect(r.delta).toBe(-85);
    expect(db.state.xp).toBe(20);
    expect(db.records.filter((x) => x.setId)).toHaveLength(0);
    const again = await json(await call(prisma, 'PATCH', `/workouts/${uuid(1)}`, edit));
    expect(again.delta).toBe(-85);
    expect(db.state.xp).toBe(20); // the retry changed nothing
    expect(db.ledger.reduce((s, l) => s + l.amount, 0)).toBe(20);
  });

  it('deletes within 7 days (XP reversed), locks after', async () => {
    const { db, prisma } = fakeDb();
    await call(prisma, 'POST', '/workouts/finish', finish([set(1)]));
    const gained = db.state.xp;
    expect((await call(prisma, 'DELETE', `/workouts/${uuid(1)}`)).status).toBe(200);
    expect(db.state.xp).toBe(0);
    expect(gained).toBeGreaterThan(0);
    expect(db.sessions).toHaveLength(0);
    db.sessions.push({ id: uuid(9), userId: USER, localDate: '2020-01-01', startedAt: new Date('2020-01-01'), xpGranted: 50, kind: 'program', source: 'app', cardioMinutes: 0, plannedHardSets: 0 });
    expect((await call(prisma, 'DELETE', `/workouts/${uuid(9)}`)).status).toBe(409);
    db.sessions.push({ id: uuid(10), userId: OTHER, localDate: today, startedAt: new Date(), xpGranted: 0, kind: 'program', source: 'app', cardioMinutes: 0, plannedHardSets: 0 });
    expect((await call(prisma, 'DELETE', `/workouts/${uuid(10)}`)).status).toBe(404);
  });

  it('manual logs earn real-minutes XP, are unverified, and only for the last 7 days', async () => {
    const { db, prisma } = fakeDb();
    const log = { id: uuid(70), type: 'sport', name: 'Football', minutes: 60, rpe: 7, localDate: today, distanceKm: null, notes: null };
    const r = await json(await call(prisma, 'POST', '/workouts/manual', log));
    expect(r.granted).toBeGreaterThan(0);
    expect(db.ledger.at(-1)).toMatchObject({ reason: 'manual', amount: r.granted });
    expect(db.sessions[0]).toMatchObject({ kind: 'manual', source: 'manual', name: 'Football' });
    await call(prisma, 'POST', '/workouts/manual', log);
    expect(db.sessions).toHaveLength(1); // idempotent
    expect((await call(prisma, 'POST', '/workouts/manual', { ...log, id: uuid(71), localDate: '2020-01-01' })).status).toBe(400);
  });

  it('sticky exercise notes save, show and clear', async () => {
    const { prisma } = fakeDb();
    await call(prisma, 'PUT', '/workouts/notes/bench-press', { note: 'Seat 4, grip on the rings' });
    expect((await json(await call(prisma, 'GET', '/workouts/notes'))).notes).toEqual({ 'bench-press': 'Seat 4, grip on the rings' });
    await call(prisma, 'PUT', '/workouts/notes/bench-press', { note: '' });
    expect((await json(await call(prisma, 'GET', '/workouts/notes'))).notes).toEqual({});
    expect((await call(prisma, 'PUT', '/workouts/notes/not-real', { note: 'x' })).status).toBe(400);
  });
});
