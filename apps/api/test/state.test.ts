import { programs } from '@lb/content';
import type { PrismaClient } from '@lb/db';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

const USER = '00000000-0000-4000-8000-000000000001';
const PROGRAM = programs[0]!.id;

function fake() {
  const profile: any = { activeProgramId: null, programStartedAt: null, avoidExercises: [] as string[] };
  const calls: any = { count: null as any, raw: [] as unknown[] };
  const prisma = {
    profile: {
      findUnique: async () => profile,
      update: async ({ data }: any) => Object.assign(profile, data),
    },
    workoutSession: {
      findMany: async () => [],
      count: async (a: any) => ((calls.count = a), 4),
    },
    workoutSet: { findMany: async () => [] },
    personalRecord: {
      findMany: async () => [],
      groupBy: async () => [{ exerciseId: 'push-up', _max: { e1rmKg: 41.26 } }, { exerciseId: 'squat', _max: { e1rmKg: null } }],
    },
    exerciseNote: { findMany: async () => [{ exerciseId: 'push-up', note: 'elbows in' }] },
    $queryRaw: async (...args: unknown[]) => (calls.raw.push(args), [{ exerciseId: 'push-up', reps: 12, weightKg: null }]),
    entitlement: { findFirst: async () => null },
  } as unknown as PrismaClient;
  const app = createApp({ prisma, paywallEnabled: false, verifyToken: async () => ({ userId: USER }) });
  const req = (path: string, init: { method?: string; json?: unknown } = {}) =>
    app.request(path, {
      method: init.method ?? 'GET',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: init.json ? JSON.stringify(init.json) : undefined,
    });
  return { req, profile, calls };
}

describe('training state (restore on a new phone)', () => {
  it('returns program, rotation, best lifts, last sets, notes and pain flags', async () => {
    const { req, profile, calls } = fake();
    profile.activeProgramId = PROGRAM;
    profile.programStartedAt = new Date('2026-11-01T00:00:00Z');
    profile.avoidExercises = ['push-up'];
    const res = await req('/workouts/state');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toMatchObject({
      activeProgramId: PROGRAM, completedSessions: 4, recent: [],
      bestE1rm: { 'push-up': 41.3 }, lastSet: { 'push-up': { reps: 12, loadKg: null } },
      avoid: ['push-up'], notes: { 'push-up': 'elbows in' },
    });
    // rotation only counts this program's sessions since it was picked
    expect(calls.count.where).toMatchObject({ userId: USER, kind: 'program', programId: PROGRAM, finishedAt: { gte: profile.programStartedAt } });
    // the user id is a bound SQL parameter, not part of the query text
    const [strings, ...values] = calls.raw[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join('')).not.toContain(USER);
    expect(values).toContain(USER);
  });

  it('picking a program saves it and restarts the rotation; unknown ids are rejected', async () => {
    const { req, profile } = fake();
    expect((await req('/workouts/program', { method: 'PUT', json: { programId: 'nope' } })).status).toBe(400);
    expect((await req('/workouts/program', { method: 'PUT', json: { programId: PROGRAM } })).status).toBe(200);
    expect(profile.activeProgramId).toBe(PROGRAM);
    expect(profile.programStartedAt).toBeInstanceOf(Date);
  });

  it('pain flags add and remove; unknown exercises are rejected', async () => {
    const { req, profile } = fake();
    expect((await req('/workouts/avoid', { method: 'PUT', json: { exerciseId: 'not-real', avoid: true } })).status).toBe(400);
    await req('/workouts/avoid', { method: 'PUT', json: { exerciseId: 'push-up', avoid: true } });
    await req('/workouts/avoid', { method: 'PUT', json: { exerciseId: 'push-up', avoid: true } });
    expect(profile.avoidExercises).toEqual(['push-up']);
    await req('/workouts/avoid', { method: 'PUT', json: { exerciseId: 'push-up', avoid: false } });
    expect(profile.avoidExercises).toEqual([]);
  });
});
