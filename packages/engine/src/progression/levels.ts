/** Level curve — SYSTEMS.md §4.2. cumulativeXP(L) = round(65 × (L − 1)^1.77). */
import { LEVEL_CURVE } from '../constants';

export const MAX_LEVEL = 200;

export function cumulativeXp(level: number): number {
  if (level <= 1) return 0;
  return Math.round(LEVEL_CURVE.a * (level - 1) ** LEVEL_CURVE.p);
}

export const xpToNext = (level: number) => cumulativeXp(level + 1) - cumulativeXp(level);

export function levelFromXp(xp: number): number {
  if (xp <= 0) return 1;
  let level = Math.floor(1 + (xp / LEVEL_CURVE.a) ** (1 / LEVEL_CURVE.p));
  // guard float edges against the rounded table
  while (level > 1 && cumulativeXp(level) > xp) level--;
  while (level < MAX_LEVEL && cumulativeXp(level + 1) <= xp) level++;
  return Math.min(level, MAX_LEVEL);
}

export function levelProgress(xp: number): { level: number; intoLevel: number; needed: number; ratio: number } {
  const level = levelFromXp(xp);
  const intoLevel = xp - cumulativeXp(level);
  const needed = xpToNext(level);
  return { level, intoLevel, needed, ratio: needed > 0 ? intoLevel / needed : 1 };
}

/** Ability Points gained for reaching `level` (+1 per level, +2 bonus at multiples of 10). */
export const apForLevel = (level: number) => (level <= 1 ? 0 : 1 + (level % 10 === 0 ? 2 : 0));

/** Total AP earned going from level `from` to level `to`. */
export function apBetween(from: number, to: number): number {
  let ap = 0;
  for (let l = from + 1; l <= to; l++) ap += apForLevel(l);
  return ap;
}
