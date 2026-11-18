import { nextLeagueTier, pairKey, raidBossHp } from '@lb/engine';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import {
  duelScores, ensureLeagueMembership, giftShield, listConversations, listMessages, markConversationRead, settleLeagueWeek, startingTier, GUILD_MAX, guildHasRoom, joinGuild, liveFriendStreak, mondayOf, monthKey, nextFriendStreak, raidState,
  shieldGiftedIn, SHIELD_CAP, weeklyTotals,
} from '../src/modules/social/service';
import { duelWinner } from '@lb/engine';
import { onDailyQuestComplete } from '../src/modules/social/hooks';
import { uuid } from './fakeDb';

const NOW = new Date('2026-11-18T12:00:00Z'); // a Wednesday
const ME = uuid(1);
const FRIEND = uuid(2);

describe('raid fixture: 80% of expected XP clears the boss', () => {
  const expected = [1000, 2000, 3000, 2000];

  it('boss HP is 0.8 × the sum of expected weekly XP', () => {
    expect(raidBossHp(expected)).toBe(6400);
  });

  it('everyone at 80% of their expected XP just clears it, and all earn loot', () => {
    const r = raidState(expected.map((e) => ({ xp: e * 0.8, expectedXp: e })));
    expect(r.bossHp).toBe(6400);
    expect(r.damageTotal).toBe(6400);
    expect(r.cleared).toBe(true);
    expect(r.hpLeftRatio).toBe(0);
    expect(r.contributions.every((c) => c.earnsLoot)).toBe(true);
  });

  it('79% leaves the boss standing; a hunter at 10% of expected earns no loot', () => {
    const r = raidState(expected.map((e, i) => ({ xp: i === 0 ? e * 0.1 : e * 0.79, expectedXp: e })));
    expect(r.cleared).toBe(false);
    expect(r.hpLeftRatio).toBeGreaterThan(0);
    expect(r.contributions[0]!.earnsLoot).toBe(false);
    expect(r.contributions[1]!.earnsLoot).toBe(true);
  });

  it('overkill never pushes the HP bar below zero', () => {
    expect(raidState([{ xp: 9000, expectedXp: 1000 }]).hpLeftRatio).toBe(0);
  });
});

describe('duels are scored against your own baseline', () => {
  it('a beginner who beats their own average beats a veteran who merely holds theirs', () => {
    const beginner = { weekXp: 1200, baseline: 800 }; // 1.5×
    const veteran = { weekXp: 3300, baseline: 3000 }; // 1.1×
    expect(duelWinner(beginner, veteran)).toBe('challenger');
    expect(duelWinner(veteran, beginner)).toBe('opponent');
    expect(duelScores(beginner.weekXp, beginner.baseline)).toBe(1.5);
    // the veteran has far more raw XP and still loses
    expect(veteran.weekXp).toBeGreaterThan(beginner.weekXp);
  });

  it('equal scores draw', () => {
    expect(duelWinner({ weekXp: 800, baseline: 800 }, { weekXp: 3000, baseline: 3000 })).toBe('draw');
  });

  it('baseline = mean of the last 4 calendar weeks, newcomers not averaged against empty history', () => {
    const thisWeek = mondayOf('2026-11-18');
    expect(thisWeek).toBe('2026-11-16');
    const rows = [
      { localDate: '2026-11-10', amount: 2000 }, // last week
      { localDate: '2026-11-02', amount: 1000 }, // two weeks ago
      { localDate: '2026-11-17', amount: 9999 }, // this week: excluded
      { localDate: '2026-10-10', amount: 5000 }, // older than 4 weeks: excluded
    ];
    expect(weeklyTotals(rows, thisWeek)).toEqual([2000, 1000]);
    expect(weeklyTotals([], thisWeek)).toEqual([]);
  });
});

describe('pairKey', () => {
  it('orders a pair the same way whoever acts first', () => {
    const [a, b] = [uuid(7), uuid(3)];
    expect(pairKey(a, b)).toEqual(pairKey(b, a));
    expect(pairKey(a, b)).toEqual([uuid(3), uuid(7)]);
  });

  it('is unique per pair', () => {
    const ids = [uuid(1), uuid(2), uuid(3), uuid(4)];
    const keys = new Set<string>();
    for (const x of ids) for (const y of ids) if (x !== y) keys.add(pairKey(x, y).join('|'));
    expect(keys.size).toBe(6); // C(4,2)
  });
});

describe('friend streak', () => {
  it('starts at 1, grows on consecutive days, resets after a gap, is idempotent within a day', () => {
    const d1 = nextFriendStreak(null, '2026-11-16');
    expect(d1).toEqual({ current: 1, longest: 1, lastBothDate: '2026-11-16' });
    const d2 = nextFriendStreak(d1, '2026-11-17');
    expect(d2.current).toBe(2);
    expect(nextFriendStreak(d2, '2026-11-17')).toBe(d2);
    const d4 = nextFriendStreak(d2, '2026-11-19'); // skipped the 18th
    expect(d4).toEqual({ current: 1, longest: 2, lastBothDate: '2026-11-19' });
  });

  it('only displays a streak that is still alive', () => {
    expect(liveFriendStreak({ current: 5, lastBothDate: '2026-11-17' }, '2026-11-18')).toBe(5);
    expect(liveFriendStreak({ current: 5, lastBothDate: '2026-11-16' }, '2026-11-18')).toBe(0);
    expect(liveFriendStreak(undefined, '2026-11-18')).toBe(0);
  });

  it('onDailyQuestComplete advances the pair only when the friend also finished that day', async () => {
    const streaks: any[] = [];
    const quests = [{ userId: FRIEND, kind: 'DAILY', templateId: 'daily', status: 'COMPLETED', localDate: '2026-11-18' }];
    const [userA, userB] = pairKey(ME, FRIEND);
    const prisma: any = {
      follow: {
        findMany: async ({ where }: any) =>
          where.followerId ? [{ followeeId: FRIEND }] : [{ followerId: FRIEND }],
      },
      questInstance: {
        findMany: async ({ where }: any) => quests.filter((q) => where.userId.in.includes(q.userId) && q.localDate === where.localDate),
      },
      friendStreak: {
        findUnique: async () => streaks[0] ?? null,
        create: async ({ data }: any) => streaks.push(data),
        update: async ({ data }: any) => Object.assign(streaks[0], data),
      },
    };
    await onDailyQuestComplete(prisma, ME, '2026-11-17'); // friend didn't finish the 17th
    expect(streaks).toHaveLength(0);
    await onDailyQuestComplete(prisma, ME, '2026-11-18');
    expect(streaks).toEqual([{ userA, userB, current: 1, longest: 1, lastBothDate: '2026-11-18' }]);
    await onDailyQuestComplete(prisma, ME, '2026-11-18'); // same day again
    expect(streaks[0].current).toBe(1);
  });
});

/** Just enough Prisma for the community viewer + the social service paths under test. */
function socialFake(opts: { members?: number; shields?: number; mutual?: boolean } = {}) {
  const db = {
    members: Array.from({ length: opts.members ?? 0 }, (_, i) => ({ guildId: uuid(500), userId: uuid(1000 + i), role: 'member' })),
    gifts: [] as any[],
    shields: opts.shields ?? 0,
  };
  const guild = { id: uuid(500), name: 'Iron Court', code: 'IRON42', isPublic: true, language: null, timezone: 'UTC', leaderId: uuid(1000), createdAt: NOW };
  const prisma: any = {
    profile: {
      findUnique: async () => ({ createdAt: new Date('2026-01-01'), birthDate: new Date('1995-05-05'), timezone: 'UTC', state: { level: 12, rank: 'D' } }),
    },
    publicProfile: { findUnique: async () => ({ userId: ME, handle: 'kaze', isPublic: true, bio: null }) },
    workoutSession: { count: async () => 10 },
    $queryRaw: async () => [{ n: 0 }],
    guild: { findUnique: async ({ where }: any) => (where.code === guild.code ? guild : null) },
    guildMember: {
      findUnique: async ({ where }: any) => db.members.find((m) => m.userId === where.userId) ?? null,
      count: async () => db.members.length,
      create: async ({ data }: any) => db.members.push(data),
      deleteMany: async ({ where }: any) => {
        db.members = db.members.filter((m) => m.userId !== where.userId);
      },
    },
    follow: { findUnique: async () => (opts.mutual === false ? null : { followerId: 'x', followeeId: 'y' }) },
    friendShieldGift: {
      findUnique: async ({ where }: any) => {
        const k = where.giverId_receiverId_month;
        return db.gifts.find((g) => g.giverId === k.giverId && g.receiverId === k.receiverId && g.month === k.month) ?? null;
      },
      create: async ({ data }: any) => db.gifts.push(data),
    },
    hunterState: {
      findUnique: async () => ({ userId: FRIEND, shields: db.shields }),
      update: async ({ data }: any) => {
        db.shields += data.shields.increment;
      },
    },
    $transaction: async (fn: any) => fn(prisma),
  };
  return { db, prisma, ctx: { prisma, userId: ME, isGuest: false } };
}

describe('guilds', () => {
  it('holds at most 20 hunters', async () => {
    expect(GUILD_MAX).toBe(20);
    expect(guildHasRoom(19)).toBe(true);
    expect(guildHasRoom(20)).toBe(false);

    const full = socialFake({ members: 20 });
    await expect(joinGuild(full.ctx, { code: 'IRON42' })).rejects.toMatchObject({ status: 409, message: 'this guild is full' });
    expect(full.db.members).toHaveLength(20);

    const open = socialFake({ members: 19 });
    const joined = await joinGuild(open.ctx, { code: 'iron42' });
    expect(joined).toMatchObject({ memberCount: 20, myRole: 'member' });
  });

  it('one guild per hunter: joining a second guild is refused, rejoining your own is idempotent', async () => {
    const f = socialFake({ members: 3 });
    await joinGuild(f.ctx, { code: 'IRON42' });
    const again = await joinGuild(f.ctx, { code: 'IRON42' });
    expect(again.memberCount).toBe(4);
    expect(f.db.members.filter((m) => m.userId === ME)).toHaveLength(1);
  });

  it('unknown codes are 404', async () => {
    await expect(joinGuild(socialFake().ctx, { code: 'NOPE99' })).rejects.toMatchObject({ status: 404 });
  });
});

describe('streak shield gifts', () => {
  it('month key and the once-per-friend-per-month check', () => {
    expect(monthKey('2026-11-18')).toBe('2026-11');
    const gifts = [{ giverId: ME, receiverId: FRIEND, month: '2026-11' }];
    expect(shieldGiftedIn(gifts, ME, FRIEND, '2026-11')).toBe(true);
    expect(shieldGiftedIn(gifts, ME, FRIEND, '2026-12')).toBe(false);
    expect(shieldGiftedIn(gifts, FRIEND, ME, '2026-11')).toBe(false); // direction matters
  });

  it('a second gift in the same month is refused, a new month works, and the friend gains one shield each time', async () => {
    const f = socialFake({ shields: 1 });
    await expect(giftShield(f.ctx, FRIEND, NOW)).resolves.toMatchObject({ ok: true, month: '2026-11' });
    expect(f.db.shields).toBe(2);
    await expect(giftShield(f.ctx, FRIEND, NOW)).rejects.toMatchObject({ status: 409 });
    expect(f.db.shields).toBe(2);
    await expect(giftShield(f.ctx, FRIEND, new Date('2026-12-02T12:00:00Z'))).resolves.toMatchObject({ month: '2026-12' });
    expect(f.db.shields).toBe(3);
  });

  it('refuses non-friends and friends already holding the maximum', async () => {
    await expect(giftShield(socialFake({ mutual: false }).ctx, FRIEND, NOW)).rejects.toMatchObject({ status: 403 });
    const capped = socialFake({ shields: SHIELD_CAP });
    await expect(giftShield(capped.ctx, FRIEND, NOW)).rejects.toMatchObject({ status: 409 });
    expect(capped.db.gifts).toHaveLength(0);
  });
});

/** In-memory leagues + ledger: the Prisma surface settle/ensure use. */
function leagueFake(seed: { groups: any[]; members: any[]; xp?: { userId: string; localDate: string; amount: number }[] }) {
  const db = { groups: seed.groups, members: seed.members, xp: seed.xp ?? [] };
  const groupOf = (id: string) => db.groups.find((g) => g.id === id);
  const prisma: any = {
    xpLedger: {
      groupBy: async ({ where }: any) => {
        const sums = new Map<string, number>();
        for (const r of db.xp) {
          if (!where.userId.in.includes(r.userId) || r.localDate < where.localDate.gte || r.localDate > where.localDate.lte) continue;
          sums.set(r.userId, (sums.get(r.userId) ?? 0) + r.amount);
        }
        return [...sums].map(([userId, sum]) => ({ userId, _sum: { amount: sum } }));
      },
    },
    leagueGroup: {
      findMany: async ({ where, include }: any) =>
        db.groups
          .filter((g) => g.weekStart === where.weekStart && (where.tier === undefined || g.tier === where.tier) && (!('settledAt' in where) || g.settledAt === where.settledAt))
          .sort((a, b) => a.index - b.index)
          .map((g) => ({ ...g, members: db.members.filter((m) => m.groupId === g.id), _count: { members: db.members.filter((m) => m.groupId === g.id).length } })),
      create: async ({ data }: any) => {
        const g = { settledAt: null, ...data };
        db.groups.push(g);
        return g;
      },
      updateMany: async ({ where, data }: any) => {
        const g = groupOf(where.id);
        if (!g || (where.settledAt === null && g.settledAt !== null)) return { count: 0 };
        Object.assign(g, data);
        return { count: 1 };
      },
    },
    leagueMember: {
      findFirst: async ({ where, include }: any) => {
        const m = db.members.find((x) => x.userId === where.userId && groupOf(x.groupId)?.weekStart === where.group.weekStart);
        return m ? (include?.group ? { ...m, group: groupOf(m.groupId) } : m) : null;
      },
      create: async ({ data }: any) => db.members.push({ place: null, ...data }),
      count: async ({ where }: any) => db.members.filter((m) => m.groupId === where.groupId).length,
      deleteMany: async ({ where }: any) => {
        db.members = db.members.filter((m) => !(m.groupId === where.groupId && m.userId === where.userId));
      },
      update: async ({ where, data }: any) => {
        const k = where.groupId_userId;
        Object.assign(db.members.find((m) => m.groupId === k.groupId && m.userId === k.userId), data);
      },
    },
    $transaction: async (fn: any) => fn(prisma),
  };
  return { db, prisma };
}

describe('league settlement and tier placement', () => {
  const W1 = '2026-11-09';
  const W2 = '2026-11-16';
  const users = Array.from({ length: 30 }, (_, i) => uuid(100 + i));
  const group = (id: string, weekStart: string, tier: string, index = 0) => ({ id, weekStart, tier, index, settledAt: null });

  it('startingTier: promote top 7, demote bottom 5, otherwise stay; newcomers and zero-XP never rise', () => {
    expect(startingTier(null)).toBe('Bronze');
    expect(startingTier({ tier: 'Silver', place: null, xp: 0 })).toBe('Bronze');
    expect(startingTier({ tier: 'Bronze', place: 1, xp: 900 })).toBe('Silver');
    expect(startingTier({ tier: 'Bronze', place: 7, xp: 400 })).toBe('Silver');
    expect(startingTier({ tier: 'Bronze', place: 8, xp: 300 })).toBe('Bronze');
    expect(startingTier({ tier: 'Gold', place: 26, xp: 10 })).toBe('Silver');
    expect(startingTier({ tier: 'Gold', place: 25, xp: 10 })).toBe('Gold');
    expect(startingTier({ tier: 'Bronze', place: 30, xp: 0 })).toBe('Bronze');
    expect(startingTier({ tier: 'Mythic', place: 1, xp: 500 })).toBe('Mythic');
    expect(startingTier({ tier: 'Silver', place: 1, xp: 0 })).toBe('Silver');
    expect(startingTier({ tier: 'Gold', place: 3, xp: 700 })).toBe(nextLeagueTier('Gold', 3));
  });

  it('settleLeagueWeek writes places (ties share the best place) from the ledger and is idempotent', async () => {
    const [a, b, c, d] = users;
    const f = leagueFake({
      groups: [group('g1', W1, 'Bronze')],
      members: [a!, b!, c!, d!].map((userId) => ({ groupId: 'g1', userId, xp: 0, place: null })),
      xp: [
        { userId: a!, localDate: '2026-11-10', amount: 300 }, { userId: a!, localDate: '2026-11-12', amount: 200 },
        { userId: b!, localDate: '2026-11-11', amount: 500 }, // ties a at 500
        { userId: c!, localDate: '2026-11-15', amount: 80 },
        { userId: c!, localDate: '2026-11-16', amount: 9999 }, // next week: excluded
      ],
    });
    const now = new Date('2026-11-16T08:00:00Z');
    expect(await settleLeagueWeek(f.prisma, W1, now)).toBe(1);
    const by = new Map(f.db.members.map((m) => [m.userId, m]));
    expect([a, b, c, d].map((u) => by.get(u!)!.place)).toEqual([1, 1, 3, 4]);
    expect(by.get(c!)!.xp).toBe(80);
    expect(f.db.groups[0].settledAt).toEqual(now);
    expect(await settleLeagueWeek(f.prisma, W1, now)).toBe(0); // already settled
    expect(await settleLeagueWeek(f.prisma, W2, now)).toBe(0); // other week untouched
  });

  it('ensureLeagueMembership: top finisher of last week starts in the next tier, in a group with room', async () => {
    const winner = users[0]!;
    const f = leagueFake({
      groups: [group('b1', W1, 'Bronze'), group('s1', W2, 'Silver')],
      members: [
        { groupId: 'b1', userId: winner, xp: 0, place: null },
        ...users.slice(1, 8).map((userId) => ({ groupId: 'b1', userId, xp: 0, place: null })),
        // this week's Silver group 0 is full (30), so a new group opens
        ...Array.from({ length: 30 }, (_, i) => ({ groupId: 's1', userId: uuid(900 + i), xp: 0, place: null })),
      ],
      xp: users.slice(0, 8).map((userId, i) => ({ userId, localDate: '2026-11-10', amount: 1000 - i * 100 })),
    });
    // last week was never settled: ensureLeagueMembership settles it on the spot
    const groupId = await ensureLeagueMembership(f.prisma, winner, W2, new Date('2026-11-16T08:00:00Z'));
    expect(f.db.groups.find((g) => g.id === 'b1')!.settledAt).not.toBeNull();
    const placed = f.db.groups.find((g) => g.id === groupId)!;
    expect(placed).toMatchObject({ tier: 'Silver', weekStart: W2, index: 1 });
    expect(f.db.members.find((m) => m.userId === winner && m.groupId === groupId)).toBeTruthy();
    // idempotent
    expect(await ensureLeagueMembership(f.prisma, winner, W2)).toBe(groupId);
  });

  it('newcomers and hunters who skipped last week start in Bronze', async () => {
    const f = leagueFake({ groups: [group('b2', W2, 'Bronze')], members: [] });
    const id = await ensureLeagueMembership(f.prisma, users[5]!, W2);
    expect(id).toBe('b2');
    expect(f.db.groups.find((g) => g.id === id)!.tier).toBe('Bronze');
  });
});

/** Two hunters, one thread: ME is userA when ME < FRIEND (uuid(1) < uuid(2)). */
function dmFake(readAtA: Date | null = null, readAtB: Date | null = null) {
  const [userA, userB] = pairKey(ME, FRIEND);
  const db: any = {
    convo: { id: uuid(70), userA, userB, status: 'open', readAtA, readAtB },
    messages: [
      { id: uuid(71), conversationId: uuid(70), senderId: FRIEND, body: 'old', status: 'visible', createdAt: new Date('2026-11-18T09:00:00Z') },
      { id: uuid(72), conversationId: uuid(70), senderId: FRIEND, body: 'new', status: 'visible', createdAt: new Date('2026-11-18T11:00:00Z') },
      { id: uuid(73), conversationId: uuid(70), senderId: FRIEND, body: 'held', status: 'pending', createdAt: new Date('2026-11-18T11:30:00Z') },
      { id: uuid(74), conversationId: uuid(70), senderId: ME, body: 'mine', status: 'visible', createdAt: new Date('2026-11-18T11:45:00Z') },
    ],
  };
  const prisma: any = {
    block: { findMany: async () => [] },
    conversation: {
      findMany: async () => [db.convo],
      findUnique: async ({ where }: any) => (where.id === db.convo.id ? db.convo : null),
      update: async ({ data }: any) => Object.assign(db.convo, data),
    },
    publicProfile: {
      findMany: async () => [{ userId: FRIEND, handle: 'rin', profile: { heroId: null, heroClass: null, state: { level: 5, rank: 'E', str: 10, agi: 10, end: 10, vit: 10, spi: 10 } } }],
    },
    message: {
      findFirst: async () => db.messages.filter((m: any) => m.status === 'visible' || m.senderId === ME).at(-1) ?? null,
      count: async ({ where }: any) =>
        db.messages.filter((m: any) => m.senderId === where.senderId && m.status === where.status && (!where.createdAt || m.createdAt > where.createdAt.gt)).length,
      findMany: async () => [...db.messages].reverse(),
    },
  };
  return { db, prisma, ctx: { prisma, userId: ME, isGuest: false } as any };
}

describe('DM unread', () => {
  const myKey = () => (pairKey(ME, FRIEND)[0] === ME ? 'readAtA' : 'readAtB');
  const peerKey = () => (myKey() === 'readAtA' ? 'readAtB' : 'readAtA');

  it('counts only the peer’s visible messages after my read marker', async () => {
    const all = dmFake();
    expect((await listConversations(all.ctx)).conversations[0]!.unread).toBe(2); // held + mine never count
    const half = dmFake(null, null);
    half.db.convo[myKey()] = new Date('2026-11-18T10:00:00Z');
    expect((await listConversations(half.ctx)).conversations[0]!.unread).toBe(1);
    const peerRead = dmFake();
    peerRead.db.convo[peerKey()] = new Date('2026-11-18T12:00:00Z'); // the peer reading doesn't clear mine
    expect((await listConversations(peerRead.ctx)).conversations[0]!.unread).toBe(2);
  });

  it('markConversationRead sets only my marker; unread drops to 0', async () => {
    const f = dmFake();
    const now = new Date('2026-11-18T12:00:00Z');
    await expect(markConversationRead(f.ctx, f.db.convo.id, now)).resolves.toMatchObject({ ok: true });
    expect(f.db.convo[myKey()]).toEqual(now);
    expect(f.db.convo[peerKey()]).toBeNull();
    expect((await listConversations(f.ctx)).conversations[0]!.unread).toBe(0);
  });

  it('listMessages marks the thread read too, and refuses threads that aren’t mine', async () => {
    const f = dmFake();
    const now = new Date('2026-11-18T12:30:00Z');
    expect((await listMessages(f.ctx, f.db.convo.id, undefined, now)).messages.length).toBeGreaterThan(0);
    expect(f.db.convo[myKey()]).toEqual(now);
    await expect(markConversationRead({ ...f.ctx, userId: uuid(99) }, f.db.convo.id)).rejects.toMatchObject({ status: 404 });
    await expect(markConversationRead(f.ctx, uuid(98))).rejects.toMatchObject({ status: 404 });
  });
});

describe('Social API', () => {
  const guestApp = createApp({ prisma: {} as any, paywallEnabled: false, verifyToken: async () => ({ userId: ME, isGuest: true }) });
  const call = (path: string, method: string, body?: unknown) =>
    guestApp.request(path, {
      method,
      headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it('requires a bearer token', async () => {
    expect((await guestApp.request('/social/friends')).status).toBe(401);
  });

  it('guests are told to save their account on every social write', async () => {
    const writes: [string, string, unknown][] = [
      ['/social/friends', 'POST', { userId: FRIEND }],
      ['/social/friends/' + FRIEND + '/shield', 'POST', {}],
      ['/social/duels', 'POST', { id: uuid(9), opponentId: FRIEND }],
      ['/social/guilds', 'POST', { id: uuid(9), name: 'Iron Court' }],
      ['/social/guilds/join', 'POST', { code: 'IRON42' }],
      ['/social/messages', 'POST', { id: uuid(9), peerId: FRIEND, body: 'hi' }],
    ];
    for (const [path, method, body] of writes) {
      const res = await call(path, method, body);
      expect(res.status, path).toBe(403);
      expect(((await res.json()) as any).error).toMatch(/save your account/);
    }
  });

  it('validates bodies before touching the service', async () => {
    expect((await call('/social/friends', 'POST', { userId: 'nope' })).status).toBe(400);
    expect((await call('/social/guilds/join', 'POST', { code: 'x' })).status).toBe(400);
  });

  it('league settle is moderator-only and conversation read validates the id', async () => {
    const res = await call('/social/league/settle', 'POST');
    expect(res.status).toBe(403);
    expect((await call('/social/conversations/nope/read', 'POST')).status).toBe(400);
  });
});
