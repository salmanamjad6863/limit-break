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
import { useTraining, type CompletedWorkout } from './store';

export const trainingStateKey = ['training', 'state'] as const;

const toCompleted = (w: WorkoutSummaryDto): CompletedWorkout => ({
  id: w.id, date: w.date, name: w.name, kind: w.kind, source: w.source, notes: w.notes,
  programId: w.programId ?? null, dayId: w.dayId ?? null,
  minutes: w.minutes, workingSets: w.workingSets, volumeKg: w.volumeKg, xp: w.xp, prs: w.prs,
});

/** Server wins for everything it stores; local-only extras (unsynced finishes, newer lifts) are kept. */
export function mergeTrainingState(s: TrainingStateResponse) {
  useTraining.setState((cur) => {
    const serverIds = new Set(s.recent.map((w) => w.id));
    const oldest = s.recent.at(-1)?.date ?? '';
    // a finish still waiting to sync is newer than the server's oldest row and not on the server yet
    const pending = cur.history.filter((h) => !serverIds.has(h.id) && h.date >= oldest);
    const history = [...pending, ...s.recent.map(toCompleted)].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200);
    const bestE1rm = { ...s.bestE1rm };
    for (const [id, kg] of Object.entries(cur.bestE1rm)) bestE1rm[id] = Math.max(kg, bestE1rm[id] ?? 0);
    return {
      activeProgramId: s.activeProgramId ?? cur.activeProgramId,
      completedSessions: s.activeProgramId ? s.completedSessions : cur.completedSessions,
      history,
      bestE1rm,
      lastSet: { ...s.lastSet, ...cur.lastSet },
      avoid: s.avoid,
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
    queryFn: async () => unwrap<TrainingStateResponse>(await api.workouts.state.$get()),
  });
  useEffect(() => {
    if (q.data) mergeTrainingState(q.data);
  }, [q.data]);
}

/** Pick a program: instant on the phone, saved to the account when signed in. */
export function useSetProgram() {
  const status = useSession((s) => s.status);
  const local = useTraining((s) => s.setProgram);
  const save = useMutation({
    mutationFn: async (programId: string) => unwrap(await api.workouts.program.$put({ json: { programId } })),
  });
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
  const save = useMutation({
    mutationFn: async (v: { exerciseId: string; avoid: boolean }) => unwrap(await api.workouts.avoid.$put({ json: v })),
  });
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
