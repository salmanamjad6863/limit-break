import type { FinishWorkoutInput, FinishWorkoutResponse, Reward } from '@lb/contracts';
import { computeWorkoutRewards, gameDate, levelFromXp, rpeZone, type FinishedSet } from '@lb/engine';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCelebrations } from '@/features/celebrations';
import { progressionKeys, useLocalHunter, useMe } from '@/features/progression';
import { useSession as useAuthSession } from '@/features/session';
import { api, unwrap } from '@/lib/api';
import { exerciseById } from './catalog';
import { useTrainingProfile } from './profile';
import type { ActiveSession } from './session';
import { useTraining, type CompletedWorkout } from './store';

export interface FinishSummary {
  minutes: number;
  workingSets: number;
  volumeKg: number;
  xp: number;
  prs: { exerciseId: string; e1rmKg: number }[];
  levelUp: { from: number; to: number } | null;
  capped: boolean;
}

export function toFinishInput(a: ActiveSession, sessionRpe: number | null, cardio: { minutes: number; rpe: number }[] = []): FinishWorkoutInput {
  const sets = Object.entries(a.logs).flatMap(([exIndex, entries]) =>
    entries.map((e, order) => ({
      id: e.id, exerciseId: a.exercises[Number(exIndex)]!.exerciseId, order, reps: e.reps, weightKg: e.loadKg, rir: e.rir,
      rpe: null, durationS: e.durationS, distanceM: null, isWarmup: e.isWarmup, completedAt: e.completedAt,
    })),
  );
  const plannedHardSets = a.exercises.reduce((n, pe) => n + pe.sets.filter((s) => s.kind === 'working').length, 0);
  return {
    id: a.id, plannedWorkoutId: null, programId: a.programId, dayId: a.dayId, sessionRpe, cardio,
    startedAt: a.startedAt, finishedAt: new Date().toISOString(), plannedHardSets, sets,
  };
}

/**
 * Finishes a workout. Demo mode computes rewards on-device with the same engine the server uses;
 * signed-in mode posts once to the API (idempotent by workout id) and trusts its answer.
 */
export function useFinishWorkout() {
  const auth = useAuthSession((s) => s.status);
  const { data: me } = useMe();
  const profile = useTrainingProfile();
  const setLocal = useLocalHunter((s) => s.setMe);
  const enqueue = useCelebrations((s) => s.enqueue);
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ session, input }: { session: ActiveSession; input: FinishWorkoutInput }): Promise<FinishSummary> => {
      const t = useTraining.getState();
      const date = gameDate(new Date(input.finishedAt), profile.timezone || 'UTC');
      const finished: FinishedSet[] = input.sets.map((s) => {
        const ex = exerciseById.get(s.exerciseId);
        return {
          exerciseId: s.exerciseId, reps: s.reps, loadKg: s.weightKg, rir: s.rir, durationS: s.durationS,
          isWarmup: s.isWarmup, bwFactor: ex?.bwFactor ?? 0, kind: ex?.kind ?? 'reps',
        };
      });
      const local = computeWorkoutRewards({
        sets: finished, plannedHardSets: input.plannedHardSets,
        cardio: input.cardio.map((c) => ({ minutes: c.minutes, zone: rpeZone(c.rpe) })),
        bestE1rm: t.bestE1rm, bodyweightKg: profile.weightKg, xpEarnedToday: t.xpByDate[date] ?? 0, currentXp: me?.state?.xp ?? 0,
      });

      let granted = local.granted;
      let prs = local.prs;
      let rewards: unknown[] = local.rewards;
      if (auth === 'signedIn') {
        const res = await unwrap<FinishWorkoutResponse>(await api.workouts.finish.$post({ json: input }));
        granted = res.granted;
        prs = res.prs;
        rewards = res.rewards;
        qc.invalidateQueries({ queryKey: progressionKeys.me() });
      } else if (me?.state) {
        setLocal({ ...me, state: { ...me.state, xp: local.newXp, level: levelFromXp(local.newXp), apUnspent: me.state.apUnspent + local.apGained } });
      }

      const working = finished.filter((s) => !s.isWarmup);
      const volumeKg = Math.round(working.reduce((v, s) => v + (s.loadKg ?? 0) * (s.reps ?? 0), 0));
      const minutes = Math.max(1, Math.round((Date.parse(input.finishedAt) - Date.parse(input.startedAt)) / 60000));

      const lastSet: Record<string, { reps: number | null; loadKg: number | null }> = {};
      const lastUsed: Record<string, string> = {};
      for (const pe of session.exercises) {
        const ex = exerciseById.get(pe.exerciseId);
        if (ex) lastUsed[ex.pattern] = ex.id;
      }
      for (const s of working) lastSet[s.exerciseId] = { reps: s.reps, loadKg: s.loadKg };
      const record: CompletedWorkout = {
        id: input.id, date, name: session.name, kind: session.kind, programId: session.programId, dayId: session.dayId,
        minutes, workingSets: working.length, volumeKg, xp: granted, prs,
      };
      t.recordWorkout(record, { bestE1rm: local.bestE1rm, lastSet, lastUsed }, session.kind === 'program');
      t.addXp(date, granted);

      enqueue(rewards as Reward[]);
      const lvl = (rewards as Reward[]).find((r) => r.type === 'levelUp') as Extract<Reward, { type: 'levelUp' }> | undefined;
      return {
        minutes, workingSets: working.length, volumeKg, xp: granted, prs,
        levelUp: lvl ? { from: lvl.from, to: lvl.to } : null,
        capped: (rewards as Reward[]).some((r) => r.type === 'capReached'),
      };
    },
  });
}
