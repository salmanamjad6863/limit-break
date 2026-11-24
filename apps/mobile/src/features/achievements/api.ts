/**
 * Achievements: one query evaluates and pays new tiers (server when signed in, the phone in demo).
 * Activity that can earn a badge calls refreshAchievements(); the watcher in the root layout keeps the
 * query alive and plays new badges (at most three at a time, so a backlog never floods the screen).
 */
import type { AchievementsResponse, Reward } from '@lb/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useCelebrations } from '@/features/celebrations';
import { useSession } from '@/features/session/store';
import { useTrainingProfile } from '@/features/training/profile';
import { api, unwrap } from '@/lib/api';
import { queryClient } from '@/lib/query';
import { localCheck, useAchievementLocal } from './local';

export const achievementsKey = ['achievements'] as const;
/** Ask for a fresh check after anything that can earn a badge (workout, quest, challenge, trial). */
export const refreshAchievements = () => void queryClient.invalidateQueries({ queryKey: achievementsKey });

export function useAchievements() {
  const status = useSession((s) => s.status);
  const userId = useSession((s) => s.userId);
  const profile = useTrainingProfile();
  return useQuery({
    queryKey: [...achievementsKey, status === 'signedIn' ? userId : 'demo'],
    enabled: status === 'signedIn' || status === 'demo',
    staleTime: 60_000,
    // rewards are one-shot: a cached copy must never replay them
    meta: { persist: false },
    queryFn: async (): Promise<AchievementsResponse> =>
      status === 'signedIn' ? unwrap<AchievementsResponse>(await api.achievements.check.$post()) : localCheck(profile.timezone),
  });
}

/** Mounted once in the root layout. */
export function useAchievementWatcher() {
  const { data, dataUpdatedAt } = useAchievements();
  const enqueue = useCelebrations((s) => s.enqueue);
  const seen = useRef(0);
  useEffect(() => {
    if (!data || dataUpdatedAt === seen.current) return;
    seen.current = dataUpdatedAt;
    const rewards = data.rewards as Reward[];
    if (!rewards.length) return;
    const badges = rewards.filter((r) => r.type === 'achievement');
    // the highest tiers first; the rest wait in the trophy case marked as new
    const show = [...badges].sort((a, b) => (b as { tier: number }).tier - (a as { tier: number }).tier).slice(0, 3);
    enqueue([...show, ...rewards.filter((r) => r.type !== 'achievement')]);
    void queryClient.invalidateQueries({ queryKey: ['progression'] });
    // new tiers can unlock frames and auras and add Essence
    if (badges.length) void queryClient.invalidateQueries({ queryKey: ['avatar'] });
  }, [data, dataUpdatedAt, enqueue]);
}

export function useEquipTitle() {
  const status = useSession((s) => s.status);
  return useMutation({
    mutationFn: async (title: string | null) => {
      if (status === 'signedIn') await unwrap(await api.achievements.title.$put({ json: { title } }));
      else useAchievementLocal.getState().set({ title });
    },
    onMutate: (title) => {
      queryClient.setQueriesData<AchievementsResponse>({ queryKey: achievementsKey }, (d) => (d ? { ...d, equippedTitle: title, rewards: [] } : d));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['community'] });
    },
  });
}
