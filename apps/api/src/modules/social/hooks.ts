/**
 * Social side-effects of progression events (SYSTEMS.md §5.6). Kept free of community/workout imports so the
 * quests and workouts services can call them without an import cycle. Every hook is best-effort: a social
 * counter must never fail a workout or a quest, so errors are logged and swallowed.
 */
import type { PrismaClient } from '@lb/db';
import { addDays, gameDate, pairKey } from '@lb/engine';

/** Monday (YYYY-MM-DD) of the ISO week containing `iso`. */
export const mondayOf = (iso: string) => addDays(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));

/** YYYY-MM of a game date: the key for the once-a-month Streak Shield gift. */
export const monthKey = (localDate: string) => localDate.slice(0, 7);

/** Duels last a fixed number of game days, counted in the player's own timezone. */
export function duelDays(startsAt: Date, timeZone: string, days = 7): { from: string; to: string } {
  const from = gameDate(startsAt, timeZone);
  return { from, to: addDays(from, days - 1) };
}

export interface FriendStreakRow {
  current: number;
  longest: number;
  lastBothDate: string | null;
}

/** Both friends completed the Daily Quest on `localDate`: +1 if the last shared day was yesterday, else restart at 1. */
export function nextFriendStreak(row: FriendStreakRow | null, localDate: string): FriendStreakRow {
  if (row?.lastBothDate === localDate) return row; // already counted today (idempotent)
  const current = row?.lastBothDate === addDays(localDate, -1) ? row.current + 1 : 1;
  return { current, longest: Math.max(row?.longest ?? 0, current), lastBothDate: localDate };
}

/** Partial test doubles (and a not-yet-migrated database) don't have the social tables: skip quietly. */
const hasSocialTables = (prisma: PrismaClient) => typeof (prisma as { follow?: { findMany?: unknown } }).follow?.findMany === 'function' && !!(prisma as { friendStreak?: unknown }).friendStreak;

/** Mutual follows of a hunter (both directions follow each other). */
export async function mutualFollowIds(prisma: Pick<PrismaClient, 'follow'>, userId: string): Promise<string[]> {
  const [out, inn] = await Promise.all([
    prisma.follow.findMany({ where: { followerId: userId }, select: { followeeId: true } }),
    prisma.follow.findMany({ where: { followeeId: userId }, select: { followerId: true } }),
  ]);
  const back = new Set(inn.map((f) => f.followerId));
  return out.map((f) => f.followeeId).filter((id) => back.has(id));
}

/**
 * After a Daily Quest completes: for every mutual friend who also completed theirs on `localDate`,
 * advance the shared FriendStreak. Safe to call twice for the same day.
 */
export async function onDailyQuestComplete(prisma: PrismaClient, userId: string, localDate: string): Promise<void> {
  if (!hasSocialTables(prisma)) return;
  try {
    const friends = await mutualFollowIds(prisma, userId);
    if (!friends.length) return;
    const done = await prisma.questInstance.findMany({
      where: { userId: { in: friends }, kind: 'DAILY', templateId: 'daily', status: 'COMPLETED', localDate },
      select: { userId: true },
    });
    for (const { userId: friendId } of done) {
      const [userA, userB] = pairKey(userId, friendId);
      const key = { userA_userB: { userA, userB } };
      const row = await prisma.friendStreak.findUnique({ where: key });
      const next = nextFriendStreak(row, localDate);
      if (row?.lastBothDate === next.lastBothDate) continue;
      if (row) await prisma.friendStreak.update({ where: key, data: next });
      else await prisma.friendStreak.create({ data: { userA, userB, ...next } });
    }
  } catch (e) {
    console.error('friend streak update failed', e);
  }
}

/**
 * After XP is granted for `localDate`: add it to the hunter's active duels, to this week's raid contribution
 * (and the raid's damage total) and to this week's league standing. The read paths re-sum from the XP ledger,
 * so a missed or doubled bump heals itself; this just keeps the boards live between reads.
 */
export async function onWeeklyXp(prisma: PrismaClient, userId: string, localDate: string, amount: number): Promise<void> {
  if (amount <= 0 || !hasSocialTables(prisma)) return;
  try {
    const profile = await prisma.profile.findUnique({ where: { id: userId }, select: { timezone: true } });
    const tz = profile?.timezone ?? 'UTC';
    const week = mondayOf(localDate);

    const duels = await prisma.duel.findMany({
      where: { status: 'active', OR: [{ challengerId: userId }, { opponentId: userId }] },
    });
    for (const d of duels) {
      const { from, to } = duelDays(d.startsAt, tz);
      if (localDate < from || localDate > to) continue;
      await prisma.duel.update({
        where: { id: d.id },
        data: d.challengerId === userId ? { challengerXp: { increment: amount } } : { opponentXp: { increment: amount } },
      });
    }

    const membership = await prisma.guildMember.findUnique({ where: { userId } });
    if (membership) {
      const raid = await prisma.raid.findUnique({ where: { guildId_weekStart: { guildId: membership.guildId, weekStart: week } } });
      if (raid) {
        const part = await prisma.raidContribution.findUnique({ where: { raidId_userId: { raidId: raid.id, userId } } });
        if (part) {
          await prisma.raidContribution.update({ where: { raidId_userId: { raidId: raid.id, userId } }, data: { xp: { increment: amount } } });
          await prisma.raid.update({ where: { id: raid.id }, data: { damageTotal: { increment: amount } } });
        }
      }
    }

    await prisma.leagueMember.updateMany({ where: { userId, group: { weekStart: week } }, data: { xp: { increment: amount } } });
  } catch (e) {
    console.error('weekly xp update failed', e);
  }
}
