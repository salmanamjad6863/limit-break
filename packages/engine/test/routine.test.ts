import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODE, personalizeWorkout, routineDay, routineDayFor, routineIdOf, routineProblems, routineProgramId, routineWeekdays, routineWeekNames,
  type CatalogExercise, type Routine,
} from '../src';

const ex = (o: Partial<CatalogExercise> & Pick<CatalogExercise, 'id' | 'pattern'>): CatalogExercise => ({
  name: o.id, equipment: [], difficulty: 2, bwFactor: 0, restType: 'secondaryCompound', kind: 'reps', loadType: 'bodyweight', ...o,
});
const catalog: CatalogExercise[] = [
  ex({ id: 'push-up', pattern: 'horizontal_push', bwFactor: 0.64, avoid: ['wrist'] }),
  ex({ id: 'bench-press', pattern: 'horizontal_push', equipment: ['barbell', 'bench', 'rack'], loadType: 'barbell', difficulty: 3, restType: 'mainCompound' }),
  ex({ id: 'db-floor-press', pattern: 'horizontal_push', equipment: ['dumbbells'], loadType: 'dumbbell', difficulty: 1 }),
  ex({ id: 'back-squat', pattern: 'squat', equipment: ['barbell', 'rack'], loadType: 'barbell', difficulty: 3, restType: 'mainCompound' }),
  ex({ id: 'bodyweight-squat', pattern: 'squat', difficulty: 1 }),
  ex({ id: 'burpee', pattern: 'conditioning', difficulty: 2 }),
  ex({ id: 'plank', pattern: 'core_anti_extension', kind: 'time', restType: 'isolation', difficulty: 1 }),
];
const routine: Routine = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'My PPL',
  updatedAt: '2026-11-24T10:00:00.000Z',
  days: [
    {
      id: 'push', name: 'Push', slots: [
        { exerciseId: 'bench-press', sets: 5, reps: [3, 5], rir: 1, restSeconds: 240 },
        { exerciseId: 'push-up', sets: 3, reps: [15, 20], rir: 2, superset: 'A' },
        { exerciseId: 'plank', sets: 3, seconds: [45, 60], rir: 2, superset: 'A' },
      ],
    },
    { id: 'legs', name: 'Legs', slots: [{ exerciseId: 'back-squat', sets: 4, reps: [6, 8], rir: 2 }, { exerciseId: 'burpee', sets: 2, reps: [10, 10], rir: 3 }] },
  ],
  // Mon = push, Thu = legs
  schedule: { '1': 'push', '4': 'legs' },
};
// a home hunter with no barbell, beginner, over 50: none of that should reshape their own routine
const ctx = { equipment: [] as string[], injuries: [] as string[], experience: 'beginner' as const, sessionMinutes: 20, bodyweightKg: 80, ageYears: 55 };

describe('own routines', () => {
  it('runs the exact exercises with the hunter’s sets, reps, rest and supersets', () => {
    const w = personalizeWorkout(routineDay(routine.days[0]!, catalog), catalog, ctx);
    expect(w.exercises.map((e) => e.exerciseId)).toEqual(['bench-press', 'push-up', 'plank']);
    const bench = w.exercises[0]!;
    expect(bench.sets.filter((s) => s.kind === 'working')).toHaveLength(5);
    expect(bench.sets.find((s) => s.kind === 'working')!.reps).toEqual([3, 5]);
    expect(bench.restSeconds).toBe(240);
    expect(w.exercises[1]!.supersetGroup).toBe('A');
    expect(w.exercises[2]!.sets.find((s) => s.kind === 'working')!.seconds).toEqual([45, 60]);
    // not squeezed into the 20-minute default: own routines run in full
    expect(w.exercises).toHaveLength(3);
  });

  it('keeps high-impact picks for 50+ beginners (their choice) but swaps injuries and pain flags', () => {
    const legs = routineDay(routine.days[1]!, catalog);
    expect(personalizeWorkout(legs, catalog, ctx).exercises.map((e) => e.exerciseId)).toContain('burpee');
    const hurt = personalizeWorkout(routineDay(routine.days[0]!, catalog), catalog, { ...ctx, injuries: ['wrist'], avoidExercises: ['bench-press'] });
    expect(hurt.exercises.map((e) => e.exerciseId)).not.toContain('push-up');
    expect(hurt.exercises.map((e) => e.exerciseId)).not.toContain('bench-press');
  });

  it('applies today’s Light / Intense choice and the Time chips on top', () => {
    const day = routineDay(routine.days[0]!, catalog);
    const light = personalizeWorkout(day, catalog, ctx, { ...DEFAULT_MODE, intensity: 'light' });
    expect(light.exercises[0]!.sets.filter((s) => s.kind === 'working')).toHaveLength(4);
    const short = personalizeWorkout(day, catalog, ctx, { ...DEFAULT_MODE, minutes: 20 });
    expect(short.estimatedMinutes).toBeLessThan(personalizeWorkout(day, catalog, ctx).estimatedMinutes);
  });

  it('follows the weekly schedule; rest days point at the next workout', () => {
    expect(routineWeekdays(routine)).toEqual([1, 4]);
    expect(routineWeekNames(routine)).toEqual([null, 'Push', null, null, 'Legs', null, null]);
    expect(routineDayFor(routine, '2026-11-23')).toMatchObject({ day: { id: 'push' }, scheduled: true }); // Monday
    expect(routineDayFor(routine, '2026-11-24')).toMatchObject({ day: { id: 'legs' }, scheduled: false }); // Tuesday → Thursday's legs
    expect(routineDayFor(routine, '2026-11-28')).toMatchObject({ day: { id: 'push' }, scheduled: false }); // Saturday → Monday
  });

  it('program ids round-trip and invalid routines explain themselves', () => {
    expect(routineIdOf(routineProgramId(routine.id))).toBe(routine.id);
    expect(routineIdOf('foundation')).toBeNull();
    const known = (id: string) => catalog.some((e) => e.id === id);
    expect(routineProblems(routine, known)).toEqual([]);
    expect(routineProblems({ ...routine, name: ' ', schedule: {} }, known)).toEqual(['Give the routine a name.', 'Put at least one day on the week.']);
    expect(routineProblems({ ...routine, days: [{ id: 'x', name: 'X', slots: [{ exerciseId: 'gone', sets: 3, reps: [8, 12], rir: 2 }] }], schedule: { '1': 'x' } }, known))
      .toEqual(['X has an exercise that no longer exists.']);
  });
});
