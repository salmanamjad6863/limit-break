import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { fakeDb, USER, uuid } from './fakeDb';

const app = (prisma: any) => createApp({ prisma, paywallEnabled: false, verifyToken: async () => ({ userId: USER }) });
const post = (prisma: any, body: unknown) =>
  app(prisma).request('/progression/trials', {
    method: 'POST', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
const strong = { pushups: 30, plankSec: 110, squats60: 46 };

describe('Rank Trials API', () => {
  it('rejects attempts below the level gate (409)', async () => {
    const { prisma } = fakeDb({ level: 5 });
    expect((await post(prisma, { id: uuid(1), setting: 'HOME', results: strong })).status).toBe(409);
  });

  it('a passing D trial promotes, grants 300 XP and records the attempt', async () => {
    const { db, prisma } = fakeDb({ level: 10, xp: 3200 });
    const res = await post(prisma, { id: uuid(2), setting: 'HOME', results: strong });
    expect(res.status).toBe(200);
    const j = (await res.json()) as any;
    expect(j.passed).toBe(true);
    expect(j.target).toBe('D');
    expect(j.rewards).toEqual(expect.arrayContaining([{ type: 'rankUp', from: 'E', to: 'D' }]));
    expect(db.state.rank).toBe('D');
    expect(db.state.xp).toBe(3500);
    expect(db.ledger[0]).toMatchObject({ amount: 300, reason: 'rankTrial' });
    expect(db.trials).toHaveLength(1);
  });

  it('failing starts a 7-day cooldown, and replays are idempotent', async () => {
    const { db, prisma } = fakeDb({ level: 12 });
    const weak = { pushups: 3, plankSec: 15, squats60: 10 };
    const first = (await (await post(prisma, { id: uuid(3), setting: 'HOME', results: weak })).json()) as any;
    expect(first.passed).toBe(false);
    expect(first.retryAt).toBeTruthy();
    expect(db.state.rank).toBe('E');
    const replay = (await (await post(prisma, { id: uuid(3), setting: 'HOME', results: weak })).json()) as any;
    expect(replay.duplicate).toBe(true);
    expect((await post(prisma, { id: uuid(4), setting: 'HOME', results: strong })).status).toBe(409); // cooldown
  });

  it('requires a strength and an endurance event (400)', async () => {
    const { prisma } = fakeDb({ level: 10 });
    expect((await post(prisma, { id: uuid(5), setting: 'HOME', results: { plankSec: 90 } })).status).toBe(400);
  });

  it('GET /progression returns stats, sources and trial status', async () => {
    const { prisma } = fakeDb({ level: 10 });
    const j = (await (await app(prisma).request('/progression', { headers: { Authorization: 'Bearer x' } })).json()) as any;
    expect(j.trial).toMatchObject({ target: 'D', eligible: true });
    expect(j.sources.END).toBe('measured');
    expect(j.stats.STR).toBeGreaterThan(40);
  });
});
