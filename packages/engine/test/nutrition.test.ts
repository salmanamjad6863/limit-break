import { describe, expect, it } from 'vitest';
import { rankFoods,
  bmr, calorieTarget, computeTrend, labelLooksOff, macroTargets, needsLowIntakeCheckIn,
  observedTdee, tdeePrior, updateTdee, weightSlopePerDay, type IntakeDay, type WeighIn,
} from '../src';

// SYSTEMS.md §2.6 worked example
const user = { sex: 'male' as const, weightKg: 80, heightCm: 178, ageYears: 25 };

describe('SYSTEMS §2.6 worked example', () => {
  it('BMR (Mifflin) = 1792.5', () => expect(bmr(user)).toBeCloseTo(1792.5, 5));

  it('TDEE prior ≈ 2513', () => {
    const prior = tdeePrior({
      ...user,
      lifestyle: 'light',
      weeklySessions: Array.from({ length: 4 }, () => ({ kind: 'strength' as const, minutes: 60 })),
    });
    expect(Math.round(prior)).toBe(2513);
  });

  it('cut −0.5%/wk → 2073 kcal, 160P / 69F / 203C', () => {
    const tdee = 2513;
    const t = calorieTarget({ ...user, tdee, bmr: 1792.5, trendWeightKg: 80, goal: 'cut', ratePerWeek: -0.005 });
    expect(Math.round(t.delta)).toBe(-440);
    expect(Math.round(t.kcal)).toBe(2073);
    expect(t.appliedRails).toEqual([]);
    const m = macroTargets({ kcal: t.kcal, goal: 'cut', weightKg: 80, heightCm: 178 });
    expect(Math.round(m.proteinG)).toBe(160);
    expect(Math.round(m.fatG)).toBe(69);
    expect(Math.round(m.carbsG)).toBe(203);
    expect(Math.round(m.fiberG)).toBe(29);
  });

  it('observed TDEE after 3 weeks = 2485', () => {
    expect(observedTdee(2100, -0.05)).toBeCloseTo(2485, 6);
  });
});

describe('safety rails', () => {
  it('under-18 never gets a deficit', () => {
    const t = calorieTarget({ ...user, ageYears: 16, tdee: 2500, bmr: 1750, trendWeightKg: 80, goal: 'cut', ratePerWeek: -0.005 });
    expect(t.kcal).toBe(2500);
    expect(t.appliedRails).toContain('under18');
  });
  it('deficit is capped at 25% of TDEE', () => {
    const t = calorieTarget({ ...user, trendWeightKg: 130, heightCm: 180, tdee: 2000, bmr: 1900, goal: 'cut', ratePerWeek: -0.01 });
    expect(t.appliedRails).toContain('deficitCap');
  });
  it('floor = max(BMR, sex floor)', () => {
    const t = calorieTarget({ sex: 'female', ageYears: 30, heightCm: 155, trendWeightKg: 50, tdee: 1500, bmr: 1150, goal: 'cut', ratePerWeek: -0.0075 });
    expect(t.kcal).toBe(1200);
    expect(t.appliedRails).toContain('floor');
  });
  it('weekly change limited to ±150', () => {
    const t = calorieTarget({ ...user, tdee: 2513, bmr: 1792.5, trendWeightKg: 80, goal: 'cut', ratePerWeek: -0.005, lastWeekTarget: 2400 });
    expect(t.kcal).toBe(2250);
  });
  it('low-intake check-in triggers on 3 of 7 days', () => {
    expect(needsLowIntakeCheckIn([2000, 900, 2000, 950, 2000, 980, 2000], 1700)).toBe(true);
    expect(needsLowIntakeCheckIn([2000, 900, 2000, 2000, 2000, 980, 2000], 1700)).toBe(false);
  });
  it('flags labels whose kcal disagree with macros by >15%', () => {
    expect(labelLooksOff({ kcal: 100, protein: 10, carbs: 10, fat: 2 })).toBe(false); // 98
    expect(labelLooksOff({ kcal: 300, protein: 10, carbs: 10, fat: 2 })).toBe(true);
  });
});

// deterministic pseudo-random for noisy synthetic data
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
}

describe('adaptive TDEE convergence (SYSTEMS §8)', () => {
  it('converges within ±50 kcal of the true TDEE in 60 days with ±1 kg noise and 80% logging', () => {
    const TRUE_TDEE = 2600;
    const INTAKE = 2100;
    const rand = rng(42);
    const start = Date.UTC(2026, 0, 1);
    const iso = (d: number) => new Date(start + d * 86_400_000).toISOString().slice(0, 10);
    const weighIns: WeighIn[] = [];
    const intake: IntakeDay[] = [];
    let fat = 90;
    let tdee = 2300; // deliberately wrong prior
    for (let d = 0; d < 60; d++) {
      fat += (INTAKE - TRUE_TDEE) / 7700;
      weighIns.push({ date: iso(d), kg: fat + (rand() * 2 - 1) });
      if (rand() < 0.8) intake.push({ date: iso(d), kcal: INTAKE, meals: 3, markedComplete: true });
      const window = (xs: { date: string }[]) => xs.filter((x) => x.date > iso(d - 21) && x.date <= iso(d));
      const w = window(weighIns) as WeighIn[];
      tdee = updateTdee({
        previousTdee: tdee, bmr: 1850, kcalTarget: INTAKE,
        intake: window(intake) as IntakeDay[],
        slopeKgPerDay: weightSlopePerDay(w),
        weighInsInWindow: w.length,
      }).tdee;
    }
    expect(Math.abs(tdee - TRUE_TDEE)).toBeLessThan(50);
  });

  it('trend smooths noise and handles gaps', () => {
    const t = computeTrend([
      { date: '2026-01-01', kg: 80 }, { date: '2026-01-02', kg: 81 }, { date: '2026-01-05', kg: 79 },
    ]);
    expect(t).toHaveLength(3);
    expect(t[2]!.trend).toBeGreaterThan(79);
    expect(t[2]!.trend).toBeLessThan(81);
  });
});

describe('food search forgives plurals', () => {
  const foods = [
    { id: 'egg', name: 'Egg, whole', verified: true },
    { id: 'omelette', name: 'Omelette (2 eggs, 1 tsp oil)', verified: true },
    { id: 'tomato', name: 'Tomato', verified: true },
    { id: 'straw', name: 'Strawberries', verified: true },
    { id: 'hummus', name: 'Hummus', verified: true },
  ];
  it('plural queries find singular foods and vice versa', () => {
    expect(rankFoods('eggs', foods).map((f) => f.id)).toEqual(expect.arrayContaining(['egg', 'omelette']));
    expect(rankFoods('eggs', foods)[0]!.id).toBe('egg');
    expect(rankFoods('tomatoes', foods)[0]!.id).toBe('tomato');
    expect(rankFoods('strawberry', foods)[0]!.id).toBe('straw');
    expect(rankFoods('hummus', foods)[0]!.id).toBe('hummus');
  });
  it('a short name does not beat the staple on length alone; popularity decides within a tier', () => {
    const pool = [
      { id: 'cakes', name: 'Rice cakes', verified: true, popularity: 0.6 },
      { id: 'rice', name: 'Rice, white, cooked', verified: true, popularity: 1 },
      { id: 'cheesecake', name: 'Cheesecake', verified: true, popularity: 0.6 },
      { id: 'cheddar', name: 'Cheddar cheese', verified: true, popularity: 0.6 },
    ];
    expect(rankFoods('rice', pool)[0]!.id).toBe('rice');
    // "cheese" is a whole word in "Cheddar cheese" but only a prefix of "Cheesecake"
    expect(rankFoods('cheese', pool)[0]!.id).toBe('cheddar');
    expect(rankFoods('chee', pool).map((f) => f.id)).toEqual(expect.arrayContaining(['cheddar', 'cheesecake']));
  });
});
