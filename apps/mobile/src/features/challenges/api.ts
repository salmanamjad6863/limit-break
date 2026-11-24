/**
 * Habit challenges: every change shows on tap, then saves to the account when signed in (offline saves
 * replay in order after a restart). Demo mode runs the same rules on the phone, XP included.
 */
import type { ChallengeCheckinResponse, ChallengeDto, ChallengesResponse, CreateChallengeInput, Reward } from '@lb/contracts';
import { CHALLENGE_XP, challengeProgress, gameDate, type Challenge } from '@lb/engine';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useCelebrations } from '@/features/celebrations';
import { grantLocalXp } from '@/features/quests/local';
import { useSession } from '@/features/session/store';
import { useTrainingProfile } from '@/features/training/profile';
import { refreshAchievements } from '@/features/achievements/api';
import { api, unwrap } from '@/lib/api';
import { queryClient } from '@/lib/query';
import { useChallengeStore } from './store';

const createKey = ['challenges', 'create'] as const;
const checkinKey = ['challenges', 'checkin'] as const;
const endKey = ['challenges', 'end'] as const;
/** creates, check-ins and ends run one at a time in order: a check-in never reaches the server before its challenge */
const scope = { id: 'challenges' };
type CheckinVars = { id: string; date: string; done: string[] };

queryClient.setMutationDefaults(createKey, {
  scope,
  mutationFn: async (c: CreateChallengeInput) => unwrap<ChallengeDto>(await api.challenges.$post({ json: c })),
});
queryClient.setMutationDefaults(checkinKey, {
  scope,
  mutationFn: async (v: CheckinVars) =>
    unwrap<ChallengeCheckinResponse>(await api.challenges[':id'].checkin.$put({ param: { id: v.id }, json: { date: v.date, done: v.done } })),
});
queryClient.setMutationDefaults(endKey, {
  scope,
  mutationFn: async (id: string) => unwrap<ChallengeDto>(await api.challenges[':id'].end.$post({ param: { id } })),
});

const pending = <T,>(key: readonly unknown[]) =>
  queryClient.getMutationCache().findAll({ mutationKey: key }).filter((m) => m.state.status === 'pending').map((m) => m.state.variables as T);

/** Server wins, except what this phone still has on its way up (a new challenge, a check-in, an end). */
export function mergeChallenges(server: readonly ChallengeDto[], local: readonly ChallengeDto[]): ChallengeDto[] {
  const creating = new Set(pending<CreateChallengeInput>(createKey).map((c) => c.id));
  const checkins = pending<CheckinVars>(checkinKey);
  const ending = new Set(pending<string>(endKey));
  const byId = new Map(server.map((c) => [c.id, c]));
  for (const l of local) if (!byId.has(l.id) && creating.has(l.id)) byId.set(l.id, l);
  for (const v of checkins) {
    const c = byId.get(v.id);
    if (c && c.status === 'ACTIVE') byId.set(v.id, { ...c, checkins: { ...c.checkins, [v.date]: v.done } });
  }
  for (const id of ending) {
    const c = byId.get(id);
    if (c && c.status === 'ACTIVE') byId.set(id, { ...c, status: 'ENDED' });
  }
  return [...byId.values()];
}

/** Mounted once in the root layout: refills the phone from the account after sign-in / app start. */
export function useChallengesRestore() {
  const status = useSession((s) => s.status);
  const userId = useSession((s) => s.userId);
  const q = useQuery({
    queryKey: ['challenges', 'list', userId],
    enabled: status === 'signedIn' && !!userId,
    staleTime: 5 * 60_000,
    meta: { persist: false },
    queryFn: async () => unwrap<ChallengesResponse>(await api.challenges.$get()),
  });
  const { data, dataUpdatedAt, isFetchedAfterMount } = q;
  useEffect(() => {
    if (data && isFetchedAfterMount) useChallengeStore.getState().set((s) => ({ challenges: mergeChallenges(data.challenges, s.challenges) }));
  }, [data, dataUpdatedAt, isFetchedAfterMount]);
}

export const useChallenges = () => useChallengeStore((s) => s.challenges);
export const useChallenge = (id: string | null | undefined) => useChallengeStore((s) => s.challenges.find((c) => c.id === id) ?? null);

const asEngine = (c: ChallengeDto): Challenge => ({ ...c, tasks: c.tasks as Challenge['tasks'] });
const replace = (c: ChallengeDto) => useChallengeStore.getState().set((s) => ({ challenges: s.challenges.map((x) => (x.id === c.id ? c : x)) }));

/** Demo-mode twin of PUT /challenges/:id/checkin: pay a full day once, finish with a bonus. */
function localCheckin(c: ChallengeDto, date: string, done: string[], timezone: string): Reward[] {
  const store = useChallengeStore.getState();
  const next: ChallengeDto = { ...c, checkins: { ...c.checkins, [date]: done } };
  const rewards: Reward[] = [];
  const paid = store.rewarded[c.id] ?? [];
  const full = c.tasks.every((t) => done.includes(t.id));
  if (full && !paid.includes(date)) {
    store.set((s) => ({ rewarded: { ...s.rewarded, [c.id]: [...paid, date] } }));
    rewards.push(...grantLocalXp(CHALLENGE_XP.day, 'challenge:day', timezone));
  }
  const p = challengeProgress(asEngine(next), next.checkins, gameDate(new Date(), timezone || 'UTC'));
  if (p.finished && c.status === 'ACTIVE') {
    next.status = 'COMPLETED';
    next.completedAt = new Date().toISOString();
    rewards.push({ type: 'challengeComplete', name: c.name, days: c.days, flawless: p.flawless });
    rewards.push(...grantLocalXp(CHALLENGE_XP.finish(c.days) + (p.flawless ? CHALLENGE_XP.flawlessBonus : 0), 'challenge:complete', timezone));
  }
  replace(next);
  return rewards;
}

export function useChallengeActions() {
  const status = useSession((s) => s.status);
  const profile = useTrainingProfile();
  const enqueue = useCelebrations((s) => s.enqueue);
  const create = useMutation<ChallengeDto, Error, CreateChallengeInput>({ mutationKey: createKey });
  const checkin = useMutation<ChallengeCheckinResponse, Error, CheckinVars>({
    mutationKey: checkinKey,
    onSuccess: (r) => {
      enqueue(r.rewards as Reward[]);
      // the server decides completion; keep its answer for this challenge
      replace(r.challenge);
      void queryClient.invalidateQueries({ queryKey: ['progression'] });
      if (r.challenge.status === 'COMPLETED') refreshAchievements();
    },
  });
  const end = useMutation<ChallengeDto, Error, string>({ mutationKey: endKey });

  return {
    create: (input: CreateChallengeInput) => {
      const dto: ChallengeDto = { ...input, status: 'ACTIVE', checkins: {}, completedAt: null };
      useChallengeStore.getState().set((s) => ({ challenges: [dto, ...s.challenges] }));
      if (status === 'signedIn') create.mutate(input);
      return dto;
    },
    /** tick or untick one task on a date (today or yesterday) */
    toggle: (c: ChallengeDto, date: string, taskId: string) => {
      if (c.status !== 'ACTIVE') return;
      const cur = c.checkins[date] ?? [];
      const done = cur.includes(taskId) ? cur.filter((t) => t !== taskId) : [...cur, taskId];
      if (status === 'signedIn') {
        replace({ ...c, checkins: { ...c.checkins, [date]: done } });
        checkin.mutate({ id: c.id, date, done });
      } else {
        enqueue(localCheckin(c, date, done, profile.timezone));
        refreshAchievements();
      }
    },
    end: (c: ChallengeDto) => {
      replace({ ...c, status: 'ENDED' });
      if (status === 'signedIn') end.mutate(c.id);
    },
  };
}
