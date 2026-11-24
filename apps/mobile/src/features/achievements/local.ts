/**
 * Demo-mode twin of POST /achievements/check: the same engine rules on this phone's own records.
 * (Workout start times aren't kept on the phone, so the dawn / night / 90-minute badges are server-only.)
 */
import { achievements } from '@lb/content';
import type { AchievementsResponse, Reward } from '@lb/contracts';
import {
  challengeProgress, earnedTitles, evaluateAchievements, RANK_INDEX, tierXp, timingStats, type AchievementStats, type Challenge,
} from '@lb/engine';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useChallengeStore } from '@/features/challenges/store';
import { useNutritionLocal } from '@/features/nutrition/local';
import { useLocalHunter } from '@/features/progression/localHunter';
import { useProgress } from '@/features/progression/progressStore';
import { grantLocalXp } from '@/features/quests/local';
import { useQuestLocal } from '@/features/quests/localStore';
import { useTraining } from '@/features/training/store';
import { zustandStorage } from '@/lib/storage';

interface AchievementLocalState {
  unlocked: { id: string; tier: number; at: string }[];
  title: string | null;
  set: (patch: Partial<Pick<AchievementLocalState, 'unlocked' | 'title'>>) => void;
}

export const useAchievementLocal = create<AchievementLocalState>()(
  persist((set) => ({ unlocked: [], title: null, set: (patch) => set(patch) }), {
    name: 'lb-achievements', storage: createJSONStorage(() => zustandStorage), partialize: (s) => ({ unlocked: s.unlocked, title: s.title }),
  }),
);

function localStats(): AchievementStats {
  const t = useTraining.getState();
  const live = t.history.filter((h) => h.source !== 'manual');
  const q = useQuestLocal.getState();
  const state = useLocalHunter.getState().me?.state;
  const challenges = useChallengeStore.getState().challenges.filter((c) => c.status === 'COMPLETED');
  const flawless = challenges.filter((c) => challengeProgress({ ...c, tasks: c.tasks as Challenge['tasks'] }, c.checkins, c.completedAt?.slice(0, 10) ?? c.startDate).flawless).length;
  // dates only: weekends and comebacks work; time-of-day badges need the server's start times
  const timing = timingStats(live.map((h) => ({ startedAt: `${h.date}T12:00:00Z`, finishedAt: null, localDate: h.date })), 'UTC');
  return {
    workouts: live.length,
    tonnes: Math.floor(live.reduce((s, h) => s + (h.volumeKg ?? 0), 0) / 1000),
    prs: live.reduce((s, h) => s + h.prs.length, 0),
    routineWorkouts: live.filter((h) => h.programId?.startsWith('custom-')).length,
    cardioMinutes: Math.round(live.reduce((s, h) => s + (h.cardioMinutes ?? 0), 0)),
    streak: Math.max(q.streak.longest, q.streak.streak),
    dailyQuests: Object.values(q.days).filter((d) => d.dailyDone).length,
    challenges: challenges.length,
    flawlessChallenges: flawless,
    level: state?.level ?? 1,
    rank: RANK_INDEX[state?.rank ?? 'E'] ?? 0,
    trials: useProgress.getState().attempts.filter((a) => a.passed).length,
    bosses: q.bossClaims.length,
    nutritionDays: Object.values(useNutritionLocal.getState().days).filter((d) => d.markedComplete).length,
    dawnWorkouts: 0, nightWorkouts: 0, longSessions: 0,
    fullWeekends: timing.fullWeekends, comebacks: timing.comebacks,
  };
}

export function localCheck(timezone: string): AchievementsResponse {
  const store = useAchievementLocal.getState();
  const earnedBefore = new Map<string, number>();
  for (const u of store.unlocked) earnedBefore.set(u.id, Math.max(earnedBefore.get(u.id) ?? -1, u.tier));
  const stats = localStats();
  const { newUnlocks } = evaluateAchievements(achievements, stats, earnedBefore);
  const rewards: Reward[] = [];
  let unlocked = store.unlocked;
  if (newUnlocks.length) {
    const at = new Date().toISOString();
    unlocked = [...unlocked, ...newUnlocks.map((u) => ({ ...u, at }))];
    store.set({ unlocked });
    for (const u of newUnlocks) {
      const def = achievements.find((a) => a.id === u.id)!;
      rewards.push({ type: 'achievement', achievementId: u.id, tier: u.tier });
      rewards.push(...grantLocalXp(tierXp(def, u.tier), `achievement:${u.id}:${u.tier}`, timezone));
    }
  }
  const earned = new Map<string, number>();
  const unlockedAt = new Map<string, Record<string, string>>();
  for (const u of unlocked) {
    earned.set(u.id, Math.max(earned.get(u.id) ?? -1, u.tier));
    unlockedAt.set(u.id, { ...unlockedAt.get(u.id), [String(u.tier)]: u.at });
  }
  const { progress } = evaluateAchievements(achievements, stats, earned);
  const titles = earnedTitles(achievements, earned);
  return {
    progress: progress.map((p) => ({ id: p.id, value: p.value, earned: p.earned, next: p.next, ratio: p.ratio, unlockedAt: unlockedAt.get(p.id) ?? {} })),
    titles,
    equippedTitle: store.title && titles.some((x) => x.title === store.title) ? store.title : null,
    rewards,
  };
}
