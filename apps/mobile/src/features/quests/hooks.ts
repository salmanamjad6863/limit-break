import type { BossResponse, QuestDto, QuestProgressResponse, Reward, TodayQuestsResponse } from '@lb/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useCelebrations } from '@/features/celebrations';
import { useMe, useProgress } from '@/features/progression';
import { useSession } from '@/features/session';
import { useTraining } from '@/features/training/store';
import { useTrainingProfile } from '@/features/training/profile';
import { api, unwrap } from '@/lib/api';
import { syncQuestNotifications } from '@/lib/questNotifications';
import { localBoss } from './boss';
import { grantLocalXp, localChooseSides, localProgress, localSetSick, localToday } from './local';
import { useQuestLocal } from './localStore';
import { track } from '@/lib/analytics';

export const questKeys = { today: ['quests', 'today'] as const, boss: ['quests', 'boss'] as const };

/** Today's quests + streak. Server when signed in; on-device engine in demo mode. */
export function useQuests(): { data: TodayQuestsResponse | undefined; isLoading: boolean } {
  const status = useSession((s) => s.status);
  const { data: me } = useMe();
  const profile = useTrainingProfile();
  const streakState = useQuestLocal((s) => s.streak);
  const todayState = useQuestLocal((s) => s.today);
  const days = useQuestLocal((s) => s.days);
  const firstDay = useQuestLocal((s) => s.firstDay);
  const tests = useProgress((s) => s.tests);
  const [tick, setTick] = useState(0);

  const remote = useQuery({
    queryKey: questKeys.today,
    enabled: status === 'signedIn',
    queryFn: async () => unwrap<TodayQuestsResponse>(await api.quests.today.$get()),
  });

  // re-evaluate at the 03:00 rollover
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const local = useMemo(() => {
    if (status !== 'demo' || !me?.onboarded) return undefined;
    void tick; // re-evaluate every minute so the 03:00 rollover is picked up
    return localToday(profile, me.heroClass, { streak: streakState, today: todayState, days, firstDay }, tests);
  }, [status, me, profile, streakState, todayState, days, firstDay, tests, tick]);

  // persist rollover / streak resolution outside of render
  useEffect(() => {
    if (local?.patch) useQuestLocal.getState().set(local.patch);
  }, [local?.patch]);

  const data = status === 'demo' ? local?.response : remote.data;
  useEffect(() => {
    if (!data) return;
    syncQuestNotifications({
      dailyDone: data.daily.status === 'COMPLETED', penaltyActive: !!data.penalty && data.penalty.status !== 'COMPLETED',
      streak: data.streak.current, name: me?.hunterName ?? 'Hunter',
    }).catch(() => {});
  }, [data?.daily.status, data?.penalty?.status, data?.streak.current]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, isLoading: status === 'demo' ? false : remote.isLoading };
}

export function useQuestActions() {
  const status = useSession((s) => s.status);
  const profile = useTrainingProfile();
  const enqueue = useCelebrations((s) => s.enqueue);
  const qc = useQueryClient();
  const after = (rewards: unknown[]) => {
    enqueue(rewards as Reward[]);
    if (status === 'signedIn') {
      qc.invalidateQueries({ queryKey: questKeys.today });
      qc.invalidateQueries({ queryKey: ['progression'] });
    }
  };

  const progress = useMutation({
    mutationFn: async ({ quest, progress }: { quest: QuestDto; progress: Record<string, number> }): Promise<QuestProgressResponse> =>
      status === 'signedIn'
        ? unwrap<QuestProgressResponse>(await api.quests[':id'].progress.$post({ param: { id: quest.id }, json: { progress } }))
        : localProgress(quest.id, progress, profile.timezone),
    onSuccess: (r) => {
      after(r.rewards);
      if (r.quest.status === 'COMPLETED') track({ event: 'quest_completed', kind: r.quest.kind });
    },
  });
  const chooseSides = useMutation({
    mutationFn: async (ids: string[]) =>
      status === 'signedIn' ? unwrap<QuestDto[]>(await api.quests.sides.$post({ json: { ids } })) : localChooseSides(ids),
    onSuccess: () => after([]),
  });
  const setSick = useMutation({
    mutationFn: async (on: boolean) => {
      if (status === 'signedIn') await unwrap(await api.quests.sick.$post({ json: { on } }));
      else localSetSick(on);
    },
    onSuccess: () => after([]),
  });
  const claimBoss = useMutation({
    mutationFn: async (boss: BossResponse): Promise<unknown[]> => {
      if (status === 'signedIn') return (await unwrap<QuestProgressResponse>(await api.quests.boss.claim.$post())).rewards;
      const s = useQuestLocal.getState();
      s.set({ bossClaims: [...s.bossClaims, boss.weekStart] });
      return [{ type: 'title', titleId: 'Shadow Slayer' }, ...grantLocalXp(150, 'boss', profile.timezone)];
    },
    onSuccess: (rewards) => {
      after(rewards);
      qc.invalidateQueries({ queryKey: questKeys.boss });
    },
  });
  return { progress, chooseSides, setSick, claimBoss };
}

export function useBoss(): { data: BossResponse | undefined } {
  const status = useSession((s) => s.status);
  const { data: me } = useMe();
  const profile = useTrainingProfile();
  const history = useTraining((s) => s.history);
  const days = useQuestLocal((s) => s.days);
  const claims = useQuestLocal((s) => s.bossClaims);
  const remote = useQuery({
    queryKey: questKeys.boss,
    enabled: status === 'signedIn',
    queryFn: async () => unwrap<BossResponse>(await api.quests.boss.$get()),
  });
  const local = useMemo(
    () => (status === 'demo' && me?.onboarded ? localBoss(profile, me.heroClass, history, days, claims) : undefined),
    [status, me, profile, history, days, claims],
  );
  return { data: status === 'demo' ? local : remote.data };
}
