/**
 * Essence grants/spends for Avatar Forge (docs/AVATAR.md).
 * Never touches XP, stats, or rank. Daily earn cap mirrors the soft ceiling in VISUALS §7.1.
 */
import type { PrismaClient } from '@lb/db';

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;

export const ESSENCE_DAILY_CAP = 60;
export const ESSENCE_WORKOUT = 10;

export class EssenceError extends Error {
  constructor(public status: 400 | 409, message: string) {
    super(message);
  }
}

/** Idempotent credit. Caps positive grants per localDate; spends (amount < 0) are uncapped here — caller checks balance. */
export async function grantEssence(
  tx: Tx,
  i: { userId: string; eventId: string; localDate: string; amount: number; reason: string },
): Promise<{ granted: number; balance: number }> {
  const existing = await tx.essenceLedger.findUnique({ where: { eventId_reason: { eventId: i.eventId, reason: i.reason } } });
  if (existing) {
    const state = await tx.hunterState.findUnique({ where: { userId: i.userId } });
    return { granted: existing.amount, balance: state?.essence ?? 0 };
  }
  if (i.amount === 0) {
    const state = await tx.hunterState.findUnique({ where: { userId: i.userId } });
    return { granted: 0, balance: state?.essence ?? 0 };
  }

  let amount = i.amount;
  if (amount > 0) {
    const today = await tx.essenceLedger.aggregate({
      where: { userId: i.userId, localDate: i.localDate, amount: { gt: 0 } },
      _sum: { amount: true },
    });
    const earned = today._sum.amount ?? 0;
    const room = Math.max(0, ESSENCE_DAILY_CAP - earned);
    amount = Math.min(amount, room);
    if (amount <= 0) {
      const state = await tx.hunterState.findUnique({ where: { userId: i.userId } });
      return { granted: 0, balance: state?.essence ?? 0 };
    }
  }

  if (amount < 0) {
    const state = await tx.hunterState.findUnique({ where: { userId: i.userId } });
    if (!state || state.essence + amount < 0) throw new EssenceError(400, 'not enough Essence');
  }

  try {
    await tx.essenceLedger.create({
      data: { eventId: i.eventId, userId: i.userId, localDate: i.localDate, amount, reason: i.reason },
    });
  } catch {
    const again = await tx.essenceLedger.findUnique({ where: { eventId_reason: { eventId: i.eventId, reason: i.reason } } });
    const state = await tx.hunterState.findUnique({ where: { userId: i.userId } });
    if (again) return { granted: again.amount, balance: state?.essence ?? 0 };
    throw new EssenceError(409, 'essence write conflict');
  }

  const updated = await tx.hunterState.update({
    where: { userId: i.userId },
    data: { essence: { increment: amount } },
  });
  return { granted: amount, balance: updated.essence };
}
