/**
 * Social (SYSTEMS.md §5.6): friends + Friend Streaks, follow requests, duels, guilds + chat, weekly raids,
 * leagues, DMs and the Hunter License. Everything needs a saved account with a handle; guests get 403.
 * Payloads carry XP and ranks only, never body weight or calories.
 */
import { randomInt, randomUUID } from 'node:crypto';
import type {
  ConversationDto, CreateDuelInput, CreateGuildInput, CreateGuildMessageInput, DuelDto, FollowRequestDto, FriendStreakDto,
  FriendsResponse, GuildDto, GuildMemberDto, GuildMessageDto, HunterLicenseDto, JoinGuildInput, LeagueDto, MessageDto,
  RaidContributionDto, RaidDto, SendMessageInput,
} from '@lb/contracts';
import type { PrismaClient } from '@lb/db';
import {
  addDays, DUEL, duelScore, duelWinner, displayStat, earnsRaidLoot, expectedWeeklyXp, gameDate, LEAGUE, leaguePlaces, pairKey,
  nextLeagueTier, powerLevel, RAID, raidBossHp, raidCleared, raidContribution, type LeagueTier,
} from '@lb/engine';
import { isUniqueViolation } from '../../lib/db';
import { CommunityError, hunterCards, viewer, type CommunityCtx } from '../community/service';
import { localCheck, moderate, type ModerationVerdict } from '../community/moderation';
import { isMinor } from '../community/trust';
import { duelDays, monthKey, mondayOf, mutualFollowIds, nextFriendStreak } from './hooks';

export { monthKey, mondayOf, nextFriendStreak, onDailyQuestComplete, onWeeklyXp } from './hooks';

export class SocialError extends CommunityError {}

export type SocialCtx = CommunityCtx;

export const GUILD_MAX = 20;
/** A gifted Streak Shield can't push a hunter past this many banked shields. */
export const SHIELD_CAP = 3;
const PENDING_DUEL_DAYS = 3;
const MAX_OPEN_DUELS = 5;
const MAX_OUTGOING_REQUESTS = 100;
const MESSAGES_PER_HOUR = 60;
const DAY = 86_400_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/* ---------------- pure helpers (unit-tested) ---------------- */

export const guildHasRoom = (memberCount: number) => memberCount < GUILD_MAX;

/** Has `giver` already gifted `receiver` a shield in this month? */
export function shieldGiftedIn(gifts: readonly { giverId: string; receiverId: string; month: string }[], giverId: string, receiverId: string, month: string) {
  return gifts.some((g) => g.giverId === giverId && g.receiverId === receiverId && g.month === month);
}

/** A friend streak only counts while the last shared day is today or yesterday. */
export function liveFriendStreak(row: { current: number; lastBothDate: string | null } | undefined, today: string) {
  if (!row?.lastBothDate) return 0;
  return row.lastBothDate >= addDays(today, -1) ? row.current : 0;
}

/**
 * Weekly XP totals for the four calendar weeks before `thisWeekStart`, most recent first.
 * Weeks before the hunter's first XP are dropped so a newcomer isn't averaged against empty history.
 */
export function weeklyTotals(rows: readonly { localDate: string; amount: number }[], thisWeekStart: string): number[] {
  const from = addDays(thisWeekStart, -28);
  const weeks = [0, 0, 0, 0];
  for (const r of rows) {
    if (r.localDate < from || r.localDate >= thisWeekStart) continue;
    const idx = Math.floor((Date.parse(`${r.localDate}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (7 * DAY));
    weeks[idx] = (weeks[idx] ?? 0) + r.amount;
  }
  const first = weeks.findIndex((w) => w > 0);
  return first < 0 ? [] : weeks.slice(first).reverse();
}

export interface RaidMemberInput {
  xp: number;
  expectedXp: number;
}

/** Boss HP, damage, and the clear flag for a set of members (a member's HP share is 0.8 × their expected XP). */
export function raidState(members: readonly RaidMemberInput[], bossHp = raidBossHp(members.map((m) => m.expectedXp))) {
  const damageTotal = members.reduce((s, m) => s + m.xp, 0);
  return {
    bossHp,
    damageTotal,
    cleared: raidCleared(damageTotal, bossHp),
    hpLeftRatio: Math.max(0, Math.min(1, 1 - damageTotal / Math.max(1, bossHp))),
    contributions: members.map((m) => {
      const contribution = raidContribution(m.xp, m.expectedXp);
      return { contribution, earnsLoot: earnsRaidLoot(contribution) };
    }),
  };
}

export const duelScores = (xp: number, baseline: number) => Math.round(duelScore(xp, baseline) * 10_000) / 10_000;

/* ---------------- shared plumbing ---------------- */

const bad = (status: 400 | 403 | 404 | 409 | 429, message: string) => new SocialError(status, message);

/** Saved account + a handle (hunter cards need one). Returns the community viewer for trust / age checks. */
async function member(ctx: SocialCtx) {
  if (ctx.isGuest) throw bad(403, 'save your account to use friends, guilds and leagues');
  const v = await viewer(ctx);
  if (!v.pub?.handle) throw bad(403, 'pick a hunter handle first');
  return v;
}

async function userToday(prisma: PrismaClient, userId: string, now = new Date()) {
  const p = await prisma.profile.findUnique({ where: { id: userId }, select: { timezone: true } });
  return gameDate(now, p?.timezone ?? 'UTC');
}

async function blockedIds(prisma: PrismaClient, userId: string): Promise<Set<string>> {
  const rows = await prisma.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } });
  return new Set(rows.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)));
}

const isMutual = async (prisma: PrismaClient, a: string, b: string) => {
  const [x, y] = await Promise.all([
    prisma.follow.findUnique({ where: { followerId_followeeId: { followerId: a, followeeId: b } } }),
    prisma.follow.findUnique({ where: { followerId_followeeId: { followerId: b, followeeId: a } } }),
  ]);
  return !!x && !!y;
};

async function audit(prisma: PrismaClient, targetType: string, targetId: string, v: ModerationVerdict) {
  await prisma.moderationAction.create({
    data: {
      id: randomUUID(), targetType, targetId, action: v.allow ? 'auto_allow' : 'auto_hold',
      reason: `${v.source}:${v.severity}${v.categories.length ? `:${v.categories.join(',')}` : ''}`,
    },
  });
}

const validTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** XP sums per hunter for an inclusive game-date range (one query). */
async function xpBetween(prisma: PrismaClient, userIds: string[], from: string, to: string): Promise<Map<string, number>> {
  if (!userIds.length) return new Map();
  const rows = await prisma.xpLedger.groupBy({ by: ['userId'], where: { userId: { in: userIds }, localDate: { gte: from, lte: to } }, _sum: { amount: true } });
  return new Map(rows.map((r) => [r.userId, Math.max(0, r._sum.amount ?? 0)]));
}

/** Expected weekly XP (mean of the last 4 calendar weeks, floored) for several hunters in one query. */
async function baselinesFor(prisma: PrismaClient, userIds: string[], thisWeekStart: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!userIds.length) return out;
  const rows = await prisma.xpLedger.findMany({
    where: { userId: { in: userIds }, localDate: { gte: addDays(thisWeekStart, -28), lt: thisWeekStart } },
    select: { userId: true, localDate: true, amount: true },
  });
  const byUser = new Map<string, { localDate: string; amount: number }[]>();
  for (const r of rows) (byUser.get(r.userId) ?? byUser.set(r.userId, []).get(r.userId)!).push(r);
  for (const id of userIds) out.set(id, expectedWeeklyXp(weeklyTotals(byUser.get(id) ?? [], thisWeekStart)));
  return out;
}

/* ---------------- friends ---------------- */

export async function listFriends(ctx: SocialCtx, now = new Date()): Promise<FriendsResponse> {
  const { prisma, userId } = ctx;
  const today = await userToday(prisma, userId, now);
  const month = monthKey(today);
  const ids = await mutualFollowIds(prisma, userId);
  if (!ids.length) return { friends: [] };
  const [cards, streaks, gifts] = await Promise.all([
    hunterCards(prisma, ids),
    prisma.friendStreak.findMany({ where: { OR: [{ userA: userId, userB: { in: ids } }, { userB: userId, userA: { in: ids } }] } }),
    prisma.friendShieldGift.findMany({ where: { month, OR: [{ giverId: userId }, { receiverId: userId }] } }),
  ]);
  const streakOf = new Map(streaks.map((s) => [s.userA === userId ? s.userB : s.userA, s]));
  const friends: FriendStreakDto[] = ids.flatMap((id) => {
    const friend = cards.get(id);
    if (!friend) return [];
    const s = streakOf.get(id);
    return [{
      friend, current: liveFriendStreak(s, today), longest: s?.longest ?? 0, lastBothDate: s?.lastBothDate ?? null,
      giftedThisMonth: shieldGiftedIn(gifts, userId, id, month), receivedThisMonth: shieldGiftedIn(gifts, id, userId, month),
    }];
  });
  friends.sort((a, b) => b.current - a.current || a.friend.handle.localeCompare(b.friend.handle));
  return { friends };
}

/** Gift a Streak Shield to a mutual friend: once per friend per calendar month, capped at SHIELD_CAP banked. */
export async function giftShield(ctx: SocialCtx, friendId: string, now = new Date()) {
  const { prisma, userId } = ctx;
  await member(ctx);
  if (friendId === userId) throw bad(400, 'you can’t gift a shield to yourself');
  if (!(await isMutual(prisma, userId, friendId))) throw bad(403, 'shields can only go to mutual friends');
  const month = monthKey(await userToday(prisma, userId, now));
  const key = { giverId_receiverId_month: { giverId: userId, receiverId: friendId, month } };
  if (await prisma.friendShieldGift.findUnique({ where: key })) throw bad(409, 'you already gifted this friend a shield this month');
  const target = await prisma.hunterState.findUnique({ where: { userId: friendId } });
  if (!target) throw bad(404, 'hunter not found');
  if (target.shields >= SHIELD_CAP) throw bad(409, 'they already carry the maximum number of shields');
  try {
    await prisma.$transaction(async (tx) => {
      await tx.friendShieldGift.create({ data: { giverId: userId, receiverId: friendId, month } });
      await tx.hunterState.update({ where: { userId: friendId }, data: { shields: { increment: 1 } } });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw bad(409, 'you already gifted this friend a shield this month');
    throw e;
  }
  return { ok: true, month };
}

/* ---------------- follow requests ---------------- */

/**
 * Befriend a hunter: a public profile is followed straight away, a private one gets a follow request.
 * Adults and under-18s never connect (same rule as community follows).
 */
export async function connect(ctx: SocialCtx, targetId: string): Promise<{ status: 'following' | 'friends' | 'requested' }> {
  const { prisma, userId } = ctx;
  const v = await member(ctx);
  if (targetId === userId) throw bad(400, 'you can’t befriend yourself');
  const [target, targetProfile, hidden] = await Promise.all([
    prisma.publicProfile.findUnique({ where: { userId: targetId } }),
    prisma.profile.findUnique({ where: { id: targetId }, select: { birthDate: true } }),
    blockedIds(prisma, userId),
  ]);
  if (!target || hidden.has(targetId)) throw bad(404, 'hunter not found');
  if (isMinor(targetProfile?.birthDate ?? null) !== v.isMinor) throw bad(403, 'this hunter’s profile is private');

  const theyFollowMe = !!(await prisma.follow.findUnique({ where: { followerId_followeeId: { followerId: targetId, followeeId: userId } } }));
  const already = await prisma.follow.findUnique({ where: { followerId_followeeId: { followerId: userId, followeeId: targetId } } });
  if (already) return { status: theyFollowMe ? 'friends' : 'following' };

  if (target.isPublic) {
    const total = await prisma.follow.count({ where: { followerId: userId } });
    if (total >= 2000) throw bad(429, 'you follow the maximum number of hunters');
    await prisma.follow.upsert({
      where: { followerId_followeeId: { followerId: userId, followeeId: targetId } },
      create: { followerId: userId, followeeId: targetId }, update: {},
    });
    return { status: theyFollowMe ? 'friends' : 'following' };
  }
  const open = await prisma.followRequest.count({ where: { fromId: userId } });
  if (open >= MAX_OUTGOING_REQUESTS) throw bad(429, 'too many pending requests');
  await prisma.followRequest.upsert({
    where: { fromId_toId: { fromId: userId, toId: targetId } }, create: { fromId: userId, toId: targetId }, update: {},
  });
  return { status: 'requested' };
}

export async function listFollowRequests(ctx: SocialCtx): Promise<{ requests: FollowRequestDto[] }> {
  const { prisma, userId } = ctx;
  const [rows, hidden] = await Promise.all([
    prisma.followRequest.findMany({ where: { toId: userId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    blockedIds(prisma, userId),
  ]);
  const cards = await hunterCards(prisma, rows.map((r) => r.fromId));
  return {
    requests: rows.flatMap((r) => {
      const from = cards.get(r.fromId);
      return from && !hidden.has(r.fromId) ? [{ from, createdAt: r.createdAt.toISOString() }] : [];
    }),
  };
}

export async function acceptFollowRequest(ctx: SocialCtx, fromId: string) {
  const { prisma, userId } = ctx;
  await member(ctx);
  const req = await prisma.followRequest.findUnique({ where: { fromId_toId: { fromId, toId: userId } } });
  if (!req) {
    // idempotent: already accepted
    if (await prisma.follow.findUnique({ where: { followerId_followeeId: { followerId: fromId, followeeId: userId } } })) return { ok: true };
    throw bad(404, 'request not found');
  }
  if ((await blockedIds(prisma, userId)).has(fromId)) throw bad(404, 'request not found');
  await prisma.$transaction([
    prisma.follow.upsert({
      where: { followerId_followeeId: { followerId: fromId, followeeId: userId } },
      create: { followerId: fromId, followeeId: userId }, update: {},
    }),
    prisma.followRequest.deleteMany({ where: { fromId, toId: userId } }),
  ]);
  return { ok: true };
}

export async function declineFollowRequest(ctx: SocialCtx, fromId: string) {
  await ctx.prisma.followRequest.deleteMany({ where: { fromId, toId: ctx.userId } });
  return { ok: true };
}

/** Withdraw a request I sent. */
export async function cancelFollowRequest(ctx: SocialCtx, toId: string) {
  await ctx.prisma.followRequest.deleteMany({ where: { fromId: ctx.userId, toId } });
  return { ok: true };
}

/* ---------------- duels ---------------- */

type DuelRow = Awaited<ReturnType<PrismaClient['duel']['findMany']>>[number];

async function profileTimezones(prisma: PrismaClient, ids: string[]) {
  const rows = await prisma.profile.findMany({ where: { id: { in: ids } }, select: { id: true, timezone: true } });
  return new Map(rows.map((r) => [r.id, r.timezone]));
}

/** Re-sum active duels from the XP ledger (authoritative) and close the ones whose week is over. */
async function syncDuels(prisma: PrismaClient, duels: DuelRow[], now: Date): Promise<DuelRow[]> {
  const active = duels.filter((d) => d.status === 'active');
  if (!active.length) return duels;
  const tzs = await profileTimezones(prisma, [...new Set(active.flatMap((d) => [d.challengerId, d.opponentId]))]);
  const out = [...duels];
  for (const d of active) {
    const side = async (id: string) => {
      const { from, to } = duelDays(d.startsAt, tzs.get(id) ?? 'UTC');
      return (await xpBetween(prisma, [id], from, to)).get(id) ?? 0;
    };
    const [challengerXp, opponentXp] = await Promise.all([side(d.challengerId), side(d.opponentId)]);
    const over = now >= d.endsAt;
    let next: DuelRow = { ...d, challengerXp, opponentXp };
    if (challengerXp !== d.challengerXp || opponentXp !== d.opponentXp || over) {
      if (over) {
        const { count } = await prisma.duel.updateMany({ where: { id: d.id, status: 'active' }, data: { challengerXp, opponentXp, status: 'completed', completedAt: now } });
        if (count) next = { ...next, status: 'completed', completedAt: now };
      } else {
        await prisma.duel.update({ where: { id: d.id }, data: { challengerXp, opponentXp } });
      }
    }
    out[out.indexOf(d)] = next;
  }
  return out;
}

async function toDuelDtos(prisma: PrismaClient, userId: string, rows: DuelRow[]): Promise<DuelDto[]> {
  const cards = await hunterCards(prisma, rows.flatMap((d) => [d.challengerId, d.opponentId]));
  return rows.flatMap((d) => {
    const challenger = cards.get(d.challengerId);
    const opponent = cards.get(d.opponentId);
    if (!challenger || !opponent) return [];
    const done = d.status === 'completed';
    return [{
      id: d.id, status: d.status as DuelDto['status'], challenger, opponent,
      startsAt: d.startsAt.toISOString(), endsAt: d.endsAt.toISOString(),
      challengerXp: d.challengerXp, opponentXp: d.opponentXp, challengerBaseline: d.challengerBaseline, opponentBaseline: d.opponentBaseline,
      challengerScore: duelScores(d.challengerXp, d.challengerBaseline), opponentScore: duelScores(d.opponentXp, d.opponentBaseline),
      winner: done ? duelWinner({ weekXp: d.challengerXp, baseline: d.challengerBaseline }, { weekXp: d.opponentXp, baseline: d.opponentBaseline }) : null,
      mine: d.challengerId === userId ? ('challenger' as const) : ('opponent' as const),
    }];
  });
}

const myDuel = (userId: string) => ({ OR: [{ challengerId: userId }, { opponentId: userId }] });

export async function listDuels(ctx: SocialCtx, now = new Date()): Promise<{ duels: DuelDto[] }> {
  const { prisma, userId } = ctx;
  // an unanswered challenge lapses after a few days
  await prisma.duel.updateMany({
    where: { ...myDuel(userId), status: 'pending', createdAt: { lt: new Date(now.getTime() - PENDING_DUEL_DAYS * DAY) } },
    data: { status: 'cancelled' },
  });
  const [rows, hidden] = await Promise.all([
    prisma.duel.findMany({ where: myDuel(userId), orderBy: { createdAt: 'desc' }, take: 30 }),
    blockedIds(prisma, userId),
  ]);
  const synced = await syncDuels(prisma, rows, now);
  return { duels: await toDuelDtos(prisma, userId, synced.filter((d) => !hidden.has(d.challengerId === userId ? d.opponentId : d.challengerId))) };
}

export async function createDuel(ctx: SocialCtx, input: CreateDuelInput, now = new Date()): Promise<DuelDto> {
  const { prisma, userId } = ctx;
  await member(ctx);
  const dup = await prisma.duel.findUnique({ where: { id: input.id } });
  if (dup) {
    if (dup.challengerId !== userId) throw bad(409, 'duel id already used');
    return (await toDuelDtos(prisma, userId, [dup]))[0]!;
  }
  if (input.opponentId === userId) throw bad(400, 'you can’t duel yourself');
  if (!(await isMutual(prisma, userId, input.opponentId))) throw bad(403, 'you can only duel mutual friends');
  const [between, mine] = await Promise.all([
    prisma.duel.count({
      where: {
        status: { in: ['pending', 'active'] },
        OR: [{ challengerId: userId, opponentId: input.opponentId }, { challengerId: input.opponentId, opponentId: userId }],
      },
    }),
    prisma.duel.count({ where: { ...myDuel(userId), status: { in: ['pending', 'active'] } } }),
  ]);
  if (between) throw bad(409, 'you already have a duel with this hunter');
  if (mine >= MAX_OPEN_DUELS) throw bad(429, 'too many open duels');
  const today = await userToday(prisma, userId, now);
  const base = await baselinesFor(prisma, [userId, input.opponentId], mondayOf(today));
  const row = await prisma.duel.create({
    data: {
      id: input.id, challengerId: userId, opponentId: input.opponentId, status: 'pending', startsAt: now, endsAt: new Date(now.getTime() + DUEL.days * DAY),
      challengerBaseline: base.get(userId)!, opponentBaseline: base.get(input.opponentId)!,
    },
  });
  return (await toDuelDtos(prisma, userId, [row]))[0]!;
}

export async function acceptDuel(ctx: SocialCtx, id: string, now = new Date()): Promise<DuelDto> {
  const { prisma, userId } = ctx;
  await member(ctx);
  const d = await prisma.duel.findUnique({ where: { id } });
  if (!d || d.opponentId !== userId) throw bad(404, 'duel not found');
  if (d.status === 'active') return (await toDuelDtos(prisma, userId, [d]))[0]!;
  if (d.status !== 'pending') throw bad(409, 'this duel is no longer open');
  if (!(await isMutual(prisma, userId, d.challengerId))) throw bad(403, 'you can only duel mutual friends');
  // the week starts now: freeze both baselines at this moment so neither side can game them afterwards
  const base = await baselinesFor(prisma, [userId, d.challengerId], mondayOf(await userToday(prisma, userId, now)));
  const { count } = await prisma.duel.updateMany({
    where: { id, status: 'pending' },
    data: {
      status: 'active', startsAt: now, endsAt: new Date(now.getTime() + DUEL.days * DAY), challengerXp: 0, opponentXp: 0,
      challengerBaseline: base.get(d.challengerId)!, opponentBaseline: base.get(userId)!,
    },
  });
  if (!count) throw bad(409, 'this duel is no longer open');
  return (await toDuelDtos(prisma, userId, [(await prisma.duel.findUnique({ where: { id } }))!]))[0]!;
}

/** The opponent declines; the challenger withdrawing a pending challenge cancels it. */
export async function declineDuel(ctx: SocialCtx, id: string) {
  const { prisma, userId } = ctx;
  const d = await prisma.duel.findUnique({ where: { id } });
  if (!d || (d.opponentId !== userId && d.challengerId !== userId)) throw bad(404, 'duel not found');
  if (d.status !== 'pending') {
    if (d.status === 'declined' || d.status === 'cancelled') return { ok: true };
    throw bad(409, 'this duel is no longer open');
  }
  await prisma.duel.updateMany({ where: { id, status: 'pending' }, data: { status: d.opponentId === userId ? 'declined' : 'cancelled' } });
  return { ok: true };
}

/* ---------------- guilds ---------------- */

type GuildRow = Awaited<ReturnType<PrismaClient['guild']['findMany']>>[number];

const guildDto = (g: GuildRow, memberCount: number, myRole: GuildDto['myRole']): GuildDto => ({
  id: g.id, name: g.name, code: g.code, isPublic: g.isPublic, language: g.language, timezone: g.timezone, memberCount, myRole,
});

const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

async function myMembership(prisma: PrismaClient, userId: string) {
  return prisma.guildMember.findUnique({ where: { userId } });
}

async function requireGuildMember(prisma: PrismaClient, userId: string, guildId: string) {
  const m = await myMembership(prisma, userId);
  if (!m || m.guildId !== guildId) throw bad(404, 'guild not found');
  return m;
}

export async function createGuild(ctx: SocialCtx, input: CreateGuildInput & { name: string; isPublic: boolean; language: string | null; timezone: string }): Promise<GuildDto> {
  const { prisma, userId } = ctx;
  await member(ctx);
  const dup = await prisma.guild.findUnique({ where: { id: input.id } });
  if (dup) {
    if (dup.leaderId !== userId) throw bad(409, 'guild id already used');
    return guildDto(dup, await prisma.guildMember.count({ where: { guildId: dup.id } }), 'leader');
  }
  if (await myMembership(prisma, userId)) throw bad(409, 'leave your current guild first');
  if (localCheck(input.name)) throw bad(400, 'that guild name is not available');
  if (!validTimezone(input.timezone)) throw bad(400, 'unknown timezone');
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const g = await prisma.$transaction(async (tx) => {
        const guild = await tx.guild.create({
          data: { id: input.id, name: input.name, code: newCode(), isPublic: input.isPublic, language: input.language, timezone: input.timezone, leaderId: userId },
        });
        await tx.guildMember.create({ data: { guildId: guild.id, userId, role: 'leader' } });
        return guild;
      });
      return guildDto(g, 1, 'leader');
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // one guild per hunter: a concurrent create beat us, otherwise it was a join-code collision: retry
      if (await myMembership(prisma, userId)) throw bad(409, 'leave your current guild first');
      if (await prisma.guild.findUnique({ where: { id: input.id } })) throw bad(409, 'guild id already used');
    }
  }
  throw bad(409, 'could not create a guild right now, try again');
}

/** Public guilds with room, newest first. */
export async function listGuilds(ctx: SocialCtx, language?: string): Promise<{ guilds: GuildDto[] }> {
  const rows = await ctx.prisma.guild.findMany({
    where: { isPublic: true, ...(language ? { language } : {}) },
    orderBy: { createdAt: 'desc' }, take: 60, include: { _count: { select: { members: true } } },
  });
  return { guilds: rows.filter((g) => guildHasRoom(g._count.members)).slice(0, 30).map((g) => guildDto(g, g._count.members, null)) };
}

export async function myGuild(ctx: SocialCtx): Promise<{ guild: GuildDto | null }> {
  const { prisma, userId } = ctx;
  const m = await myMembership(prisma, userId);
  if (!m) return { guild: null };
  const g = await prisma.guild.findUnique({ where: { id: m.guildId }, include: { _count: { select: { members: true } } } });
  return { guild: g ? guildDto(g, g._count.members, m.role as GuildDto['myRole']) : null };
}

export async function getGuild(ctx: SocialCtx, id: string): Promise<{ guild: GuildDto; members: GuildMemberDto[] }> {
  const { prisma, userId } = ctx;
  const [g, mine] = await Promise.all([
    prisma.guild.findUnique({ where: { id }, include: { members: { orderBy: { joinedAt: 'asc' } } } }),
    myMembership(prisma, userId),
  ]);
  const isMine = mine?.guildId === id;
  if (!g || (!g.isPublic && !isMine)) throw bad(404, 'guild not found');
  const cards = await hunterCards(prisma, g.members.map((m) => m.userId));
  return {
    guild: guildDto(g, g.members.length, isMine ? (mine!.role as GuildDto['myRole']) : null),
    members: g.members.flatMap((m) => {
      const user = cards.get(m.userId);
      return user ? [{ user, role: m.role as GuildMemberDto['role'], joinedAt: m.joinedAt.toISOString() }] : [];
    }),
  };
}

export async function joinGuild(ctx: SocialCtx, input: JoinGuildInput): Promise<GuildDto> {
  const { prisma, userId } = ctx;
  await member(ctx);
  const g = await prisma.guild.findUnique({ where: { code: input.code.trim().toUpperCase() } });
  if (!g) throw bad(404, 'no guild with that code');
  const mine = await myMembership(prisma, userId);
  if (mine) {
    if (mine.guildId === g.id) return guildDto(g, await prisma.guildMember.count({ where: { guildId: g.id } }), mine.role as GuildDto['myRole']);
    throw bad(409, 'leave your current guild first');
  }
  if (!guildHasRoom(await prisma.guildMember.count({ where: { guildId: g.id } }))) throw bad(409, 'this guild is full');
  try {
    await prisma.guildMember.create({ data: { guildId: g.id, userId, role: 'member' } });
  } catch (e) {
    if (isUniqueViolation(e)) throw bad(409, 'leave your current guild first');
    throw e;
  }
  // two hunters taking the last seat at once: the later joiner steps back out
  const total = await prisma.guildMember.count({ where: { guildId: g.id } });
  if (total > GUILD_MAX) {
    await prisma.guildMember.deleteMany({ where: { guildId: g.id, userId } });
    throw bad(409, 'this guild is full');
  }
  return guildDto(g, total, 'member');
}

/** Leaving as the leader hands the guild to the longest-standing officer (then member); the last one out closes it. */
export async function leaveGuild(ctx: SocialCtx, guildId: string) {
  const { prisma, userId } = ctx;
  const mine = await requireGuildMember(prisma, userId, guildId);
  await prisma.$transaction(async (tx) => {
    await tx.guildMember.deleteMany({ where: { guildId, userId } });
    if (mine.role !== 'leader') return;
    const rest = await tx.guildMember.findMany({ where: { guildId }, orderBy: { joinedAt: 'asc' } });
    const heir = rest.find((m) => m.role === 'officer') ?? rest[0];
    if (!heir) {
      await tx.guild.delete({ where: { id: guildId } });
      return;
    }
    await tx.guildMember.update({ where: { guildId_userId: { guildId, userId: heir.userId } }, data: { role: 'leader' } });
    await tx.guild.update({ where: { id: guildId }, data: { leaderId: heir.userId } });
  });
  return { ok: true };
}

/* ---------------- guild chat ---------------- */

type GuildMessageRow = Awaited<ReturnType<PrismaClient['guildMessage']['findMany']>>[number];

function toGuildMessage(r: GuildMessageRow, author: GuildMessageDto['author'], userId: string): GuildMessageDto {
  return { id: r.id, author, body: r.body, status: r.status as GuildMessageDto['status'], mine: r.authorId === userId, createdAt: r.createdAt.toISOString() };
}

export async function listGuildMessages(ctx: SocialCtx, guildId: string, before?: string): Promise<{ messages: GuildMessageDto[] }> {
  const { prisma, userId } = ctx;
  await requireGuildMember(prisma, userId, guildId);
  const hidden = [...(await blockedIds(prisma, userId))];
  const cutoff = before ? new Date(before) : undefined;
  const rows = await prisma.guildMessage.findMany({
    where: {
      guildId, authorId: { notIn: hidden },
      OR: [{ status: 'visible' }, { authorId: userId, status: { in: ['pending', 'hidden'] } }],
      ...(cutoff && !Number.isNaN(cutoff.getTime()) ? { createdAt: { lt: cutoff } } : {}),
    },
    orderBy: { createdAt: 'desc' }, take: 50,
  });
  const cards = await hunterCards(prisma, rows.map((r) => r.authorId));
  return {
    messages: rows.reverse().flatMap((r) => {
      const author = cards.get(r.authorId);
      return author ? [toGuildMessage(r, author, userId)] : [];
    }),
  };
}

export async function postGuildMessage(ctx: SocialCtx, guildId: string, input: CreateGuildMessageInput & { body: string }): Promise<GuildMessageDto> {
  const { prisma, userId } = ctx;
  const v = await member(ctx);
  await requireGuildMember(prisma, userId, guildId);
  const card = (await hunterCards(prisma, [userId])).get(userId);
  if (!card) throw bad(403, 'pick a hunter handle first');
  const dup = await prisma.guildMessage.findUnique({ where: { id: input.id } });
  if (dup) {
    if (dup.authorId !== userId || dup.guildId !== guildId) throw bad(409, 'message id already used');
    return toGuildMessage(dup, card, userId);
  }
  if (v.isMinor) throw bad(403, 'guild chat is for hunters 18 and over');
  if (v.trustLevel < 1) throw bad(403, 'guild chat unlocks after 3 days and 3 workouts');
  const recent = await prisma.guildMessage.count({ where: { authorId: userId, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
  if (recent >= MESSAGES_PER_HOUR) throw bad(429, 'too many messages; take a breather');
  const verdict = await moderate(input.body, { classifier: ctx.classifier, trustLevel: v.trustLevel, extraWords: ctx.extraWords });
  const row = await prisma.guildMessage.create({ data: { id: input.id, guildId, authorId: userId, body: input.body, status: verdict.allow ? 'visible' : 'pending' } });
  await audit(prisma, 'guild_message', row.id, verdict);
  return toGuildMessage(row, card, userId);
}

/* ---------------- raids ---------------- */

const raidEndsAt = (weekStart: string) => new Date(`${addDays(weekStart, 7)}T03:00:00Z`);

/**
 * The guild's raid for the current week (Monday in the guild's timezone). Created on first read: boss HP is
 * 0.8 × the sum of expected weekly XP of members active in the last 14 days (new joiners count). Every read
 * re-sums member XP for the week from the ledger, so contributions are always the ledger's truth.
 */
async function ensureRaid(prisma: PrismaClient, guild: { id: string; timezone: string }, now: Date) {
  const today = gameDate(now, guild.timezone);
  const week = mondayOf(today);
  const members = await prisma.guildMember.findMany({ where: { guildId: guild.id } });
  const ids = members.map((m) => m.userId);
  const key = { guildId_weekStart: { guildId: guild.id, weekStart: week } };
  let raid = await prisma.raid.findUnique({ where: key, include: { parts: true } });

  if (!raid) {
    const [expected, recent] = await Promise.all([
      baselinesFor(prisma, ids, week),
      xpBetween(prisma, ids, addDays(today, -RAID.activeDays), today),
    ]);
    const since = addDays(today, -RAID.activeDays);
    const active = members.filter((m) => (recent.get(m.userId) ?? 0) > 0 || gameDate(m.joinedAt, guild.timezone) >= since);
    const bossHp = raidBossHp(active.map((m) => expected.get(m.userId)!));
    const id = randomUUID();
    try {
      await prisma.raid.create({
        data: { id, guildId: guild.id, weekStart: week, bossHp, parts: { create: members.map((m) => ({ userId: m.userId, expectedXp: expected.get(m.userId)! })) } },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // two first reads at once: use the winner's raid
    }
    raid = (await prisma.raid.findUnique({ where: key, include: { parts: true } }))!;
  }

  // members who joined after the boss spawned fight too, without changing its HP
  const missing = ids.filter((id) => !raid!.parts.some((p) => p.userId === id));
  if (missing.length) {
    const expected = await baselinesFor(prisma, missing, week);
    await prisma.raidContribution.createMany({ data: missing.map((userId) => ({ raidId: raid!.id, userId, expectedXp: expected.get(userId)! })), skipDuplicates: true });
    raid = (await prisma.raid.findUnique({ where: key, include: { parts: true } }))!;
  }

  const xp = await xpBetween(prisma, raid.parts.map((p) => p.userId), week, addDays(week, 6));
  const parts = raid.parts.map((p) => ({ ...p, xp: xp.get(p.userId) ?? 0 }));
  for (const p of parts) {
    const old = raid.parts.find((x) => x.userId === p.userId)!;
    if (old.xp !== p.xp) await prisma.raidContribution.update({ where: { raidId_userId: { raidId: raid.id, userId: p.userId } }, data: { xp: p.xp } });
  }
  const damageTotal = parts.reduce((s, p) => s + p.xp, 0);
  const clearedAt = raid.clearedAt ?? (raidCleared(damageTotal, raid.bossHp) ? now : null);
  if (damageTotal !== raid.damageTotal || clearedAt?.getTime() !== raid.clearedAt?.getTime()) {
    await prisma.raid.update({ where: { id: raid.id }, data: { damageTotal, clearedAt } });
  }
  return { raid: { ...raid, damageTotal, clearedAt }, parts };
}

export async function getRaid(ctx: SocialCtx, guildId: string, now = new Date()): Promise<RaidDto> {
  const { prisma, userId } = ctx;
  await requireGuildMember(prisma, userId, guildId);
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guild) throw bad(404, 'guild not found');
  const { raid, parts } = await ensureRaid(prisma, guild, now);
  const cards = await hunterCards(prisma, parts.map((p) => p.userId));
  const state = raidState(parts, raid.bossHp);
  const contributions: RaidContributionDto[] = parts.flatMap((p, i) => {
    const user = cards.get(p.userId);
    return user ? [{ user, xp: p.xp, expectedXp: p.expectedXp, contribution: Math.round(state.contributions[i]!.contribution * 1000) / 1000, earnsLoot: state.contributions[i]!.earnsLoot }] : [];
  });
  contributions.sort((a, b) => b.contribution - a.contribution || a.user.handle.localeCompare(b.user.handle));
  return {
    id: raid.id, weekStart: raid.weekStart, bossHp: raid.bossHp, damageTotal: raid.damageTotal,
    hpLeftRatio: Math.round(state.hpLeftRatio * 10_000) / 10_000, cleared: !!raid.clearedAt, endsAt: raidEndsAt(raid.weekStart).toISOString(), contributions,
  };
}

/* ---------------- leagues ---------------- */

/**
 * Closes a finished league week: every unsettled group of `weekStart` gets final XP (re-summed from the ledger)
 * and a `place` per member (ties share the best place), then `settledAt`. Each group is claimed with a
 * conditional update, so concurrent callers settle it once. Callers must only pass weeks that are over.
 * Returns how many groups this call settled.
 */
export async function settleLeagueWeek(prisma: PrismaClient, weekStart: string, now = new Date()): Promise<number> {
  const groups = await prisma.leagueGroup.findMany({ where: { weekStart, settledAt: null }, include: { members: true } });
  let settled = 0;
  for (const g of groups) {
    const ids = g.members.map((m) => m.userId);
    const xp = await xpBetween(prisma, ids, weekStart, addDays(weekStart, 6));
    const places = leaguePlaces(g.members.map((m) => ({ userId: m.userId, xp: xp.get(m.userId) ?? 0 })));
    const claimed = await prisma.$transaction(async (tx) => {
      const { count } = await tx.leagueGroup.updateMany({ where: { id: g.id, settledAt: null }, data: { settledAt: now } });
      if (!count) return false;
      for (const p of places) await tx.leagueMember.update({ where: { groupId_userId: { groupId: g.id, userId: p.userId } }, data: { xp: p.xp, place: p.place } });
      return true;
    });
    if (claimed) settled++;
  }
  return settled;
}

/**
 * The tier a hunter starts a week in, from how they finished the previous week (promote top 7, demote bottom 5).
 * No previous league, or an unsettled/unplaced one, means Bronze. Finishing at the top with zero XP never promotes.
 */
export function startingTier(prev: { tier: string; place: number | null; xp: number } | null): LeagueTier {
  if (!prev || prev.place == null || !LEAGUE.tiers.includes(prev.tier as LeagueTier)) return 'Bronze';
  const tier = prev.tier as LeagueTier;
  const next = nextLeagueTier(tier, prev.place);
  return prev.xp <= 0 && LEAGUE.tiers.indexOf(next) > LEAGUE.tiers.indexOf(tier) ? tier : next;
}

/**
 * Joins the hunter to a group (<30) of the tier earned last week (Bronze for newcomers or after a skipped week).
 * Last week is settled on the spot if nobody has done it yet.
 */
export async function ensureLeagueMembership(prisma: PrismaClient, userId: string, week: string, now = new Date()) {
  const existing = await prisma.leagueMember.findFirst({ where: { userId, group: { weekStart: week } } });
  if (existing) return existing.groupId;
  const prevWeek = mondayOf(addDays(week, -7));
  let prev = await prisma.leagueMember.findFirst({ where: { userId, group: { weekStart: prevWeek } }, include: { group: true } });
  if (prev && !prev.group.settledAt) {
    await settleLeagueWeek(prisma, prevWeek, now);
    prev = await prisma.leagueMember.findFirst({ where: { userId, group: { weekStart: prevWeek } }, include: { group: true } });
  }
  const tier = startingTier(prev?.group.settledAt ? { tier: prev.group.tier, place: prev.place, xp: prev.xp } : null);
  const weekXp = (await xpBetween(prisma, [userId], week, addDays(week, 6))).get(userId) ?? 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    const groups = await prisma.leagueGroup.findMany({
      where: { weekStart: week, tier }, orderBy: { index: 'asc' }, include: { _count: { select: { members: true } } },
    });
    let group = groups.find((g) => g._count.members < LEAGUE.size);
    if (!group) {
      try {
        const created = await prisma.leagueGroup.create({ data: { id: randomUUID(), weekStart: week, tier, index: (groups.at(-1)?.index ?? -1) + 1 } });
        group = { ...created, _count: { members: 0 } };
      } catch (e) {
        if (isUniqueViolation(e)) continue; // another hunter opened the next group first
        throw e;
      }
    }
    try {
      await prisma.leagueMember.create({ data: { groupId: group.id, userId, xp: weekXp } });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      return (await prisma.leagueMember.findFirst({ where: { userId, group: { weekStart: week } } }))?.groupId ?? group.id;
    }
    // last seat taken twice: the later one steps out and tries the next group
    if ((await prisma.leagueMember.count({ where: { groupId: group.id } })) > LEAGUE.size) {
      await prisma.leagueMember.deleteMany({ where: { groupId: group.id, userId } });
      continue;
    }
    return group.id;
  }
  throw bad(409, 'leagues are busy right now, try again');
}

/** Moderator-only: settle last week's groups now instead of waiting for the lazy settle in `getLeague`. */
export async function settleLastLeagueWeek(ctx: SocialCtx, now = new Date()) {
  if (!ctx.moderatorIds?.includes(ctx.userId)) throw bad(403, 'moderators only');
  const week = mondayOf(await userToday(ctx.prisma, ctx.userId, now));
  const weekStart = mondayOf(addDays(week, -7));
  return { weekStart, settled: await settleLeagueWeek(ctx.prisma, weekStart, now) };
}

export async function getLeague(ctx: SocialCtx, now = new Date()): Promise<LeagueDto> {
  const { prisma, userId } = ctx;
  const v = await member(ctx);
  if (v.isMinor) throw bad(403, 'leagues are for hunters 18 and over');
  if (!v.pub?.isPublic) throw bad(403, 'make your profile public to join leagues');
  const week = mondayOf(await userToday(prisma, userId, now));
  // last week's groups close lazily: the first hunter to open the league after Monday settles them
  await settleLeagueWeek(prisma, mondayOf(addDays(week, -7)), now);
  const groupId = await ensureLeagueMembership(prisma, userId, week, now);
  const [group, rows, hidden] = await Promise.all([
    prisma.leagueGroup.findUniqueOrThrow({ where: { id: groupId } }),
    prisma.leagueMember.findMany({ where: { groupId } }),
    blockedIds(prisma, userId),
  ]);
  const xp = await xpBetween(prisma, rows.map((r) => r.userId), week, addDays(week, 6));
  for (const r of rows) {
    const live = xp.get(r.userId) ?? 0;
    if (live !== r.xp) await prisma.leagueMember.update({ where: { groupId_userId: { groupId, userId: r.userId } }, data: { xp: live } });
  }
  const places = new Map(leaguePlaces(rows.map((r) => ({ userId: r.userId, xp: xp.get(r.userId) ?? 0 }))).map((p) => [p.userId, p]));
  const cards = await hunterCards(prisma, rows.map((r) => r.userId));
  const members = rows
    .filter((r) => r.userId === userId || !hidden.has(r.userId))
    .flatMap((r) => {
      const user = cards.get(r.userId);
      const p = places.get(r.userId)!;
      return user ? [{ user, xp: p.xp, place: p.place, mine: r.userId === userId }] : [];
    })
    .sort((a, b) => (a.place ?? 0) - (b.place ?? 0) || a.user.handle.localeCompare(b.user.handle));
  return {
    id: group.id, weekStart: week, tier: group.tier as LeagueDto['tier'], members, myPlace: places.get(userId)?.place ?? null,
    promoteThrough: LEAGUE.promote, demoteFrom: LEAGUE.size - LEAGUE.demote + 1,
  };
}

/* ---------------- DMs (mutual follows, both 18+, text only) ---------------- */

async function assertCanDm(ctx: SocialCtx, v: Awaited<ReturnType<typeof member>>, peerId: string) {
  const { prisma, userId } = ctx;
  if (peerId === userId) throw bad(400, 'you can’t message yourself');
  if (v.isMinor) throw bad(403, 'messages are for hunters 18 and over');
  const [hidden, peer, mutual] = await Promise.all([
    blockedIds(prisma, userId),
    prisma.profile.findUnique({ where: { id: peerId }, select: { birthDate: true, publicProfile: { select: { handle: true } } } }),
    isMutual(prisma, userId, peerId),
  ]);
  if (!peer?.publicProfile || hidden.has(peerId)) throw bad(404, 'hunter not found');
  if (!mutual) throw bad(403, 'you can only message hunters you follow each other');
  if (isMinor(peer.birthDate)) throw bad(403, 'that hunter can’t receive messages');
}

async function conversationWith(prisma: PrismaClient, userId: string, peerId: string, create: boolean) {
  const [userA, userB] = pairKey(userId, peerId);
  const key = { userA_userB: { userA, userB } };
  const found = await prisma.conversation.findUnique({ where: key });
  if (found || !create) return found;
  try {
    return await prisma.conversation.create({ data: { id: randomUUID(), userA, userB, status: 'open' } });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    return prisma.conversation.findUnique({ where: key });
  }
}

type MessageRow = Awaited<ReturnType<PrismaClient['message']['findMany']>>[number];
const toMessage = (m: MessageRow, userId: string): MessageDto => ({
  id: m.id, senderId: m.senderId, body: m.body, status: m.status as MessageDto['status'], mine: m.senderId === userId, createdAt: m.createdAt.toISOString(),
});

const shownTo = (userId: string) => ({ OR: [{ status: 'visible' }, { senderId: userId, status: { in: ['pending', 'hidden'] } }] });

type ConversationRow = { id: string; userA: string; userB: string; status: string; readAtA?: Date | null; readAtB?: Date | null };

/** Which read marker belongs to `userId`: A/B follow the pairKey ordering of userA/userB. */
const myReadAt = (c: ConversationRow, userId: string) => (c.userA === userId ? c.readAtA : c.readAtB) ?? null;

async function conversationDto(prisma: PrismaClient, userId: string, c: ConversationRow, peer: ConversationDto['peer']): Promise<ConversationDto> {
  const readAt = myReadAt(c, userId);
  const [last, unread] = await Promise.all([
    prisma.message.findFirst({ where: { conversationId: c.id, ...shownTo(userId) }, orderBy: { createdAt: 'desc' } }),
    // only the peer's visible messages count: my own and held ones never make a badge
    prisma.message.count({ where: { conversationId: c.id, senderId: peer.userId, status: 'visible', ...(readAt ? { createdAt: { gt: readAt } } : {}) } }),
  ]);
  return { id: c.id, peer, status: c.status === 'request' ? 'request' : 'open', lastBody: last?.body ?? null, lastAt: last?.createdAt.toISOString() ?? null, unread };
}

export async function listConversations(ctx: SocialCtx): Promise<{ conversations: ConversationDto[] }> {
  const { prisma, userId } = ctx;
  const [rows, hidden] = await Promise.all([
    // newest threads first (lastMessageAt is set on every send), so a busy inbox never drops the latest one
    prisma.conversation.findMany({ where: { OR: [{ userA: userId }, { userB: userId }] }, orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }], take: 50 }),
    blockedIds(prisma, userId),
  ]);
  const peerOf = (c: { userA: string; userB: string }) => (c.userA === userId ? c.userB : c.userA);
  const cards = await hunterCards(prisma, rows.map(peerOf));
  const out = (await Promise.all(rows.map(async (c) => {
    const peer = cards.get(peerOf(c));
    return peer && !hidden.has(peer.userId) ? conversationDto(prisma, userId, c, peer) : null;
  }))).filter((c): c is ConversationDto => !!c);
  out.sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
  return { conversations: out };
}

export async function openConversation(ctx: SocialCtx, peerId: string): Promise<ConversationDto> {
  const v = await member(ctx);
  await assertCanDm(ctx, v, peerId);
  const c = (await conversationWith(ctx.prisma, ctx.userId, peerId, true))!;
  const peer = (await hunterCards(ctx.prisma, [peerId])).get(peerId);
  if (!peer) throw bad(404, 'hunter not found');
  return conversationDto(ctx.prisma, ctx.userId, c, peer);
}

/** The conversation if `userId` is in it and the peer isn't blocked; 404 otherwise. */
async function ownConversation(prisma: PrismaClient, userId: string, conversationId: string) {
  const c = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!c || (c.userA !== userId && c.userB !== userId)) throw bad(404, 'conversation not found');
  if ((await blockedIds(prisma, userId)).has(c.userA === userId ? c.userB : c.userA)) throw bad(404, 'conversation not found');
  return c;
}

async function markRead(prisma: PrismaClient, userId: string, c: { id: string; userA: string }, now: Date) {
  await prisma.conversation.update({ where: { id: c.id }, data: c.userA === userId ? { readAtA: now } : { readAtB: now } });
}

/** Marks the thread read for me (sets my readAtA/readAtB to now); the peer's marker is untouched. */
export async function markConversationRead(ctx: SocialCtx, conversationId: string, now = new Date()) {
  const c = await ownConversation(ctx.prisma, ctx.userId, conversationId);
  await markRead(ctx.prisma, ctx.userId, c, now);
  return { ok: true, readAt: now.toISOString() };
}

/** Opening a thread counts as reading it (clients can also call POST /conversations/:id/read explicitly). */
export async function listMessages(ctx: SocialCtx, conversationId: string, before?: string, now = new Date()): Promise<{ messages: MessageDto[] }> {
  const { prisma, userId } = ctx;
  const c = await ownConversation(prisma, userId, conversationId);
  // only opening the newest page counts as reading; scrolling back through history writes nothing
  if (!before) await markRead(prisma, userId, c, now);
  const cutoff = before ? new Date(before) : undefined;
  const rows = await prisma.message.findMany({
    where: { conversationId, ...shownTo(userId), ...(cutoff && !Number.isNaN(cutoff.getTime()) ? { createdAt: { lt: cutoff } } : {}) },
    orderBy: { createdAt: 'desc' }, take: 50,
  });
  return { messages: rows.reverse().map((m) => toMessage(m, userId)) };
}

export async function sendMessage(ctx: SocialCtx, input: SendMessageInput & { body: string }): Promise<MessageDto> {
  const { prisma, userId } = ctx;
  const v = await member(ctx);
  const dup = await prisma.message.findUnique({ where: { id: input.id } });
  if (dup) {
    if (dup.senderId !== userId) throw bad(409, 'message id already used');
    return toMessage(dup, userId);
  }
  await assertCanDm(ctx, v, input.peerId);
  const recent = await prisma.message.count({ where: { senderId: userId, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
  if (recent >= MESSAGES_PER_HOUR) throw bad(429, 'too many messages; take a breather');
  const c = (await conversationWith(prisma, userId, input.peerId, true))!;
  const verdict = await moderate(input.body, { classifier: ctx.classifier, trustLevel: v.trustLevel, extraWords: ctx.extraWords });
  const row = await prisma.message.create({ data: { id: input.id, conversationId: c.id, senderId: userId, body: input.body, status: verdict.allow ? 'visible' : 'pending' } });
  // keeps the inbox ordered without scanning messages
  await prisma.conversation.update({ where: { id: c.id }, data: { lastMessageAt: row.createdAt } });
  await audit(prisma, 'message', row.id, verdict);
  return toMessage(row, userId);
}

/* ---------------- Hunter License ---------------- */

export async function getLicense(ctx: SocialCtx): Promise<HunterLicenseDto> {
  const { prisma, userId } = ctx;
  const p = await prisma.profile.findUnique({
    where: { id: userId },
    select: {
      hunterName: true, heroId: true, heroClass: true, publicProfile: { select: { handle: true } },
      state: { select: { level: true, rank: true, streak: true, str: true, agi: true, end: true, vit: true, spi: true } },
    },
  });
  if (!p?.publicProfile) throw bad(404, 'pick a hunter handle to get your license');
  const s = p.state;
  const level = s?.level ?? 1;
  const stats = { STR: displayStat(s?.str ?? 10), AGI: displayStat(s?.agi ?? 10), END: displayStat(s?.end ?? 10), VIT: displayStat(s?.vit ?? 10), SPI: displayStat(s?.spi ?? 10) };
  const rank = s?.rank === 'SOVEREIGN' ? 'S' : ((s?.rank ?? 'E') as HunterLicenseDto['rank']);
  return {
    handle: p.publicProfile.handle, hunterName: p.hunterName, heroId: p.heroId, heroClass: (p.heroClass as HunterLicenseDto['heroClass']) ?? null,
    rank, level, powerLevel: powerLevel(stats, level), title: null, stats, streak: s?.streak ?? 0,
  };
}
