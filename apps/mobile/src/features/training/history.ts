/**
 * Workout history, edits within 7 days, manual logs and sticky notes — SYSTEMS.md §3.11.
 * Signed in: the server is authoritative. Demo: the same engine maths on-device.
 */
import type { EditWorkoutResponse, LoggedSetInput, ManualWorkoutInput, WorkoutDetailDto, WorkoutListResponse, WorkoutSummaryDto } from '@lb/contracts';
import { computeWorkoutRewards, gameDate, levelFromXp, rpeZone, type FinishedSet } from '@lb/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { applyLocalXp, progressionKeys, useLocalHunter } from '@/features/progression';
import { useSession } from '@/features/session';
import { api, unwrap } from '@/lib/api';
import { newId } from '@/lib/id';
import { withKeys } from '@/lib/mutation';
import { exerciseById } from './catalog';
import { useTrainingProfile } from './profile';
import { useTraining, type CompletedSet, type CompletedWorkout } from './store';
import { track } from '@/lib/analytics';

export const historyKeys = { all: ['workouts'] as const, list: ['workouts', 'list'] as const, detail: (id: string) => ['workouts', 'detail', id] as const };
export const EDIT_WINDOW_DAYS = 7;
const shift = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

const toSummary = (h: CompletedWorkout): WorkoutSummaryDto => ({
  id: h.id, date: h.date, name: h.name, kind: h.kind, source: h.source ?? 'app', minutes: h.minutes, workingSets: h.workingSets,
  volumeKg: h.volumeKg, xp: h.xp, prs: h.prs, notes: h.notes ?? null, editableUntil: shift(h.date, EDIT_WINDOW_DAYS),
});
const toDetail = (h: CompletedWorkout): WorkoutDetailDto => ({
  ...toSummary(h), sessionRpe: h.sessionRpe ?? null,
  sets: (h.sets ?? []).map((s, i) => ({
    id: s.id, exerciseId: s.exerciseId, order: i, reps: s.reps, weightKg: s.loadKg, rir: s.rir, rpe: null, durationS: s.durationS,
    distanceM: null, isWarmup: s.isWarmup, setType: s.setType, completedAt: `${h.date}T12:00:00.000Z`,
  })),
});

export function useWorkoutHistory(): { workouts: WorkoutSummaryDto[]; isLoading: boolean } {
  const status = useSession((s) => s.status);
  const history = useTraining((s) => s.history);
  const remote = useQuery({
    queryKey: historyKeys.list,
    enabled: status === 'signedIn',
    queryFn: async () => (await unwrap<WorkoutListResponse>(await api.workouts.$get({ query: {} }))).workouts,
  });
  const local = useMemo(() => history.map(toSummary), [history]);
  return status === 'signedIn' ? { workouts: remote.data ?? [], isLoading: remote.isLoading } : { workouts: local, isLoading: false };
}

export function useWorkoutDetail(id: string): { data: WorkoutDetailDto | undefined; isLoading: boolean } {
  const status = useSession((s) => s.status);
  const h = useTraining((s) => s.history.find((x) => x.id === id));
  const remote = useQuery({
    queryKey: historyKeys.detail(id),
    enabled: status === 'signedIn',
    queryFn: async () => unwrap<WorkoutDetailDto>(await api.workouts[':id'].$get({ param: { id } })),
  });
  const local = useMemo(() => (h ? toDetail(h) : undefined), [h]);
  return status === 'signedIn' ? { data: remote.data, isLoading: remote.isLoading } : { data: local, isLoading: false };
}

/** True while a workout may still be edited or deleted. */
export function useEditable(w: { editableUntil: string; source: string } | undefined): boolean {
  const tz = useTrainingProfile().timezone || 'UTC';
  return !!w && gameDate(new Date(), tz) <= w.editableUntil;
}

const finishedOf = (sets: readonly LoggedSetInput[]): FinishedSet[] =>
  sets.filter((s) => exerciseById.has(s.exerciseId)).map((s) => {
    const ex = exerciseById.get(s.exerciseId)!;
    return { exerciseId: s.exerciseId, reps: s.reps, loadKg: s.weightKg, rir: s.rir, durationS: s.durationS, isWarmup: s.isWarmup, bwFactor: ex.bwFactor, kind: ex.kind };
  });

/**
 * Best e1RM per exercise ignoring what workout `id` itself set (demo mirror of the server's bestExcluding),
 * so an edit can lower or remove its own PR instead of being compared against itself.
 */
function bestExcludingLocal(id: string, bodyweightKg: number): Record<string, number> {
  const t = useTraining.getState();
  const h = t.history.find((x) => x.id === id);
  const best = { ...t.bestE1rm };
  if (!h?.sets?.length) return best;
  const asLogged = (sets: CompletedSet[]): FinishedSet[] =>
    finishedOf(sets.map((x, i) => ({
      id: x.id, exerciseId: x.exerciseId, order: i, reps: x.reps, weightKg: x.loadKg, rir: x.rir, rpe: null, durationS: x.durationS,
      distanceM: null, isWarmup: x.isWarmup, setType: x.setType ?? 'normal', completedAt: '',
    })));
  const bestOf = (sets: FinishedSet[]) =>
    computeWorkoutRewards({ sets, plannedHardSets: 0, cardio: [], bestE1rm: {}, bodyweightKg, xpEarnedToday: 0, currentXp: 0 }).bestE1rm;
  const own = bestOf(asLogged(h.sets));
  const others = bestOf(t.history.filter((x) => x.id !== id).flatMap((x) => asLogged(x.sets ?? [])));
  for (const [ex, v] of Object.entries(own)) {
    if ((best[ex] ?? 0) > v + 1e-6) continue; // the stored best came from elsewhere
    if (others[ex] != null) best[ex] = others[ex]!;
    else delete best[ex];
  }
  return best;
}

/** Applies an XP difference to the on-device hunter (demo mode mirror of the server's applyDelta). */
function applyLocalDelta(delta: number) {
  const me = useLocalHunter.getState().me;
  if (!me?.state || delta === 0) return;
  // level-ups grant AP only for levels never reached before (same rule as the server)
  useLocalHunter.getState().setMe({ ...me, state: applyLocalXp(me.state, me.state.xp + delta).state });
}

export function useHistoryActions() {
  const status = useSession((s) => s.status);
  const profile = useTrainingProfile();
  const qc = useQueryClient();
  const signedIn = status === 'signedIn';
  const refresh = () => {
    qc.invalidateQueries({ queryKey: historyKeys.all });
    qc.invalidateQueries({ queryKey: progressionKeys.all });
  };

  const edit = useMutation({
    mutationFn: async ({ id, editId, sets, notes, sessionRpe }: { id: string; editId: string; sets: LoggedSetInput[]; notes: string | null; sessionRpe: number | null }): Promise<EditWorkoutResponse> => {
      const t = useTraining.getState();
      const h = t.history.find((x) => x.id === id);
      let response: EditWorkoutResponse;
      if (signedIn) {
        response = await unwrap<EditWorkoutResponse>(await api.workouts[':id'].$patch({ param: { id }, json: { editId, sets, notes, sessionRpe } }));
      } else {
        if (!h) throw new Error('workout not found');
        const me = useLocalHunter.getState().me;
        const best = bestExcludingLocal(id, profile.weightKg);
        const r = computeWorkoutRewards({
          sets: finishedOf(sets), plannedHardSets: h.plannedHardSets ?? sets.filter((s) => !s.isWarmup).length,
          cardio: h.cardio?.length
            ? h.cardio.map((c) => ({ minutes: c.minutes, zone: rpeZone(c.rpe) }))
            : h.cardioMinutes ? [{ minutes: h.cardioMinutes, zone: rpeZone(sessionRpe ?? 7) }] : [],
          bestE1rm: best, bodyweightKg: profile.weightKg, xpEarnedToday: (t.xpByDate[h.date] ?? 0) - h.xp, currentXp: (me?.state?.xp ?? 0) - h.xp,
        });
        const delta = r.granted - h.xp;
        applyLocalDelta(delta);
        useTraining.setState({ bestE1rm: { ...best, ...r.bestE1rm } });
        t.updateWorkout(id, { prs: r.prs });
        useTraining.setState((s) => ({ xpByDate: { ...s.xpByDate, [h.date]: Math.max(0, (s.xpByDate[h.date] ?? 0) + delta) } }));
        const xp = useLocalHunter.getState().me?.state?.xp ?? 0;
        response = { xp: r.granted, delta, totalXp: xp, level: levelFromXp(xp) };
      }
      // keep the local history (rotation, week view, recent list) in step
      if (h) {
        const working = sets.filter((s) => !s.isWarmup);
        t.updateWorkout(id, {
          xp: response.xp, notes, sessionRpe, workingSets: working.length,
          volumeKg: Math.round(working.reduce((v, s) => v + (s.weightKg ?? 0) * (s.reps ?? 0), 0)),
          sets: sets.map((s): CompletedSet => ({ id: s.id, exerciseId: s.exerciseId, reps: s.reps, loadKg: s.weightKg, rir: s.rir, durationS: s.durationS, isWarmup: s.isWarmup, setType: s.setType })),
        });
      }
      track({ event: 'workout_edited' });
      return response;
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const t = useTraining.getState();
      const h = t.history.find((x) => x.id === id);
      if (signedIn) await unwrap(await api.workouts[':id'].$delete({ param: { id } }));
      else if (h) applyLocalDelta(-h.xp);
      t.removeWorkout(id);
      track({ event: 'workout_deleted' });
    },
    onSuccess: refresh,
  });

  const logManual = useMutation({
    mutationFn: async (full: ManualWorkoutInput): Promise<number> => {
      const input = full;
      const t = useTraining.getState();
      let granted: number;
      if (signedIn) {
        granted = (await unwrap<{ granted: number }>(await api.workouts.manual.$post({ json: full }))).granted;
      } else {
        const me = useLocalHunter.getState().me;
        const r = computeWorkoutRewards({
          sets: [], plannedHardSets: 0, cardio: [{ minutes: input.minutes, zone: rpeZone(input.rpe) }], bestE1rm: {}, bodyweightKg: profile.weightKg,
          xpEarnedToday: t.xpByDate[input.localDate] ?? 0, currentXp: me?.state?.xp ?? 0,
        });
        granted = r.granted;
        applyLocalDelta(granted);
      }
      t.recordWorkout({
        id: full.id, date: input.localDate, name: input.name, kind: 'manual', source: 'manual', programId: null, dayId: null, minutes: input.minutes,
        workingSets: 0, volumeKg: 0, xp: granted, prs: [], notes: input.notes, sessionRpe: input.rpe, cardioMinutes: input.minutes, sets: [],
      }, {}, false);
      t.addXp(input.localDate, granted);
      track({ event: 'manual_workout_logged' });
      return granted;
    },
    onSuccess: refresh,
  });

  const setNote = useMutation({
    mutationFn: async ({ exerciseId, note }: { exerciseId: string; note: string }) => {
      useTraining.getState().setNote(exerciseId, note);
      if (signedIn) await unwrap(await api.workouts.notes[':exerciseId'].$put({ param: { exerciseId }, json: { note } }));
    },
  });

  // ids are stamped when the user taps, so a retried request reuses them (no double XP)
  return { edit: withKeys(edit, () => ({ editId: newId() })), remove, logManual: withKeys(logManual, () => ({ id: newId() })), setNote };
}
