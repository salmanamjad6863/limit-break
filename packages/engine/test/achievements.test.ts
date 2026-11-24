import { describe, expect, it } from 'vitest';
import {
  closestAchievement, describeTier, earnedTitles, evaluateAchievements, tierName, tierXp, timingStats, type AchievementDefLike,
} from '../src';

const defs: AchievementDefLike[] = [
  { id: 'iron', metric: 'workouts', describe: 'Finish {n} workouts', tiers: [{ at: 1 }, { at: 25 }, { at: 100, title: 'Iron Devotee' }, { at: 365, title: 'Unbreakable' }] },
  { id: 'rank', metric: 'rank', describe: 'Reach {label}', tiers: [{ at: 1, label: 'D-Rank' }, { at: 2, label: 'C-Rank' }, { at: 4, label: 'A-Rank' }, { at: 5, label: 'S-Rank' }] },
  { id: 'dawn', metric: 'dawnWorkouts', describe: 'Train before 6 AM {n} times', hidden: true, tiers: [{ at: 7, title: 'Dawn Hunter' }] },
];

describe('achievements', () => {
  it('unlocks every tier reached since last time, once', () => {
    const r = evaluateAchievements(defs, { workouts: 120, rank: 1 }, new Map([['iron', 0]]));
    expect(r.newUnlocks).toEqual([{ id: 'iron', tier: 1 }, { id: 'iron', tier: 2 }, { id: 'rank', tier: 0 }]);
    const again = evaluateAchievements(defs, { workouts: 120, rank: 1 }, new Map([['iron', 2], ['rank', 0]]));
    expect(again.newUnlocks).toEqual([]);
  });

  it('progress runs from the last earned tier to the next; earned tiers are never lost', () => {
    const r = evaluateAchievements(defs, { workouts: 50 }, new Map([['iron', 1]]));
    // from the silver threshold (25) to gold (100): 50 is a third of the way
    expect(r.progress[0]).toMatchObject({ value: 50, earned: 1, next: 100 });
    expect(r.progress[0]!.ratio).toBeCloseTo(1 / 3);
    // a deleted workout drops the count below 25: the silver tier stays
    expect(evaluateAchievements(defs, { workouts: 20 }, new Map([['iron', 1]])).progress[0]).toMatchObject({ reached: 0, earned: 1, ratio: 0 });
    expect(evaluateAchievements(defs, { workouts: 400 }, new Map([['iron', 3]])).progress[0]).toMatchObject({ next: null, ratio: 1 });
  });

  it('tiers, XP, wording, titles and the next-up nudge', () => {
    expect([tierName(defs[0]!, 0), tierName(defs[0]!, 3), tierName(defs[2]!, 0)]).toEqual(['bronze', 'platinum', 'gold']);
    expect([tierXp(defs[0]!, 0), tierXp(defs[0]!, 3), tierXp(defs[2]!, 0)]).toEqual([25, 250, 150]);
    expect(describeTier(defs[0]!, 3)).toBe('Finish 365 workouts');
    expect(describeTier(defs[1]!, 1)).toBe('Reach C-Rank');
    expect(earnedTitles(defs, new Map([['iron', 2], ['dawn', 0]])).map((t) => t.title)).toEqual(['Iron Devotee', 'Dawn Hunter']);
    const { progress } = evaluateAchievements(defs, { workouts: 20, rank: 1, dawnWorkouts: 6 }, new Map([['iron', 0], ['rank', 0]]));
    // dawn is closer (6/7) but hidden, so the nudge points at workouts (19/24 of the way to 25)
    expect(closestAchievement(defs, progress)?.id).toBe('iron');
  });

  it('times sessions in the hunter’s time zone', () => {
    const s = (start: string, minutes: number, localDate: string) => ({ startedAt: start, finishedAt: new Date(Date.parse(start) + minutes * 60_000).toISOString(), localDate });
    const t = timingStats([
      s('2026-11-21T00:30:00Z', 40, '2026-11-21'), // 05:30 in Karachi (UTC+5): dawn; a Saturday
      s('2026-11-22T17:30:00Z', 95, '2026-11-22'), // 22:30 Karachi: night, 95 min; Sunday → full weekend
      s('2026-12-10T12:00:00Z', 30, '2026-12-10'), // 18 days later: a comeback
    ], 'Asia/Karachi');
    expect(t).toEqual({ dawnWorkouts: 1, nightWorkouts: 1, fullWeekends: 1, longSessions: 1, comebacks: 1 });
  });
});
