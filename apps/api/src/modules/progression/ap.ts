import { apBetween } from '@lb/engine';

/**
 * Attribute Points are paid once per level, ever: only levels above the highest level already paid for
 * earn AP, so editing a workout down and back up (or delete + re-finish) can't farm points.
 * Returns the AP to grant and the HunterState fields to write alongside the new level.
 */
export function apForLevelUp(state: { level: number; apGrantedLevel?: number | null }, to: number) {
  const paid = Math.max(state.level, state.apGrantedLevel ?? state.level);
  const ap = to > paid ? apBetween(paid, to) : 0;
  return { ap, data: { apGrantedLevel: Math.max(paid, to), ...(ap > 0 ? { apUnspent: { increment: ap } } : {}) } };
}
