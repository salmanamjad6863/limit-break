/**
 * Account deletion and data export — required by the App Store (5.1.1(v)) and Google Play,
 * and GDPR (erasure + portability). Deletion is permanent and complete.
 */
import type { PrismaClient } from '@lb/db';

/**
 * Everything the user owns, in one JSON document (portability). Excludes shared reference data
 * (exercise catalogue, Open Food Facts cache).
 */
export async function exportData(prisma: PrismaClient, userId: string) {
  const [profile, state, workouts, records, quests, foodLogs, customFoods, nutritionDays, body, tdee, targets, trials, notes, ledger] = await Promise.all([
    prisma.profile.findUnique({ where: { id: userId } }),
    prisma.hunterState.findUnique({ where: { userId } }),
    prisma.workoutSession.findMany({ where: { userId }, include: { sets: true } }),
    prisma.personalRecord.findMany({ where: { userId } }),
    prisma.questInstance.findMany({ where: { userId } }),
    prisma.foodLog.findMany({ where: { userId } }),
    prisma.food.findMany({ where: { ownerId: userId } }),
    prisma.nutritionDay.findMany({ where: { userId } }),
    prisma.bodyMetric.findMany({ where: { userId } }),
    prisma.tdeeEstimate.findMany({ where: { userId } }),
    prisma.nutritionTarget.findMany({ where: { userId } }),
    prisma.trialAttempt.findMany({ where: { userId } }),
    prisma.exerciseNote.findMany({ where: { userId } }),
    prisma.xpLedger.findMany({ where: { userId } }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    format: 'limitbreak-export/1',
    profile, state, workouts, records, quests, foodLogs, customFoods, nutritionDays, body, tdee, targets, trials, notes, xpLedger: ledger,
  };
}

export class AccountError extends Error {
  constructor(public status: 400 | 502, message: string) {
    super(message);
  }
}

/**
 * Deletes all of the user's data, then the auth user. Safe to retry: a second call with the
 * data already gone still removes the auth user.
 */
export async function deleteAccount(prisma: PrismaClient, userId: string, deleteAuthUser?: (userId: string) => Promise<void>) {
  await prisma.$transaction(async (tx) => {
    // rows that don't cascade from Profile
    await tx.nutritionDay.deleteMany({ where: { userId } });
    await tx.food.deleteMany({ where: { ownerId: userId } });
    // everything else cascades: sessions/sets, quests, events → XP ledger, nutrition, body, trials, notes, entitlements…
    await tx.profile.deleteMany({ where: { id: userId } });
  });
  if (deleteAuthUser) {
    try {
      await deleteAuthUser(userId);
    } catch {
      throw new AccountError(502, 'your data is deleted, but signing out of the account failed; try again');
    }
  }
  return { deleted: true, authUserDeleted: !!deleteAuthUser };
}
