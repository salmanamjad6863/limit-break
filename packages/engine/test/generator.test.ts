import { describe, expect, it } from 'vitest';
import {
  adjustNextLoad, canPerform, computeWorkoutRewards, generateWorkout, loadFromLoggedSet, nextDayIndex, weekPlan,
  type CatalogExercise, type TemplateDay,
} from '../src';

const ex = (o: Partial<CatalogExercise> & Pick<CatalogExercise, 'id' | 'pattern'>): CatalogExercise => ({
  name: o.id, equipment: [], difficulty: 2, bwFactor: 0, restType: 'secondaryCompound', kind: 'reps', loadType: 'bodyweight', ...o,
});
const catalog: CatalogExercise[] = [
  ex({ id: 'push-up', pattern: 'horizontal_push', bwFactor: 0.64, avoid: ['wrist'] }),
  ex({ id: 'db-floor-press', pattern: 'horizontal_push', equipment: ['dumbbells'], loadType: 'dumbbell', difficulty: 1 }),
  ex({ id: 'bench-press', pattern: 'horizontal_push', equipment: ['barbell', 'bench', 'rack'], loadType: 'barbell', difficulty: 3, restType: 'mainCompound' }),
  ex({ id: 'goblet-squat', pattern: 'squat', anyOf: ['dumbbells', 'kettlebell'], loadType: 'dumbbell' }),
  ex({ id: 'bodyweight-squat', pattern: 'squat', bwFactor: 0.85, difficulty: 1 }),
  ex({ id: 'pistol-squat', pattern: 'squat', bwFactor: 0.85, difficulty: 5 }),
  ex({ id: 'doorframe-row', pattern: 'horizontal_pull', bwFactor: 0.35, difficulty: 1 }),
  ex({ id: 'plank', pattern: 'core_anti_extension', kind: 'time', restType: 'isolation', difficulty: 1 }),
  ex({ id: 'curl', pattern: 'elbow_flexion', equipment: ['dumbbells'], loadType: 'dumbbell', restType: 'isolation', difficulty: 1 }),
];
const day: TemplateDay = {
  id: 'a', name: 'Full A', focus: 'full', slots: [
    { pattern: 'squat', role: 'main', sets: 3, reps: [8, 12], rir: 2, prefer: ['pistol-squat', 'goblet-squat'] },
    { pattern: 'horizontal_push', role: 'main', sets: 4, reps: [5, 8], rir: 2, prefer: ['bench-press', 'push-up'] },
    { pattern: 'vertical_pull', fallback: ['horizontal_pull'], role: 'secondary', sets: 3, reps: [8, 12], rir: 2 },
    { pattern: 'elbow_flexion', role: 'accessory', sets: 3, reps: [10, 15], rir: 1 },
    { pattern: 'core_anti_extension', role: 'core', sets: 3, seconds: [20, 40], rir: 2 },
  ],
};
const home = { equipment: [] as string[], injuries: [] as string[], experience: 'novice' as const, sessionMinutes: 60, bodyweightKg: 80 };

describe('generator', () => {
  it('respects equipment, difficulty ceiling and fallback patterns', () => {
    const w = generateWorkout(day, catalog, home);
    const ids = w.exercises.map((e) => e.exerciseId);
    expect(ids[0]).toBe('bodyweight-squat'); // pistol too hard for a novice, goblet needs weights
    expect(ids).toContain('push-up'); // no barbell at home
    expect(ids).toContain('doorframe-row'); // vertical pull → horizontal fallback
    expect(ids).not.toContain('curl'); // no dumbbells
    expect(w.unfilled).toEqual(['elbow_flexion']);
    expect(w.exercises.find((e) => e.exerciseId === 'plank')!.sets[0]!.seconds).toEqual([20, 40]);
  });
  it('injuries exclude exercises', () => {
    const w = generateWorkout(day, catalog, { ...home, injuries: ['wrist'] });
    expect(w.exercises.map((e) => e.exerciseId)).not.toContain('push-up');
  });
  it('gym user with history gets loads, warm-ups and strength rest', () => {
    const w = generateWorkout(day, catalog, {
      ...home, equipment: ['barbell', 'bench', 'rack', 'dumbbells'], experience: 'intermediate', bestE1rm: { 'bench-press': 100 },
    });
    const bench = w.exercises.find((e) => e.exerciseId === 'bench-press')!;
    const working = bench.sets.filter((s) => s.kind === 'working');
    expect(working[0]!.loadKg).toBe(75); // 8 reps @ RIR 2 → 100 / (1 + 10/30) = 75
    expect(bench.sets.filter((s) => s.kind === 'warmup').length).toBe(3);
    expect(bench.restSeconds).toBe(150);
  });
  it('time-squeeze keeps compounds and trims accessories first', () => {
    const w = generateWorkout(day, catalog, { ...home, equipment: ['dumbbells'], sessionMinutes: 15 });
    expect(w.estimatedMinutes).toBeLessThanOrEqual(15);
    const main = w.exercises.filter((e) => e.role === 'main');
    expect(main.length).toBe(2);
    for (const m of main) expect(m.sets.filter((s) => s.kind === 'working').length).toBeGreaterThanOrEqual(2);
  });
  it('low readiness lightens the session', () => {
    const w = generateWorkout(day, catalog, { ...home, readiness: 30 });
    expect(w.lightened).toBe(true);
    expect(w.exercises[0]!.sets.filter((s) => s.kind === 'working').length).toBe(2);
    expect(w.exercises[0]!.sets[0]!.rir).toBe(3);
  });
  it('swap forces a valid exercise', () => {
    const w = generateWorkout(day, catalog, { ...home, swaps: { 1: 'push-up' } });
    expect(w.exercises[1]!.exerciseId).toBe('push-up');
  });
  it('anyOf equipment', () => {
    expect(canPerform(catalog[3]!, { equipment: ['kettlebell'], injuries: [] })).toBe(true);
    expect(canPerform(catalog[3]!, { equipment: ['bands'], injuries: [] })).toBe(false);
  });
});

describe('schedule', () => {
  it('rotates program days by sessions completed', () => {
    expect(nextDayIndex(3, 0)).toBe(0);
    expect(nextDayIndex(3, 4)).toBe(1);
  });
  it('week plan places days on training weekdays (Mon-first)', () => {
    // 3 days/wk = Mon, Wed, Fri. Today Wednesday, 1 session done this week → Wed = B.
    expect(weekPlan(['A', 'B', 'C'], 3, 1, 3)).toEqual(['A', null, 'B', null, 'C', null, null]);
  });
});

describe('set coaching', () => {
  it('derives next load from a logged set', () => {
    // 60 kg × 8 @ RIR2 → e1RM ≈ 79.6 → target 10 reps @ RIR2 ≈ 79.6/(1+12/30)=56.9 → 57.5
    expect(loadFromLoggedSet({ reps: 8, loadKg: 60, rir: 2 }, { reps: [8, 10], rir: 2 }, 'barbell')).toBe(57.5);
  });
  it('auto-adjusts up, down or holds', () => {
    const p = { reps: [6, 8] as [number, number], rir: 2, loadKg: 100 };
    expect(adjustNextLoad(p, { reps: 8, rir: 4 }, 'barbell')).toEqual({ loadKg: 105, change: 'up' });
    expect(adjustNextLoad(p, { reps: 5, rir: 0 }, 'barbell')).toEqual({ loadKg: 95, change: 'down' });
    expect(adjustNextLoad(p, { reps: 7, rir: 2 }, 'barbell').change).toBe('hold');
    expect(adjustNextLoad(p, { reps: 8, rir: 5 }, 'bodyweight').change).toBe('hold');
  });
});

describe('workout rewards', () => {
  const set = (o: Partial<Parameters<typeof computeWorkoutRewards>[0]['sets'][number]>) => ({
    exerciseId: 'bench-press', reps: 5, loadKg: 100, rir: 2, isWarmup: false, bwFactor: 0, kind: 'reps' as const, ...o,
  });
  it('detects PRs only against an existing best, and grants XP', () => {
    const r = computeWorkoutRewards({
      sets: [set({}), set({}), set({ exerciseId: 'new-lift' }), set({ isWarmup: true, loadKg: 60 })],
      plannedHardSets: 3, bestE1rm: { 'bench-press': 110 }, bodyweightKg: 80, xpEarnedToday: 0, currentXp: 0,
    });
    // 100 × 7 reps-to-failure → mean(Epley 123.3, Brzycki 120) = 121.7 > 110 → PR; new-lift = baseline only
    expect(r.prs.map((p) => p.exerciseId)).toEqual(['bench-press']);
    expect(r.bestE1rm['new-lift']).toBeGreaterThan(0);
    expect(r.session.total).toBe(30 + 50 + 25);
    expect(r.rewards.some((x) => x.type === 'levelUp')).toBe(true);
  });
  it('bodyweight PRs use bwFactor × bodyweight', () => {
    const r = computeWorkoutRewards({
      sets: [set({ exerciseId: 'pull-up', loadKg: 0, bwFactor: 1, reps: 10, rir: 0 })],
      plannedHardSets: 1, bestE1rm: { 'pull-up': 90 }, bodyweightKg: 80, xpEarnedToday: 0, currentXp: 500,
    });
    expect(r.prs[0]!.exerciseId).toBe('pull-up'); // 80 × (1+10/30) ≈ 106.7 / Brzycki 106.7
  });
  it('respects the daily cap', () => {
    const r = computeWorkoutRewards({
      sets: Array.from({ length: 10 }, () => set({})), plannedHardSets: 10, bestE1rm: {}, bodyweightKg: 80, xpEarnedToday: 480, currentXp: 0,
    });
    expect(r.granted).toBe(20);
    expect(r.rewards.some((x) => x.type === 'capReached')).toBe(true);
  });
});

describe('fallback after exclusion', () => {
  it('uses the fallback pattern when the only primary exercise was already used', () => {
    const d: TemplateDay = { id: 'x', name: 'x', focus: 'upper', slots: [
      { pattern: 'vertical_pull', fallback: ['horizontal_pull'], role: 'main', sets: 3, reps: [5, 8], rir: 2 },
      { pattern: 'horizontal_pull', fallback: ['core_anti_extension'], role: 'secondary', sets: 3, reps: [8, 12], rir: 2 },
      { pattern: 'squat', role: 'main', sets: 3, reps: [8, 12], rir: 2 },
    ] };
    const w = generateWorkout(d, catalog, home);
    expect(w.exercises.map((e) => e.exerciseId)).toEqual(['doorframe-row', 'bodyweight-squat']);
    expect(w.unfilled).toEqual(['horizontal_pull']); // plank is timed, so it can't fill a reps slot
  });
});

describe('cardio-only sessions', () => {
  it('earn minutes × zone only, with no completion bonus', () => {
    const r = computeWorkoutRewards({
      sets: [], plannedHardSets: 0, cardio: [{ minutes: 15, zone: 4 }], bestE1rm: {}, bodyweightKg: 80, xpEarnedToday: 0, currentXp: 0,
    });
    expect(r.session.completionBonus).toBe(0);
    expect(r.granted).toBe(90); // 15 min × 4 XP × 1.5 (Z4)
  });
});
