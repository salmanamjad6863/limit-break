import { describe, expect, it } from 'vitest';
import {
  addDays, adjustQuestScale, displayStreak, estimateQuestSeconds, generateDailyQuest, newStreakState, penaltyQuestOptions,
  resolveStreak, shadowBoss, type DayRecord,
} from '../src';

describe('Daily Quest (§4.6)', () => {
  it('scales from baselines; training days are lighter', () => {
    const q = generateDailyQuest({ baselines: { pushups: 20, plankSec: 60, squats60: 40 }, experience: 'novice', scale: 0.6, trainingDay: false });
    expect(q.map((s) => [s.exerciseId, s.target])).toEqual([['push-up', 12], ['bodyweight-squat', 24], ['plank', 35]]);
    const light = generateDailyQuest({ baselines: { pushups: 20, plankSec: 60, squats60: 40 }, experience: 'novice', scale: 0.6, trainingDay: true });
    expect(light[0]!.target).toBe(7); // 20 × 0.6 × 0.6
  });
  it('weak push-ups → knee push-ups; injuries swap slots', () => {
    const q = generateDailyQuest({ baselines: { pushups: 3, plankSec: 20, squats60: 20 }, experience: 'beginner', scale: 0.6, trainingDay: false });
    expect(q[0]!.exerciseId).toBe('knee-push-up');
    const inj = generateDailyQuest({ baselines: {}, experience: 'novice', scale: 0.6, trainingDay: false, injuries: ['wrist', 'knee', 'shoulder'] });
    expect(inj.map((s) => s.exerciseId)).toEqual(['glute-bridge', 'glute-bridge', 'dead-bug']);
  });
  it('Ranger gets a walk; the quest stays within 12 minutes', () => {
    const q = generateDailyQuest({ baselines: { pushups: 60, plankSec: 300, squats60: 60 }, experience: 'advanced', scale: 1, trainingDay: false, heroClass: 'RANGER' });
    expect(q.at(-1)).toMatchObject({ exerciseId: 'brisk-walk', unit: 'min' });
    expect(q.at(-1)!.target).toBeGreaterThanOrEqual(3);
    expect(estimateQuestSeconds(q)).toBeLessThanOrEqual(12 * 60);
  });
  it('penalty quests respect injuries', () => {
    expect(penaltyQuestOptions({ scale: 0.6 }).map((o) => o[0]!.exerciseId)).toEqual(['burpee', 'wall-sit']);
    expect(penaltyQuestOptions({ scale: 0.6, injuries: ['knee'] }).map((o) => o[0]!.exerciseId)).toEqual(['plank']);
  });
  it('scale: +0.02 for a 5/7 week, −0.10 after two fails, clamped', () => {
    expect(adjustQuestScale(0.6, { weekCompletions: 5 })).toBe(0.62);
    expect(adjustQuestScale(0.45, { consecutiveFails: 2 })).toBe(0.4);
    expect(adjustQuestScale(0.99, { weekCompletions: 7 })).toBe(1);
  });
});

const done: DayRecord = { dailyDone: true, penaltyDone: false, sick: false };
const miss: DayRecord = { dailyDone: false, penaltyDone: false, sick: false };
const days = (start: string, list: DayRecord[]) => Object.fromEntries(list.map((r, i) => [addDays(start, i), r]));

describe('Streaks (§4.5)', () => {
  it('counts completed days and keeps the longest', () => {
    const { state } = resolveStreak(newStreakState(), days('2026-11-02', [done, done, done]), '2026-11-04', '2026-11-02');
    expect(state).toMatchObject({ streak: 3, longest: 3, lastResolved: '2026-11-04' });
  });
  it('a missed day uses a shield first', () => {
    const { state, events } = resolveStreak(newStreakState(), days('2026-11-02', [done, miss, done]), '2026-11-04', '2026-11-02');
    expect(state.streak).toBe(2);
    expect(state.shields).toBe(1);
    expect(events.map((e) => e.type)).toContain('shieldUsed');
  });
  it('no shields → Penalty Zone; daily + penalty next day saves the streak', () => {
    const s0 = { ...newStreakState(), shields: 0, shieldsMonth: '2026-11', streak: 5, longest: 5, lastResolved: '2026-11-01' };
    const r1 = resolveStreak(s0, days('2026-11-02', [miss]), '2026-11-02', '2026-11-02');
    expect(r1.state.penaltyDate).toBe('2026-11-02');
    const saved = resolveStreak(r1.state, { '2026-11-03': { dailyDone: true, penaltyDone: true, sick: false } }, '2026-11-03', '2026-11-02');
    expect(saved.state).toMatchObject({ streak: 6, penaltyDate: null });
    const lost = resolveStreak(r1.state, { '2026-11-03': done }, '2026-11-03', '2026-11-02');
    expect(lost.state.streak).toBe(1);
    expect(lost.events).toContainEqual({ type: 'streakReset', date: '2026-11-03', lost: 5 });
    expect(lost.state.longest).toBe(5);
  });
  it('sick days freeze the streak, max 7 per rolling 30 days', () => {
    const sick = { dailyDone: false, penaltyDone: false, sick: true };
    const s0 = { ...newStreakState(), shields: 0, shieldsMonth: '2026-11', streak: 4, longest: 4, lastResolved: '2026-11-01' };
    const r = resolveStreak(s0, days('2026-11-02', Array(8).fill(sick)), '2026-11-09', '2026-11-02');
    expect(r.state.sickDates).toHaveLength(7);
    expect(r.state.penaltyDate).toBe('2026-11-09'); // the 8th sick day counts as a miss
    expect(r.state.streak).toBe(4);
  });
  it('shields refill each month and resolution is idempotent', () => {
    const s0 = { ...newStreakState(), shields: 0, shieldsMonth: '2026-10', lastResolved: '2026-10-31' };
    const r = resolveStreak(s0, days('2026-11-01', [miss]), '2026-11-01', '2026-11-01');
    expect(r.state.shields).toBe(1);
    expect(resolveStreak(r.state, days('2026-11-01', [miss]), '2026-11-01', '2026-11-01').state).toEqual(r.state);
  });
  it('display adds today; a redemption day needs both quests', () => {
    expect(displayStreak({ ...newStreakState(), streak: 3 }, { dailyDone: true, penaltyDone: false })).toBe(4);
    expect(displayStreak({ ...newStreakState(), streak: 3, penaltyDate: '2026-11-02' }, { dailyDone: true, penaltyDone: false })).toBe(3);
  });
});

describe('Shadow-Self boss (§4.7)', () => {
  const zero = { hardSets: 0, volumeKg: 0, cardioMin: 0, questDays: 0 };
  it('beats the past self by the tier margin', () => {
    const past = { hardSets: 40, volumeKg: 8000, cardioMin: 60, questDays: 5 };
    const r = shadowBoss({ current: { hardSets: 42, volumeKg: 8400, cardioMin: 63, questDays: 5 }, past, planned: zero, experience: 'novice' });
    expect(r.won).toBe(true);
    const lose = shadowBoss({ current: { hardSets: 20, volumeKg: 4000, cardioMin: 30, questDays: 3 }, past, planned: zero, experience: 'novice' });
    expect(lose.won).toBe(false);
    expect(lose.hpPct).toBeGreaterThan(40);
  });
  it('first weeks use the plan ("prophecy") and skip empty metrics', () => {
    const r = shadowBoss({ current: { hardSets: 15, volumeKg: 0, cardioMin: 0, questDays: 3 }, past: null, planned: { hardSets: 30, volumeKg: 0, cardioMin: 0, questDays: 7 }, experience: 'beginner' });
    expect(r.prophecy).toBe(true);
    expect(r.score).toBeCloseTo((0.35 * 0.5 + 0.2 * (3 / 7)) / 0.55, 3);
  });
});
