import type { Reward } from '@lb/contracts';
import type { PrismaClient } from '@lb/db';
import { createMilestone } from './service';

/** Streak lengths worth a feed post (SYSTEMS.md §5.2). */
export const STREAK_MILESTONES = [30, 100, 365];

/**
 * Turns server rewards into milestone posts (only for hunters who joined the community; followers-only).
 * Runs after the workout/trial transaction has committed; never throws.
 */
export async function postMilestones(prisma: PrismaClient, userId: string, eventId: string, rewards: readonly unknown[]) {
  for (const r of rewards as Reward[]) {
    if (r.type === 'pr') {
      await createMilestone(prisma, userId, { kind: 'pr', exerciseId: r.exerciseId, e1rmKg: Math.round(r.e1rmKg * 10) / 10, previousKg: null }, `${eventId}:pr:${r.exerciseId}`);
    } else if (r.type === 'rankUp') {
      await createMilestone(prisma, userId, { kind: 'rank_up', from: r.from, to: r.to }, `${eventId}:rank:${r.to}`);
    } else if (r.type === 'levelUp') {
      // every 5th level, once per level
      const top = Math.floor(r.to / 5) * 5;
      if (top > r.from && top >= 5) await createMilestone(prisma, userId, { kind: 'level', level: top }, `level:${top}`);
    }
  }
}

export async function postStreakMilestone(prisma: PrismaClient, userId: string, days: number, date: string) {
  if (STREAK_MILESTONES.includes(days)) await createMilestone(prisma, userId, { kind: 'streak', days }, `streak:${days}:${date}`);
}
