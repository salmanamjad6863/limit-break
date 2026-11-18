/**
 * Keeps the on-device training store and the server in step for signed-in hunters:
 * - after sign-in (and on each app start) the store is refilled from GET /workouts/state,
 *   so a new phone gets the program, rotation, recent workouts, best lifts, last sets, notes and pain flags
 * - program picks and pain flags are saved to the server as they happen
 * Demo mode stays on-device only.
 */
import type { TrainingStateResponse, WorkoutSummaryDto } from '@lb/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSession } from '@/features/session/store';
import { api, unwrap } from '@/lib/api';
import { queryClient } from '@/lib/query';
import { useTraining, type CompletedWorkout } from './store';

export const trainingStateKey = ['training', 'state'] as const;

/** Keyed so they can be replayed after an app restart (setMutationDefaults below) and detected while pending. */
const programKey = ['training', 'program'] as const;
const avoidKey = ['training', 'avoid'] as const;

queryClient.setMutationDefaults(programKey, {
  mutationFn: async (programId: string) => unwrap(await api.workouts.program.$put({ json: { programId } })),
});
queryClient.setMutationDefaults(avoidKey, {
  mutationFn: async (v: { exerciseId: string; avoid: boolean }) => unwrap(await api.workouts.avoid.$put({ json: v })),
});

const toCompleted = (w: WorkoutSummaryDto): CompletedWorkout => ({
  id: w.id, date: w.date, name: w.name, kind: w.kind, source: w.source, notes: w.notes,
  programId: w.programId ?? null, dayId: w.dayId ?? null,
  minutes: w.minutes, workingSets: w.workingSets, volumeKg: w.volumeKg, xp: w.xp, prs: w.prs,
});

/**
 * Server wins for everything it stores; local-only extras are kept only where they can't be stale:
 * - history: a local workout missing on the server is kept only if it is newer than the server's newest one
 *   (a finish that raced this fetch). Anything older was deleted on another device and must not come back.
 * - program / pain flags: the local choice stands while its save is still pending (offline or in flight)
 * - rotation: the server count plus the local program sessions it hasn't seen yet
 */
export function mergeTrainingState(s: TrainingStateResponse) {
  const programPending = queryClient.isMutating({ mutationKey: programKey }) > 0;
  const avoidPending = queryClient.isMutating({ mutationKey: avoidKey }) > 0;
  useTraining.setState((cur) => {
    const serverIds = new Set(s.recent.map((w) => w.id));
    const newest = s.recent.reduce((d, w) => (w.date > d ? w.date : d), '');
    const pending = newest ? cur.history.filter((h) => !serverIds.has(h.id) && h.date > newest) : [];
    const history = [...pending, ...s.recent.map(toCompleted)].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200);
    const bestE1rm = { ...s.bestE1rm };
    for (const [id, kg] of Object.entries(cur.bestE1rm)) bestE1rm[id] = Math.max(kg, bestE1rm[id] ?? 0);

    let activeProgramId: string | null;
    let completedSessions: number;
    if (programPending || !s.activeProgramId) {
      activeProgramId = programPending ? cur.activeProgramId : (s.activeProgramId ?? cur.activeProgramId);
      completedSessions = cur.completedSessions;
    } else {
      activeProgramId = s.activeProgramId;
      const unseen = pending.filter((h) => h.kind === 'program' && h.programId === activeProgramId).length;
      completedSessions = s.completedSessions + unseen;
    }
    return {
      activeProgramId,
      completedSessions,
      history,
      bestE1rm,
      lastSet: { ...s.lastSet, ...cur.lastSet },
      avoid: avoidPending ? cur.avoid : s.avoid,
      notes: { ...cur.notes, ...s.notes },
    };
  });
}

/** Mounted once in the root layout. */
export function useTrainingRestore() {
  const status = useSession((s) => s.status);
  const userId = useSession((s) => s.userId);
  const q = useQuery({
    queryKey: [...trainingStateKey, userId],
    enabled: status === 'signedIn' && !!userId,
    staleTime: 10 * 60_000,
    // Never persisted (see shouldDehydrateQuery in the root layout): an old snapshot must not overwrite newer local state.
    meta: { persist: false },
    queryFn: async () => unwrap<TrainingStateResponse>(await api.workouts.state.$get()),
  });
  const { data, dataUpdatedAt, isFetchedAfterMount } = q;
  useEffect(() => {
    // Only a response fetched in this run is merged, never a snapshot restored from disk.
    if (data && isFetchedAfterMount) mergeTrainingState(data);
  }, [data, dataUpdatedAt, isFetchedAfterMount]);
}

/** Pick a program: instant on the phone, saved to the account when signed in. */
export function useSetProgram() {
  const status = useSession((s) => s.status);
  const local = useTraining((s) => s.setProgram);
  const save = useMutation<unknown, Error, string>({ mutationKey: programKey });
  return (programId: string) => {
    local(programId);
    if (status === 'signedIn') save.mutate(programId);
  };
}

/** "This hurts" flags: instant on the phone, saved to the account when signed in. */
export function usePainFlags() {
  const status = useSession((s) => s.status);
  const flag = useTraining((s) => s.flagPain);
  const unflag = useTraining((s) => s.unflagPain);
  const save = useMutation<unknown, Error, { exerciseId: string; avoid: boolean }>({ mutationKey: avoidKey });
  return {
    flagPain: (exerciseId: string) => {
      flag(exerciseId);
      if (status === 'signedIn') save.mutate({ exerciseId, avoid: true });
    },
    unflagPain: (exerciseId: string) => {
      unflag(exerciseId);
      if (status === 'signedIn') save.mutate({ exerciseId, avoid: false });
    },
  };
}
