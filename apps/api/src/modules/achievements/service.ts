/**
 * Achievements: stats from real activity → tiers earned (permanent) → XP once per tier.
 * Only workouts logged live count (manual logs are unverified), like the leaderboards.
 */
import { randomUUID } from 'node:crypto';
import { achievements } from '@lb/content';
import type { AchievementsResponse } from '@lb/contracts';
import type { PrismaClient } from '@lb/db';
import { earnedTitles, evaluateAchievements, gameDate, RANK_INDEX, tierEssence, tierXp, timingStats, type AchievementStats } from '@lb/engine';
import { grantEssence } from '../avatar/essence';
import { isUniqueViolation } from '../../lib/db';
import { grantXp } from '../progression/xp';

export class AchievementError extends Error {
  constructor(public status: 400 | 404, message: string) {
    super(message);
  }
}

const done = { source: 'app', finishedAt: { not: null } } as const;

export async function achievementStats(prisma: PrismaClient, userId: string, timezone: string): Promise<AchievementStats> {
  const [state, workouts, prs, routineWorkouts, cardio, dailyQuests, challenges, flawless, trials, bosses, nutritionDays, volume, sessions] = await Promise.all([
    prisma.hunterState.findUnique({ where: { userId }, select: { level: true, rank: true, longest: true, streak: true } }),
    prisma.workoutSession.count({ where: { userId, ...done } }),
    prisma.personalRecord.count({ where: { userId } }),
    prisma.workoutSession.count({ where: { userId, ...done, programId: { startsWith: 'custom-' } } }),
    prisma.workoutSession.aggregate({ where: { userId, ...done }, _sum: { cardioMinutes: true } }),
    prisma.questInstance.count({ where: { userId, kind: 'DAILY', status: 'COMPLETED' } }),
    prisma.challenge.count({ where: { userId, status: 'COMPLETED' } }),
    prisma.event.count({ where: { userId, type: 'challenge.completed', payload: { path: ['flawless'], equals: true } } }),
    prisma.trialAttempt.count({ where: { userId, passed: true } }),
    prisma.questInstance.count({ where: { userId, kind: 'BOSS', status: 'COMPLETED' } }),
    prisma.nutritionDay.count({ where: { userId, markedComplete: true } }),
    // userId is a bound parameter, never interpolated
    prisma.$queryRaw<{ kg: number | null }[]>`
      SELECT COALESCE(SUM(ws."weightKg" * ws."reps"), 0)::float AS kg
      FROM "WorkoutSet" ws JOIN "WorkoutSession" s ON s."id" = ws."sessionId"
      WHERE s."userId" = ${userId}::uuid AND s."source" = 'app' AND ws."isWarmup" = false`,
    prisma.workoutSession.findMany({ where: { userId, ...done }, select: { startedAt: true, finishedAt: true, localDate: true }, orderBy: { startedAt: 'desc' }, take: 3000 }),
  ]);
  return {
    workouts, prs, routineWorkouts, dailyQuests, challenges, flawlessChallenges: flawless, trials, bosses, nutritionDays,
    tonnes: Math.floor((volume[0]?.kg ?? 0) / 1000),
    cardioMinutes: Math.round(cardio._sum.cardioMinutes ?? 0),
    streak: Math.max(state?.longest ?? 0, state?.streak ?? 0),
    level: state?.level ?? 1,
    rank: RANK_INDEX[state?.rank ?? 'E'] ?? 0,
    ...timingStats(sessions, timezone),
  };
}

/** Evaluate, record new tiers (each paid once even if two checks race), and return the trophy case. */
export async function checkAchievements(prisma: PrismaClient, userId: string, now = new Date()): Promise<AchievementsResponse> {
  const profile = await prisma.profile.findUnique({ where: { id: userId }, select: { timezone: true, title: true } });
  if (!profile) throw new AchievementError(404, 'profile not found');
  const tz = profile.timezone ?? 'UTC';
  const [stats, rows] = await Promise.all([
    achievementStats(prisma, userId, tz),
    prisma.achievementUnlock.findMany({ where: { userId } }),
  ]);
  const earnedBefore = new Map<string, number>();
  for (const r of rows) earnedBefore.set(r.achievementId, Math.max(earnedBefore.get(r.achievementId) ?? -1, r.tier));
  const { newUnlocks } = evaluateAchievements(achievements, stats, earnedBefore);

  const rewards: unknown[] = [];
  const today = gameDate(now, tz);
  for (const u of newUnlocks) {
    const def = achievements.find((a) => a.id === u.id)!;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.achievementUnlock.create({ data: { userId, achievementId: u.id, tier: u.tier, unlockedAt: now } });
        const eventId = randomUUID();
        await tx.event.create({ data: { id: eventId, userId, type: 'achievement.unlocked', localDate: today, clientTs: now, payload: { achievementId: u.id, tier: u.tier } } });
        rewards.push({ type: 'achievement', achievementId: u.id, tier: u.tier });
        rewards.push(...(await grantXp(tx, { userId, eventId, localDate: today, amount: tierXp(def, u.tier), reason: `achievement:${u.id}:${u.tier}` })));
        // Essence for frames and auras (its own daily cap; cosmetics only)
        await grantEssence(tx, { userId, eventId, localDate: today, amount: tierEssence(def, u.tier), reason: 'achievement' });
      });
    } catch (e) {
      // a concurrent check recorded (and paid) this tier first
      if (!isUniqueViolation(e)) throw e;
    }
  }
  return trophyCase(prisma, userId, stats, profile.title, rewards);
}

async function trophyCase(prisma: PrismaClient, userId: string, stats: AchievementStats, equipped: string | null, rewards: unknown[]): Promise<AchievementsResponse> {
  const rows = await prisma.achievementUnlock.findMany({ where: { userId } });
  const earned = new Map<string, number>();
  const unlockedAt = new Map<string, Record<string, string>>();
  for (const r of rows) {
    earned.set(r.achievementId, Math.max(earned.get(r.achievementId) ?? -1, r.tier));
    unlockedAt.set(r.achievementId, { ...unlockedAt.get(r.achievementId), [String(r.tier)]: r.unlockedAt.toISOString() });
  }
  const { progress } = evaluateAchievements(achievements, stats, earned);
  const titles = earnedTitles(achievements, earned);
  return {
    progress: progress.map((p) => ({ id: p.id, value: p.value, earned: p.earned, next: p.next, ratio: p.ratio, unlockedAt: unlockedAt.get(p.id) ?? {} })),
    titles,
    equippedTitle: equipped && titles.some((t) => t.title === equipped) ? equipped : null,
    rewards,
  };
}

/** Wear an earned title (or none). */
export async function equipTitle(prisma: PrismaClient, userId: string, title: string | null) {
  if (title) {
    const rows = await prisma.achievementUnlock.findMany({ where: { userId } });
    const earned = new Map<string, number>();
    for (const r of rows) earned.set(r.achievementId, Math.max(earned.get(r.achievementId) ?? -1, r.tier));
    if (!earnedTitles(achievements, earned).some((t) => t.title === title)) throw new AchievementError(400, 'title not earned');
  }
  await prisma.profile.update({ where: { id: userId }, data: { title } });
  return { equippedTitle: title };
}
