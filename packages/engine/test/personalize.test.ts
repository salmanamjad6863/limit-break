import { describe, expect, it } from 'vitest';
import {
  adaptDay, ageBand, deloadEveryWeeks, staleSession, startingLoad, equipmentFor, GYM_EQUIPMENT, personalizeWorkout, standardE1rm, suggestLevelUp,
  type CatalogExercise, type TemplateDay,
} from '../src';

const ex = (o: Partial<CatalogExercise> & Pick<CatalogExercise, 'id' | 'pattern'>): CatalogExercise => ({
  name: o.id, equipment: [], difficulty: 2, bwFactor: 0, restType: 'secondaryCompound', kind: 'reps', loadType: 'bodyweight', ...o,
});
const catalog: CatalogExercise[] = [
  ex({ id: 'bench-press', pattern: 'horizontal_push', equipment: ['barbell', 'bench', 'rack'], loadType: 'barbell', difficulty: 3, restType: 'mainCompound' }),
  ex({ id: 'db-bench-press', pattern: 'horizontal_push', equipment: ['dumbbells', 'bench'], loadType: 'dumbbell', difficulty: 2 }),
  ex({ id: 'push-up', pattern: 'horizontal_push', bwFactor: 0.64, difficulty: 1 }),
  ex({ id: 'back-squat', pattern: 'squat', equipment: ['barbell', 'rack'], loadType: 'barbell', difficulty: 3, restType: 'mainCompound' }),
  ex({ id: 'goblet-squat', pattern: 'squat', anyOf: ['dumbbells', 'kettlebell'], loadType: 'dumbbell', difficulty: 1 }),
  ex({ id: 'jump-squat', pattern: 'squat', bwFactor: 0.85, difficulty: 2 }),
  ex({ id: 'bodyweight-squat', pattern: 'squat', bwFactor: 0.85, difficulty: 1 }),
  ex({ id: 'curl', pattern: 'elbow_flexion', equipment: ['dumbbells'], loadType: 'dumbbell', restType: 'isolation', difficulty: 1 }),
  ex({ id: 'burpee', pattern: 'conditioning', kind: 'time', difficulty: 2 }),
];
const day: TemplateDay = {
  id: 'a', name: 'Full A', focus: 'full', slots: [
    { pattern: 'squat', role: 'main', sets: 4, reps: [3, 5], rir: 2, prefer: ['back-squat', 'jump-squat'] },
    { pattern: 'horizontal_push', role: 'secondary', sets: 3, reps: [8, 12], rir: 2, prefer: ['bench-press'] },
    { pattern: 'elbow_flexion', role: 'accessory', sets: 3, reps: [10, 15], rir: 1 },
    { pattern: 'conditioning', role: 'finisher', sets: 2, seconds: [30, 40], rir: 2 },
  ],
};
const base = { equipment: ['dumbbells', 'barbell', 'bench', 'rack'], injuries: [] as string[], sessionMinutes: 60, bodyweightKg: 80 };
const working = (w: { exercises: { sets: { kind: string }[] }[] }, i: number) => w.exercises[i]!.sets.filter((s) => s.kind === 'working').length;

describe('level ladder', () => {
  it('beginners do fewer, easier sets and never grind low reps; pros do more, closer to failure', () => {
    const b = adaptDay(day, 'beginner', 'standard', '18-29');
    const p = adaptDay(day, 'pro', 'standard', '18-29');
    expect(b.slots[0]!.sets).toBe(3);
    expect(b.slots[0]!.reps![0]).toBeGreaterThanOrEqual(8); // 3–5 → 8+ for beginners
    expect(b.slots[0]!.rir).toBeGreaterThanOrEqual(3);
    expect(p.slots[0]!.sets).toBe(5);
    expect(p.slots[0]!.reps).toEqual([3, 5]);
    expect(p.slots[0]!.rir).toBeLessThan(b.slots[0]!.rir);
  });
});

describe('mode bar', () => {
  it('Light drops the finisher and a set; Intense adds a set and lowers RIR', () => {
    const light = adaptDay(day, 'intermediate', 'light', '18-29');
    const intense = adaptDay(day, 'intermediate', 'intense', '18-29');
    expect(light.slots.some((s) => s.role === 'finisher')).toBe(false);
    expect(light.slots[0]!.sets).toBe(3);
    expect(intense.slots[0]!.sets).toBe(4); // capped at the intermediate max of 4
    expect(intense.slots[0]!.rir).toBe(1);
  });
  it('Home uses only home kit; Gym unlocks everything', () => {
    expect(equipmentFor('home', ['dumbbells', 'barbell', 'rack', 'machines'])).toEqual(['dumbbells']);
    expect(equipmentFor('gym', [])).toEqual(GYM_EQUIPMENT);
    const atHome = personalizeWorkout(day, catalog, { ...base, experience: 'intermediate', sex: 'male', ageYears: 28 }, { intensity: 'standard', where: 'home', minutes: null });
    expect(atHome.exercises.map((e) => e.exerciseId)).not.toContain('back-squat');
  });
  it('a shorter session trims work to fit', () => {
    const long = personalizeWorkout(day, catalog, { ...base, experience: 'intermediate', sex: 'male', ageYears: 28 });
    const short = personalizeWorkout(day, catalog, { ...base, experience: 'intermediate', sex: 'male', ageYears: 28 }, { intensity: 'standard', where: null, minutes: 20 });
    expect(short.estimatedMinutes).toBeLessThan(long.estimatedMinutes);
    expect(short.estimatedMinutes).toBeLessThanOrEqual(26);
  });
});

describe('age and sex', () => {
  it('age bands', () => {
    expect([16, 25, 35, 45, 60].map(ageBand)).toEqual(['teen', '18-29', '30-39', '40-49', '50+']);
    expect(deloadEveryWeeks(6, '50+')).toBe(4);
    expect(deloadEveryWeeks(6, '40-49')).toBe(5);
    expect(deloadEveryWeeks(6, '18-29')).toBe(6);
  });
  it('50+ beginners get no high-impact moves and more reps in reserve', () => {
    const w = personalizeWorkout(day, catalog, { ...base, equipment: [], experience: 'beginner', sex: 'female', ageYears: 58 });
    expect(w.exercises.map((e) => e.exerciseId)).not.toContain('jump-squat');
    expect(w.exercises.map((e) => e.exerciseId)).not.toContain('burpee');
    expect(w.ageBand).toBe('50+');
    const young = adaptDay(day, 'beginner', 'standard', '18-29');
    const older = adaptDay(day, 'beginner', 'standard', '50+');
    expect(older.slots[0]!.rir).toBeGreaterThan(young.slots[0]!.rir);
  });
  it('first-session loads come from strength standards, lighter for women and older hunters', () => {
    const bench = catalog[0]!;
    const m = standardE1rm(bench, 'male', 'intermediate', 80, '18-29')!;
    const f = standardE1rm(bench, 'female', 'intermediate', 80, '18-29')!;
    const older = standardE1rm(bench, 'male', 'intermediate', 80, '50+')!;
    expect(m).toBeCloseTo(1.0 * 80 * 0.8, 5);
    expect(f).toBeLessThan(m);
    expect(older).toBeLessThan(m);
    expect(standardE1rm(bench, null, 'intermediate', 80, '18-29')).toBeNull();
    // the workout now suggests a starting weight for the bench press with no history
    const w = personalizeWorkout(day, catalog, { ...base, experience: 'intermediate', sex: 'male', ageYears: 28 });
    const benchPlan = w.exercises.find((e) => e.exerciseId === 'bench-press')!;
    expect(benchPlan.sets.find((s) => s.kind === 'working')!.loadKg).toBeGreaterThan(20);
    // history wins over the standard
    const w2 = personalizeWorkout(day, catalog, { ...base, experience: 'intermediate', sex: 'male', ageYears: 28, bestE1rm: { 'bench-press': 140 } });
    expect(w2.exercises.find((e) => e.exerciseId === 'bench-press')!.sets.find((s) => s.kind === 'working')!.loadKg)
      .toBeGreaterThan(benchPlan.sets.find((s) => s.kind === 'working')!.loadKg!);
  });
  it('working sets reflect the level end to end', () => {
    const b = personalizeWorkout(day, catalog, { ...base, experience: 'beginner', sex: 'male', ageYears: 25 });
    const p = personalizeWorkout(day, catalog, { ...base, experience: 'pro', sex: 'male', ageYears: 25 });
    expect(working(p, 0)).toBeGreaterThan(working(b, 0));
  });
});

describe('promotion', () => {
  it('suggests the next level only with consistency and strength', () => {
    const strong = { horizontal_push: 85, squat: 125 };
    expect(suggestLevelUp({ level: 'novice', adherence4w: 0.9, sessions4w: 12, sex: 'male', bodyweightKg: 80, bestByPattern: strong })).toBe('intermediate');
    expect(suggestLevelUp({ level: 'novice', adherence4w: 0.6, sessions4w: 12, sex: 'male', bodyweightKg: 80, bestByPattern: strong })).toBeNull();
    expect(suggestLevelUp({ level: 'novice', adherence4w: 0.9, sessions4w: 12, sex: 'male', bodyweightKg: 80, bestByPattern: { horizontal_push: 40, squat: 60 } })).toBeNull();
    expect(suggestLevelUp({ level: 'pro', adherence4w: 1, sessions4w: 20, sex: 'male', bodyweightKg: 80, bestByPattern: strong })).toBeNull();
  });
});

describe('preview edits', () => {
  const ctx = { ...base, experience: 'intermediate' as const, sex: 'male' as const, ageYears: 28 };
  it('swap, remove and reorder by template slot, and they survive a mode change', () => {
    const w = personalizeWorkout(day, catalog, ctx, undefined, { swap: { 1: 'db-bench-press' }, remove: [2], order: [1, 0] });
    expect(w.exercises.map((e) => e.exerciseId)).toEqual(['db-bench-press', 'back-squat', 'burpee']);
    expect(w.templateSlots).toEqual([1, 0, 3]);
    // Light drops the finisher (template slot 3); the edits still point at the right slots
    const light = personalizeWorkout(day, catalog, ctx, { intensity: 'light', where: null, minutes: null }, { swap: { 1: 'db-bench-press' }, remove: [2], order: [1, 0] });
    expect(light.exercises.map((e) => e.exerciseId)).toEqual(['db-bench-press', 'back-squat']);
    // a swapped dumbbell press still gets a starting load
    expect(w.exercises[0]!.sets.find((s) => s.kind === 'working')!.loadKg).toBeGreaterThan(0);
  });
  it('removing every slot keeps the workout', () => {
    expect(personalizeWorkout(day, catalog, ctx, undefined, { remove: [0, 1, 2, 3] }).exercises.length).toBeGreaterThan(0);
  });
});

describe('in-session helpers', () => {
  it('a swapped lift gets a starting load; bodyweight and unknown sex do not', () => {
    const db = catalog[1]!;
    const ctx = { ...base, experience: 'intermediate' as const, sex: 'female' as const, ageYears: 30 };
    expect(startingLoad(db, { reps: [8, 12], rir: 2 }, ctx)).toBeGreaterThan(0);
    expect(startingLoad(catalog[2]!, { reps: [8, 12], rir: 2 }, ctx)).toBeNull();
    expect(startingLoad(db, { reps: [8, 12], rir: 2 }, { ...ctx, sex: null })).toBeNull();
    expect(startingLoad(db, { reps: [8, 12], rir: 2 }, { ...ctx, sex: null, bestE1rm: { 'db-bench-press': 30 } })).toBeGreaterThan(0);
  });
  it('stale sessions finish at the last set, not now', () => {
    const now = new Date('2026-11-21T12:00:00Z');
    expect(staleSession('2026-11-21T10:00:00Z', '2026-11-21T10:30:00Z', now).stale).toBe(false);
    const s = staleSession('2026-11-20T18:00:00Z', '2026-11-20T18:40:00Z', now);
    expect(s).toEqual({ stale: true, finishAt: '2026-11-20T18:41:00.000Z', canSave: true });
    expect(staleSession('2026-11-20T18:00:00Z', null, now).canSave).toBe(false);
    expect(staleSession('2026-11-01T18:00:00Z', '2026-11-01T18:30:00Z', now).canSave).toBe(false);
  });
});
