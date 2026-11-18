import type { PrismaClient } from '@lb/db';
import { applyDailyCap, levelFromXp } from '@lb/engine';
import { apForLevelUp } from './ap';

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;

/**
 * The single place XP is granted outside workouts (quests, bosses, trials share it):
 * daily cap → ledger row (parent event must exist) → HunterState xp/level/AP → rewards for the celebration queue.
 */
export async function grantXp(tx: Tx, i: { userId: string; eventId: string; localDate: string; amount: number; reason: string }) {
  const state = await tx.hunterState.findUnique({ where: { userId: i.userId } });
  if (!state || i.amount <= 0) return [] as unknown[];
  const today = await tx.xpLedger.aggregate({ where: { userId: i.userId, localDate: i.localDate }, _sum: { amount: true } });
  const cap = applyDailyCap(today._sum.amount ?? 0, i.amount);
  const rewards: unknown[] = [];
  if (cap.granted > 0) {
    await tx.xpLedger.create({ data: { eventId: i.eventId, userId: i.userId, localDate: i.localDate, amount: cap.granted, reason: i.reason } });
    const from = levelFromXp(state.xp);
    const to = levelFromXp(state.xp + cap.granted);
    const ap = apForLevelUp(state, to);
    await tx.hunterState.update({ where: { userId: i.userId }, data: { xp: state.xp + cap.granted, level: to, ...ap.data } });
    rewards.push({ type: 'xp', amount: cap.granted, reason: i.reason });
    if (to > from) rewards.push({ type: 'levelUp', from, to, ap: ap.ap });
  }
  if (cap.dropped > 0) rewards.push({ type: 'capReached', dropped: cap.dropped });
  return rewards;
}
