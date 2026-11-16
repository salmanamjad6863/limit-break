import { describe, expect, it } from 'vitest';
import { boardEligible, consistencyScore, hotScore, improvementScore, isXpAnomaly, rankScores, trustLevel } from '../src';

const stats = (v: number) => ({ STR: v, AGI: v, END: v, VIT: v, SPI: v });

describe('monthly boards', () => {
  it('consistency: perfect month = 100, needs 8 planned sessions', () => {
    expect(consistencyScore({ sessionsDone: 12, sessionsPlanned: 12, questDays: 30, daysInMonth: 30 })).toBe(100);
    expect(consistencyScore({ sessionsDone: 6, sessionsPlanned: 12, questDays: 15, daysInMonth: 30 })).toBe(50);
    expect(consistencyScore({ sessionsDone: 7, sessionsPlanned: 7, questDays: 30, daysInMonth: 30 })).toBeNull();
  });
  it('improvement: capped +15/stat and needs tests 21+ days apart', () => {
    const base = { date: '2026-11-01', stats: stats(20) };
    expect(improvementScore(base, { date: '2026-11-15', stats: stats(30) })).toBeNull();
    expect(improvementScore(base, { date: '2026-11-25', stats: stats(30) })).toBe(50); // +10 × 5 / 100
    expect(improvementScore(base, { date: '2026-11-25', stats: stats(90) })).toBe(75); // capped at +15 each
  });
  it('xp anomaly at z > 3 against own history', () => {
    const hist = [300, 320, 280, 310, 290, 300, 305, 295];
    expect(isXpAnomaly(500, hist)).toBe(true);
    expect(isXpAnomaly(340, hist)).toBe(false);
  });
  it('competition ranking keeps ties', () => expect(rankScores([100, 90, 90, 80])).toEqual([1, 2, 2, 4]));
});

describe('feed and trust', () => {
  it('newer posts beat older ones with equal engagement', () => {
    expect(hotScore({ respect: 10, comments: 2, shares: 0, ageHours: 1 })).toBeGreaterThan(
      hotScore({ respect: 10, comments: 2, shares: 0, ageHours: 24 }),
    );
  });
  it('trust levels unlock gradually', () => {
    expect(trustLevel({ accountDays: 1, workoutsLogged: 5, level: 3, upheldReports90d: 0 })).toBe(0);
    expect(trustLevel({ accountDays: 4, workoutsLogged: 3, level: 3, upheldReports90d: 0 })).toBe(1);
    expect(trustLevel({ accountDays: 20, workoutsLogged: 20, level: 12, upheldReports90d: 0 })).toBe(2);
    expect(trustLevel({ accountDays: 90, workoutsLogged: 80, level: 30, upheldReports90d: 1 })).toBe(1);
  });
  it('minors and guests never appear on global boards', () => {
    const ok = { ageYears: 25, isGuest: false, accountDays: 30, publicProfile: true, cheatFlagThisMonth: false };
    expect(boardEligible(ok)).toBe(true);
    expect(boardEligible({ ...ok, ageYears: 16 })).toBe(false);
    expect(boardEligible({ ...ok, isGuest: true })).toBe(false);
  });
});
