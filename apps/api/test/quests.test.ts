import { addDays, gameDate } from '@lb/engine';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { fakeDb, USER } from './fakeDb';

const app = (prisma: any) => createApp({ prisma, paywallEnabled: false, verifyToken: async () => ({ userId: USER }) });
const req = (prisma: any, path: string, body?: unknown) =>
  app(prisma).request(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const today = () => gameDate(new Date(), 'UTC');

describe('Quests API', () => {
  it("creates today's Daily Quest from baselines, idempotently", async () => {
    const { db, prisma } = fakeDb();
    const a = (await (await req(prisma, '/quests/today')).json()) as any;
    expect(a.daily.slots.map((s: any) => s.exerciseId)).toEqual(['push-up', 'bodyweight-squat', 'plank']);
    expect(a.date).toBe(today());
    await req(prisma, '/quests/today');
    expect(db.quests.filter((q) => q.templateId === 'daily')).toHaveLength(1);
  });

  it('completing the daily grants 50 XP + streak bonus once and bumps the displayed streak', async () => {
    const { db, prisma } = fakeDb({ streak: { streak: 4, longest: 4, lastResolved: '2099-01-01' } });
    const t = (await (await req(prisma, '/quests/today')).json()) as any;
    const progress = Object.fromEntries(t.daily.slots.map((s: any, i: number) => [String(i), s.target]));
    const r = (await (await req(prisma, `/quests/${t.daily.id}/progress`, { progress })).json()) as any;
    expect(r.quest.status).toBe('COMPLETED');
    expect(r.rewards).toEqual(expect.arrayContaining([{ type: 'xp', amount: 54, reason: 'quest:daily' }]));
    const again = (await (await req(prisma, `/quests/${t.daily.id}/progress`, { progress })).json()) as any;
    expect(again.rewards).toEqual([]);
    expect(db.ledger).toHaveLength(1);
    const after = (await (await req(prisma, '/quests/today')).json()) as any;
    expect(after.streak.current).toBe(5);
  });

  it('a missed day with no shields opens the Penalty Zone with a penalty quest today', async () => {
    // game days reset at 04:00 in the user's zone (UTC here), so derive them the same way the server does
    const today = gameDate(new Date(), 'UTC');
    const yesterday = addDays(today, -1);
    const dayBefore = addDays(today, -2);
    const { prisma } = fakeDb({ streak: { streak: 6, longest: 6, shields: 0, shieldsMonth: yesterday.slice(0, 7), lastResolved: dayBefore } });
    const t = (await (await req(prisma, '/quests/today')).json()) as any;
    expect(t.streak.penaltyDate).toBe(yesterday);
    expect(t.penalty.options.length).toBeGreaterThan(0);
    expect(t.streak.current).toBe(6);
  });

  it('side quests: pick up to 3, 15 XP each', async () => {
    const { prisma } = fakeDb();
    expect((await req(prisma, '/quests/sides', { ids: ['water-2l', 'sleep-7h', 'protein', 'steps-8k'] })).status).toBe(400); // max 3
    const sides = (await (await req(prisma, '/quests/sides', { ids: ['water-2l', 'sleep-7h', 'protein'] })).json()) as any[];
    expect(sides).toHaveLength(3);
    const r = (await (await req(prisma, `/quests/${sides[0].id}/progress`, { progress: { done: 1 } })).json()) as any;
    expect(r.rewards).toEqual(expect.arrayContaining([{ type: 'xp', amount: 15, reason: 'quest:water-2l' }]));
    expect((await req(prisma, '/quests/sides', { ids: ['protein'] })).status).toBe(409); // locked after a completion
  });

  it('sick mode toggles for today', async () => {
    const { db, prisma } = fakeDb();
    await req(prisma, '/quests/sick', { on: true });
    expect(db.quests.some((q) => q.templateId === 'sick')).toBe(true);
    const t = (await (await req(prisma, '/quests/today')).json()) as any;
    expect(t.streak.sickToday).toBe(true);
    await req(prisma, '/quests/sick', { on: false });
    expect(db.quests.some((q) => q.templateId === 'sick')).toBe(false);
  });

  it('boss: prophecy from the plan, cannot claim until defeated', async () => {
    const { prisma } = fakeDb();
    const b = (await (await req(prisma, '/quests/boss')).json()) as any;
    expect(b.prophecy).toBe(true);
    expect(b.won).toBe(false);
    expect((await req(prisma, '/quests/boss/claim', {})).status).toBe(409);
  });
});
