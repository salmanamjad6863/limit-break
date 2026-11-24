import type { PrismaClient } from '@lb/db';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

const USER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const RID = '11111111-1111-4111-8111-111111111111';

function fake() {
  const profile: any = { activeProgramId: null, programStartedAt: null, avoidExercises: [] as string[] };
  const rows = new Map<string, any>();
  const prisma = {
    profile: {
      findUnique: async () => profile,
      update: async ({ data }: any) => Object.assign(profile, data),
    },
    customRoutine: {
      findMany: async ({ where }: any) => [...rows.values()].filter((r) => r.userId === where.userId),
      findUnique: async ({ where }: any) => rows.get(where.id) ?? null,
      count: async ({ where }: any) => [...rows.values()].filter((r) => r.userId === where.userId && (!where.id || r.id === where.id)).length,
      create: async ({ data }: any) => (rows.set(data.id, { createdAt: new Date(), ...data }), rows.get(data.id)),
      update: async ({ where, data }: any) => Object.assign(rows.get(where.id), data),
      deleteMany: async ({ where }: any) => {
        const r = rows.get(where.id);
        if (!r || r.userId !== where.userId) return { count: 0 };
        rows.delete(where.id);
        return { count: 1 };
      },
    },
    entitlement: { findFirst: async () => null },
  } as unknown as PrismaClient;
  const app = createApp({ prisma, paywallEnabled: false, verifyToken: async () => ({ userId: USER }) });
  const req = (path: string, init: { method?: string; json?: unknown } = {}) =>
    app.request(path, {
      method: init.method ?? 'GET',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: init.json ? JSON.stringify(init.json) : undefined,
    });
  return { req, profile, rows };
}

const routine = (o: Record<string, unknown> = {}) => ({
  id: RID,
  name: 'My PPL',
  days: [
    { id: 'push', name: 'Push', slots: [{ exerciseId: 'push-up', sets: 3, reps: [8, 12], rir: 2, restSeconds: 90, superset: null }] },
    { id: 'legs', name: 'Legs', slots: [{ exerciseId: 'plank', sets: 3, seconds: [30, 45], rir: 2 }] },
  ],
  schedule: { '1': 'push', '4': 'legs' },
  updatedAt: '2026-11-24T10:00:00.000Z',
  ...o,
});

describe('own routines', () => {
  it('saves, lists and comes back in the restore state', async () => {
    const { req } = fake();
    const res = await req(`/workouts/routines/${RID}`, { method: 'PUT', json: routine() });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).stale).toBe(false);
    const list = (await (await req('/workouts/routines')).json()) as any;
    expect(list.routines).toHaveLength(1);
    expect(list.routines[0]).toMatchObject({ name: 'My PPL', schedule: { '1': 'push', '4': 'legs' } });
  });

  it('rejects bad routines: unknown exercises, empty days, schedule to a missing day, path/body mismatch', async () => {
    const { req } = fake();
    const put = (body: unknown, id = RID) => req(`/workouts/routines/${id}`, { method: 'PUT', json: body });
    expect((await put(routine({ days: [{ id: 'a', name: 'A', slots: [{ exerciseId: 'not-real', sets: 3, reps: [8, 12], rir: 2 }] }], schedule: { '1': 'a' } }))).status).toBe(400);
    expect((await put(routine({ days: [{ id: 'a', name: 'A', slots: [] }], schedule: { '1': 'a' } }))).status).toBe(400);
    expect((await put(routine({ schedule: { '1': 'nope' } }))).status).toBe(400);
    expect((await put(routine({ schedule: {} }))).status).toBe(400);
    expect((await put(routine(), '22222222-2222-4222-8222-222222222222')).status).toBe(400);
    // a slot needs exactly one of reps or seconds
    expect((await put(routine({ days: [{ id: 'a', name: 'A', slots: [{ exerciseId: 'push-up', sets: 3, rir: 2 }] }], schedule: { '1': 'a' } }))).status).toBe(400);
  });

  it('the newest edit wins: an older offline save replayed later is ignored', async () => {
    const { req, rows } = fake();
    await req(`/workouts/routines/${RID}`, { method: 'PUT', json: routine({ name: 'New', updatedAt: '2026-11-24T12:00:00.000Z' }) });
    const res = await req(`/workouts/routines/${RID}`, { method: 'PUT', json: routine({ name: 'Old', updatedAt: '2026-11-24T09:00:00.000Z' }) });
    expect(((await res.json()) as any)).toMatchObject({ stale: true, routine: { name: 'New' } });
    expect(rows.get(RID).name).toBe('New');
  });

  it('only the owner can activate, edit or delete; deleting the active routine clears it', async () => {
    const { req, profile, rows } = fake();
    expect((await req('/workouts/program', { method: 'PUT', json: { programId: `custom-${RID}` } })).status).toBe(400);
    await req(`/workouts/routines/${RID}`, { method: 'PUT', json: routine() });
    expect((await req('/workouts/program', { method: 'PUT', json: { programId: `custom-${RID}` } })).status).toBe(200);
    expect(profile.activeProgramId).toBe(`custom-${RID}`);

    // someone else's routine with a guessed id: not editable, not deletable
    rows.get(RID).userId = OTHER;
    expect((await req(`/workouts/routines/${RID}`, { method: 'PUT', json: routine({ updatedAt: '2026-11-24T11:00:00.000Z' }) })).status).toBe(404);
    expect(((await (await req(`/workouts/routines/${RID}`, { method: 'DELETE' })).json()) as any).deleted).toBe(false);
    rows.get(RID).userId = USER;

    expect(((await (await req(`/workouts/routines/${RID}`, { method: 'DELETE' })).json()) as any).deleted).toBe(true);
    expect(profile.activeProgramId).toBeNull();
  });
});
