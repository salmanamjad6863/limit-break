import type { PrismaClient } from '@lb/db';
import { addDays, gameDate } from '@lb/engine';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

const USER = '00000000-0000-4000-8000-000000000001';
const CID = '33333333-3333-4333-8333-333333333333';
const TODAY = gameDate(new Date(), 'UTC');

function fake() {
  const challenges = new Map<string, any>();
  const checkins = new Map<string, any>();
  const ledger: any[] = [];
  const events: any[] = [];
  const state: any = { userId: USER, xp: 0, level: 1, apUnspent: 0, apGrantedLevel: 1 };
  const withCheckins = (c: any) => c && { ...c, checkins: [...checkins.values()].filter((x) => x.challengeId === c.id) };
  const match = (c: any, where: any) => Object.entries(where).every(([k, v]) => c[k] === v);
  const prisma: any = {
    profile: { findUnique: async () => ({ timezone: 'UTC' }) },
    challenge: {
      findUnique: async ({ where }: any) => withCheckins(challenges.get(where.id)) ?? null,
      findFirst: async ({ where }: any) => withCheckins([...challenges.values()].find((c) => match(c, where))) ?? null,
      findFirstOrThrow: async ({ where }: any) => withCheckins([...challenges.values()].find((c) => match(c, where))),
      findMany: async ({ where }: any) => [...challenges.values()].filter((c) => match(c, where)).map(withCheckins),
      count: async ({ where }: any) => [...challenges.values()].filter((c) => match(c, where)).length,
      create: async ({ data }: any) => (challenges.set(data.id, { status: 'ACTIVE', completedAt: null, createdAt: new Date(), ...data }), withCheckins(challenges.get(data.id))),
      updateMany: async ({ where, data }: any) => {
        const hits = [...challenges.values()].filter((c) => match(c, where));
        hits.forEach((c) => Object.assign(c, data));
        return { count: hits.length };
      },
    },
    challengeCheckin: {
      upsert: async ({ where, create, update }: any) => {
        const k = `${where.challengeId_localDate.challengeId}|${where.challengeId_localDate.localDate}`;
        checkins.set(k, checkins.has(k) ? { ...checkins.get(k), ...update } : { rewarded: false, ...create });
      },
      updateMany: async ({ where, data }: any) => {
        const k = `${where.challengeId}|${where.localDate}`;
        const row = checkins.get(k);
        if (!row || row.rewarded !== where.rewarded) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    event: { create: async ({ data }: any) => events.push(data) },
    hunterState: {
      findUnique: async () => state,
      update: async ({ data }: any) => Object.assign(state, data),
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
    app.request(path, {
      method: init.method ?? 'GET',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: init.json ? JSON.stringify(init.json) : undefined,
    });
  return { req, challenges, ledger, events, state };
}

const challenge = (o: Record<string, unknown> = {}) => ({
  id: CID, name: '3-day test', days: 3, graceDays: 1, startDate: TODAY,
  tasks: [
    { id: 't1', kind: 'exercise', exerciseId: 'push-up', title: 'Push-ups', target: 20, unit: 'reps', addPerStep: 2, stepDays: 1 },
    { id: 't2', kind: 'habit', title: 'Drink 3 L water' },
  ],
  ...o,
});

describe('habit challenges', () => {
  it('creates once (offline replays return the same challenge) and lists it', async () => {
    const { req } = fake();
    expect((await req('/challenges', { method: 'POST', json: challenge() })).status).toBe(200);
    expect((await req('/challenges', { method: 'POST', json: challenge({ name: 'changed' }) })).status).toBe(200);
    const body = (await (await req('/challenges')).json()) as any;
    expect(body.challenges).toHaveLength(1);
    expect(body.challenges[0]).toMatchObject({ name: '3-day test', status: 'ACTIVE', checkins: {} });
  });

  it('rejects bad challenges: unknown exercise, no tasks, too much grace, a far start date', async () => {
    const { req } = fake();
    const post = (o: Record<string, unknown>) => req('/challenges', { method: 'POST', json: challenge(o) });
    expect((await post({ tasks: [{ id: 't1', kind: 'exercise', exerciseId: 'nope', title: '', target: 10 }] })).status).toBe(400);
    expect((await post({ tasks: [] })).status).toBe(400);
    expect((await post({ graceDays: 3 })).status).toBe(400);
    expect((await post({ startDate: '2027-01-01' })).status).toBe(400);
  });

  it('pays a full day once, never for toggling, and finishes with a bonus (grace covered the missed day)', async () => {
    const { req, challenges, ledger, state } = fake();
    // started two days ago; day 1 was missed (grace covers it)
    challenges.set(CID, { ...challenge({ startDate: addDays(TODAY, -2) }), userId: USER, status: 'ACTIVE', completedAt: null, createdAt: new Date() });
    const put = (date: string, done: string[]) => req(`/challenges/${CID}/checkin`, { method: 'PUT', json: { date, done } });

    const partial = (await (await put(addDays(TODAY, -1), ['t1'])).json()) as any;
    expect(partial.rewards).toEqual([]);
    const y = (await (await put(addDays(TODAY, -1), ['t1', 't2'])).json()) as any;
    expect(y.rewards).toContainEqual({ type: 'xp', amount: 10, reason: 'challenge:day' });
    // untick and tick again: no second payment
    await put(addDays(TODAY, -1), ['t2']);
    expect(((await (await put(addDays(TODAY, -1), ['t1', 't2'])).json()) as any).rewards).toEqual([]);

    const t = (await (await put(TODAY, ['t2', 't1', 'not-a-task'])).json()) as any;
    expect(t.challenge.status).toBe('COMPLETED');
    expect(t.challenge.checkins[TODAY]).toEqual(['t2', 't1']);
    expect(t.rewards).toContainEqual({ type: 'challengeComplete', name: '3-day test', days: 3, flawless: false });
    // finish bonus 50 + 2 × 3 days = 56, not flawless
    expect(t.rewards).toContainEqual({ type: 'xp', amount: 56, reason: 'challenge:complete' });
    expect(ledger.map((l) => l.reason)).toEqual(['challenge:day', 'challenge:day', 'challenge:complete']);
    expect(state.xp).toBe(76);
    // closed: more check-ins change nothing
    expect(((await (await put(TODAY, [])).json()) as any).challenge.checkins[TODAY]).toEqual(['t2', 't1']);
  });

  it('only today or yesterday can be checked in; ending keeps it in the list', async () => {
    const { req } = fake();
    await req('/challenges', { method: 'POST', json: challenge() });
    const put = (date: string) => req(`/challenges/${CID}/checkin`, { method: 'PUT', json: { date, done: ['t1'] } });
    expect((await put(addDays(TODAY, 1))).status).toBe(409);
    expect((await put(addDays(TODAY, -1))).status).toBe(409); // before day 1
    expect((await put(TODAY)).status).toBe(200);
    const ended = (await (await req(`/challenges/${CID}/end`, { method: 'POST' })).json()) as any;
    expect(ended.status).toBe('ENDED');
    expect((await req('/challenges/44444444-4444-4444-8444-444444444444/checkin', { method: 'PUT', json: { date: TODAY, done: [] } })).status).toBe(404);
  });
});
