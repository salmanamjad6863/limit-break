/** XP sources and caps — SYSTEMS.md §4.1. */
import { XP } from '../constants';
import { isHardSet, type LoggedSet, type Zone } from '../training';

export function setXp(s: LoggedSet): number {
  if (!isHardSet(s)) return 0;
  const effort =
    s.rir == null ? XP.effortUnknownRir : (XP.effortByRir[Math.min(s.rir, XP.effortByRir.length - 1)] ?? 0);
  return XP.setBase * effort;
}

export const cardioXp = (minutes: number, zone: Zone) => XP.cardioPerMinute * XP.zoneFactor[zone] * minutes;

export interface SessionXpInput {
  sets: readonly LoggedSet[];
  plannedHardSets: number;
  cardio?: readonly { minutes: number; zone: Zone }[];
  prCount: number;
}

export interface SessionXpResult {
  setXp: number;
  cardioXp: number;
  completionBonus: number;
  prBonus: number;
  total: number;
  completion: number;
  hardSets: number;
  ignoredSets: number;
}

export function sessionXp(i: SessionXpInput): SessionXpResult {
  const hard = i.sets.filter(isHardSet);
  const maxCounted = Math.floor(Math.max(i.plannedHardSets, 1) * XP.extraSetsMultiplier);
  const counted = hard.slice(0, maxCounted);
  const sXp = counted.reduce((sum, s) => sum + setXp(s), 0);
  const cXp = (i.cardio ?? []).reduce((sum, c) => sum + cardioXp(c.minutes, c.zone), 0);
  // The completion bonus rewards finishing a PROGRAMMED session. Cardio-only / interval sessions
  // (no planned sets) earn their XP purely from minutes × zone, so a short session can't farm it.
  const completion = i.plannedHardSets > 0 ? Math.min(1, hard.length / i.plannedHardSets) : 0;
  const completionBonus = i.plannedHardSets > 0 && completion >= XP.completionThreshold ? XP.completionBonus * completion : 0;
  const prBonus = Math.min(i.prCount, XP.prBonusMaxPerSession) * XP.prBonus;
  return {
    setXp: sXp,
    cardioXp: cXp,
    completionBonus,
    prBonus,
    total: Math.round(sXp + cXp + completionBonus + prBonus),
    completion,
    hardSets: hard.length,
    ignoredSets: hard.length - counted.length,
  };
}

export const dailyQuestXp = (streakDays: number) =>
  XP.dailyQuest + Math.min(Math.max(0, streakDays), XP.dailyQuestStreakBonusMax);

/** Apply the 500/day cap. Returns the amount actually granted. */
export function applyDailyCap(alreadyEarnedToday: number, amount: number): { granted: number; dropped: number } {
  const room = Math.max(0, XP.dailyCap - alreadyEarnedToday);
  const granted = Math.min(room, Math.max(0, amount));
  return { granted, dropped: Math.max(0, amount) - granted };
}
