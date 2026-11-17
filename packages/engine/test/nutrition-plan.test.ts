import { describe, expect, it } from 'vitest';
import { ageOn, nutritionPlan, rankFoods, textMatch, weeklyCheckIn, type IntakeDay, type NutritionProfileInput, type WeighIn } from '../src';

const DAY = 86_400_000;
const iso = (base: string, plus: number) => new Date(Date.parse(`${base}T00:00:00Z`) + plus * DAY).toISOString().slice(0, 10);

// SYSTEMS.md §2.6 worked example
const fixture: NutritionProfileInput = {
  sex: 'male', birthDate: '2001-01-10', heightCm: 178, weightKg: 80, bodyFatPct: null, lifestyle: 'light',
  goal: 'cut', ratePerWeek: -0.005, fatPreference: 'balanced',
  weeklySessions: Array.from({ length: 4 }, () => ({ kind: 'strength' as const, minutes: 60 })),
};

describe('ageOn', () => {
  it('counts whole years and respects the birthday', () => {
    expect(ageOn('2001-01-10', '2026-01-09')).toBe(24);
    expect(ageOn('2001-01-10', '2026-01-10')).toBe(25);
  });
});

describe('nutritionPlan', () => {
  it('matches the §2.6 worked example with no data yet', () => {
    const p = nutritionPlan({ profile: fixture, weighIns: [], intake: [], today: '2026-06-01' });
    expect(p.ageYears).toBe(25);
    expect(Math.round(p.bmr * 10) / 10).toBe(1792.5);
    expect(Math.round(p.prior)).toBe(2513);
    expect(p.calibrating).toBe(true);
    expect(Math.round(p.target.kcal)).toBe(2073);
    expect(Math.round(p.macros.proteinG)).toBe(160);
    expect(Math.round(p.macros.fatG)).toBe(69);
    expect(Math.round(p.macros.carbsG)).toBe(203);
  });

  it('converges toward the observed TDEE from real intake and weight', () => {
    const start = '2026-05-01';
    const weighIns: WeighIn[] = Array.from({ length: 28 }, (_, d) => ({ date: iso(start, d), kg: 80 - 0.05 * d }));
    const intake: IntakeDay[] = Array.from({ length: 28 }, (_, d) => ({ date: iso(start, d), kcal: 2100, meals: 3, markedComplete: false }));
    const p = nutritionPlan({ profile: fixture, weighIns, intake, today: iso(start, 28) });
    expect(p.calibrating).toBe(false);
    expect(p.confidence).toBeGreaterThan(0.9);
    // observed = 2,100 + 7,700 × 0.05 = 2,485; the estimate moves from the prior toward it
    expect(p.tdee).toBeLessThan(p.prior);
    expect(p.tdee).toBeGreaterThan(2485);
    expect(p.trendKg).toBeLessThan(80);
  });

  it('never drops the target below the safety floor', () => {
    const tiny = { ...fixture, sex: 'female' as const, weightKg: 50, heightCm: 155, lifestyle: 'sedentary' as const, ratePerWeek: -0.01, weeklySessions: [] };
    const p = nutritionPlan({ profile: tiny, weighIns: [], intake: [], today: '2026-06-01' });
    expect(p.target.kcal).toBeGreaterThanOrEqual(Math.max(1200, p.bmr));
  });
});

describe('weeklyCheckIn', () => {
  const base = { kcalTarget: 2073, goal: 'cut' as const, ratePerWeek: -0.005, trendKg: 80, today: '2026-06-15' };
  const intake = (n: number): IntakeDay[] => Array.from({ length: n }, (_, d) => ({ date: iso('2026-06-15', -d), kcal: 2050, meals: 3, markedComplete: false }));
  const weigh = (perDay: number): WeighIn[] => Array.from({ length: 12 }, (_, d) => ({ date: iso('2026-06-15', -d), kg: 80 - perDay * (11 - d) }));

  it('keeps targets when there are fewer than 4 logged days (no shaming)', () => {
    const r = weeklyCheckIn({ ...base, intake: intake(3), weighIns: weigh(0.057) });
    expect(r.verdict).toBe('insufficient');
    expect(r.message).toMatch(/stay the same/);
  });
  it('recognises an on-plan week', () => {
    expect(weeklyCheckIn({ ...base, intake: intake(6), weighIns: weigh(0.057) }).verdict).toBe('onTrack');
  });
  it('flags faster and slower than planned', () => {
    expect(weeklyCheckIn({ ...base, intake: intake(6), weighIns: weigh(0.15) }).verdict).toBe('faster');
    expect(weeklyCheckIn({ ...base, intake: intake(6), weighIns: weigh(0) }).verdict).toBe('slower');
  });
});

describe('food search', () => {
  const foods = [
    { id: 'rice', name: 'White rice, cooked', verified: true },
    { id: 'chicken', name: 'Chicken breast, roasted', verified: true },
    { id: 'chickpeas', name: 'Chickpeas, boiled', verified: true },
    { id: 'choc', name: 'Chocolate bar', brand: 'Snackco', verified: false },
  ];
  it('matches word prefixes', () => {
    expect(textMatch('chick', 'Chicken breast, roasted')).toBeGreaterThan(0.5);
    expect(rankFoods('chick', foods).map((f) => f.id).slice(0, 2).sort()).toEqual(['chicken', 'chickpeas']);
    expect(rankFoods('rice', foods)[0]!.id).toBe('rice');
  });
  it('boosts foods you log often', () => {
    const personal = new Map([['chickpeas', { count: 30, daysSinceLast: 1 }]]);
    expect(rankFoods('chick', foods, personal)[0]!.id).toBe('chickpeas');
  });
  it('drops non-matches', () => {
    expect(rankFoods('salmon', foods)).toEqual([]);
  });
});

import { applyMacroOverride, weeklyTargets } from '../src';

describe('weeklyTargets', () => {
  const latest = { effectiveFrom: '2026-06-01', kcal: 2000, proteinG: 160, fatG: 65, carbsG: 193, fiberG: 28, goal: 'cut' as const, ratePerWeek: -0.005 };
  it('keeps the same targets within the week', () => {
    const r = weeklyTargets({ profile: fixture, weighIns: [], intake: [], today: '2026-06-05', latest });
    expect(r.store).toBe(false);
    expect(r.macros.kcal).toBe(2000);
    expect(r.effectiveFrom).toBe('2026-06-01');
  });
  it('recomputes after 7 days with ±150 kcal smoothing', () => {
    const r = weeklyTargets({ profile: fixture, weighIns: [], intake: [], today: '2026-06-08', latest: { ...latest, kcal: 1800 } });
    expect(r.store).toBe(true);
    expect(r.effectiveFrom).toBe('2026-06-08');
    expect(r.macros.kcal).toBe(1950); // the plan wants 2,073, capped at +150 from last week's 1,800
  });
  it('applies a goal change immediately without smoothing', () => {
    const r = weeklyTargets({ profile: { ...fixture, goal: 'maintain', ratePerWeek: 0 }, weighIns: [], intake: [], today: '2026-06-03', latest });
    expect(r.store).toBe(true);
    expect(Math.round(r.macros.kcal)).toBe(2513);
  });
  it('manual override: carbs fill the rest', () => {
    const m = applyMacroOverride({ kcal: 2000, proteinG: 150, fatG: 60, carbsG: 215, fiberG: 28, waterMl: 2800 }, { proteinG: 180 });
    expect(m.proteinG).toBe(180);
    expect(m.carbsG).toBe((2000 - 720 - 540) / 4);
  });
});
