import { describe, expect, it } from 'vitest';
import { challengeProblems, challengeProgress, CHALLENGE_XP, defaultGraceDays, taskTarget, type Challenge } from '../src';

const pushups: Challenge = {
  id: 'c1', name: '30-day push-ups', days: 10, graceDays: 2, startDate: '2026-11-01', status: 'ACTIVE',
  tasks: [
    { id: 't1', kind: 'exercise', exerciseId: 'push-up', title: 'Push-ups', target: 20, unit: 'reps', addPerStep: 2, stepDays: 1 },
    { id: 't2', kind: 'habit', title: 'Drink 3 L water' },
  ],
};
const both = ['t1', 't2'];

describe('habit challenges', () => {
  it('targets ramp up by day', () => {
    expect(taskTarget(pushups.tasks[0]!, 1)).toBe(20);
    expect(taskTarget(pushups.tasks[0]!, 5)).toBe(28);
    expect(taskTarget({ ...pushups.tasks[0]!, addPerStep: 5, stepDays: 3 }, 7)).toBe(30);
    expect(taskTarget(pushups.tasks[1]!, 5)).toBeNull();
  });

  it('a day counts only when every task is done; today stays open', () => {
    const p = challengeProgress(pushups, { '2026-11-01': both, '2026-11-02': both, '2026-11-03': ['t1'] }, '2026-11-03');
    expect(p).toMatchObject({ dayNumber: 3, completedDays: 2, misses: 0, counted: 2, todayDone: false, finished: false });
    expect(p.calendar.slice(0, 3).map((d) => d.state)).toEqual(['done', 'done', 'partial']);
    // 8 days left, starting today
    expect(p.projectedEnd).toBe('2026-11-10');
  });

  it('is always flexible: grace covers the first misses, later misses push the end back, nothing restarts', () => {
    const ins = { '2026-11-01': both, '2026-11-05': both, '2026-11-06': both };
    const p = challengeProgress(pushups, ins, '2026-11-07');
    // missed 02, 03, 04: two are grace, one is a real miss
    expect(p).toMatchObject({ completedDays: 3, misses: 3, graceUsed: 2, graceLeft: 0, counted: 5, flawless: false });
    expect(p.calendar.slice(1, 4).map((d) => d.state)).toEqual(['grace', 'grace', 'missed']);
    // 5 left from today: ends on the 11th, one day later than planned (the 10th)
    expect(p.projectedEnd).toBe('2026-11-11');
  });

  it('finishes when the counted days reach the length; later check-ins do not matter', () => {
    const ins: Record<string, string[]> = {};
    for (let d = 1; d <= 10; d++) ins[`2026-11-${String(d).padStart(2, '0')}`] = both;
    const p = challengeProgress(pushups, ins, '2026-11-12');
    expect(p).toMatchObject({ finished: true, counted: 10, flawless: true, projectedEnd: null });
    expect(p.calendar).toHaveLength(10);
  });

  it('before the start date the whole span is still ahead', () => {
    const p = challengeProgress({ ...pushups, startDate: '2026-11-20' }, {}, '2026-11-18');
    expect(p.projectedEnd).toBe('2026-11-29');
    expect(p.calendar.every((d) => d.state === 'future')).toBe(true);
  });

  it('validates and rewards sensibly', () => {
    const known = (id: string) => id === 'push-up';
    expect(challengeProblems(pushups, known)).toEqual([]);
    expect(challengeProblems({ ...pushups, name: '', tasks: [] }, known)).toEqual(['Give the challenge a name.', 'Add at least one daily task.']);
    expect(challengeProblems({ ...pushups, tasks: [{ id: 'x', kind: 'exercise', title: '', exerciseId: 'nope', target: 10 }] }, known)).toEqual(['An exercise task has no valid exercise.']);
    expect(defaultGraceDays(60)).toBe(6);
    expect(CHALLENGE_XP.finish(60)).toBe(170);
    expect(CHALLENGE_XP.finish(365)).toBe(250);
  });
});
