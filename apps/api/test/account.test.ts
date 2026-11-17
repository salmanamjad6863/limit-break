import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { USER } from './fakeDb';

/** Minimal double: records which tables were cleared and in what order. */
function accountDb() {
  const calls: string[] = [];
  const rows = { profile: [{ id: USER }], nutritionDay: [{ userId: USER }], food: [{ ownerId: USER }, { ownerId: null }] };
  const del = (t: keyof typeof rows, key: string) => async ({ where }: any) => {
    calls.push(t);
    rows[t] = (rows[t] as any[]).filter((r) => r[key] !== (where.id ?? where.userId ?? where.ownerId)) as never;
  };
  const tx: any = {
    nutritionDay: { deleteMany: del('nutritionDay', 'userId') },
    food: { deleteMany: del('food', 'ownerId') },
    profile: { deleteMany: del('profile', 'id') },
  };
  const many = async () => [];
  const prisma: any = {
    ...tx,
    $transaction: async (fn: any) => fn(tx),
    profile: { ...tx.profile, findUnique: async () => rows.profile[0] ?? null },
    hunterState: { findUnique: async () => null },
    workoutSession: { findMany: many }, personalRecord: { findMany: many }, questInstance: { findMany: many }, foodLog: { findMany: many },
    food: { ...tx.food, findMany: async () => rows.food.filter((f) => f.ownerId === USER) },
    nutritionDay: { ...tx.nutritionDay, findMany: many }, bodyMetric: { findMany: many }, tdeeEstimate: { findMany: many },
    nutritionTarget: { findMany: many }, trialAttempt: { findMany: many }, exerciseNote: { findMany: many }, xpLedger: { findMany: many },
  };
  return { rows, calls, prisma };
}
const call = (prisma: any, method: string, path: string, body?: unknown, deleteAuthUser?: (id: string) => Promise<void>) =>
  createApp({ prisma, paywallEnabled: false, verifyToken: async () => ({ userId: USER }), deleteAuthUser }).request(path, {
    method, headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('Account (App Store 5.1.1(v), GDPR)', () => {
  it('exports the user’s own data as one JSON file', async () => {
    const { prisma } = accountDb();
    const res = await call(prisma, 'GET', '/me/export');
    expect(res.headers.get('content-disposition')).toContain('limitbreak-export.json');
    const json = (await res.json()) as any;
    expect(json.format).toBe('limitbreak-export/1');
    expect(json.customFoods).toHaveLength(1);
  });

  it('requires the typed confirmation', async () => {
    const { rows, prisma } = accountDb();
    expect((await call(prisma, 'DELETE', '/me', { confirm: 'yes' })).status).toBe(400);
    expect(rows.profile).toHaveLength(1);
  });

  it('deletes non-cascading rows, the profile (cascade), then the auth user', async () => {
    const { rows, calls, prisma } = accountDb();
    const deleted: string[] = [];
    const res = await call(prisma, 'DELETE', '/me', { confirm: 'DELETE' }, async (id) => void deleted.push(id));
    expect(res.status).toBe(200);
    expect(calls).toEqual(['nutritionDay', 'food', 'profile']);
    expect(rows.profile).toHaveLength(0);
    expect(rows.food).toEqual([{ ownerId: null }]); // shared foods stay
    expect(deleted).toEqual([USER]);
  });

  it('reports a retryable error if the auth user could not be removed', async () => {
    const { prisma } = accountDb();
    const res = await call(prisma, 'DELETE', '/me', { confirm: 'DELETE' }, async () => { throw new Error('down'); });
    expect(res.status).toBe(502);
  });
});
