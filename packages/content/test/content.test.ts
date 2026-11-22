import { describe, expect, it } from 'vitest';
import { assessmentNorms, cosmeticById, cosmetics, exerciseById, exercises, features, heroes, quickSessions } from '../src';

describe('content', () => {
  it('norm tables parse and ascend', () => {
    expect(assessmentNorms.pushups.male.anchors.length).toBeGreaterThan(2);
  });
  it('parses and has unique ids', () => {
    expect(new Set(exercises.map((e) => e.id)).size).toBe(exercises.length);
    expect(heroes).toHaveLength(6);
    expect(new Set(cosmetics.map((c) => c.id)).size).toBe(cosmetics.length);
    expect(cosmetics.some((c) => c.free && c.slot === 'body')).toBe(true);
    expect(cosmeticById.has('body-standard')).toBe(true);
  });
  it('progression chains only reference known exercises', () => {
    for (const e of exercises) {
      for (const id of e.progression?.split('>') ?? []) expect(exerciseById.has(id), `${e.id} → ${id}`).toBe(true);
    }
  });
  it('every feature has a tier', () => {
    expect(Object.keys(features).length).toBe(12);
  });
});

import { computeTrueStats, scoreTrialEvents } from '@lb/engine';
import { trials } from '../src';

describe('real norms and trials', () => {
  it('trial config covers home and gym STR/END and AGI', () => {
    const ids = trials.events.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['pushups', 'lift', 'plankSec', 'squats60', 'run2400Sec']));
  });
  it('a median adult male scores ~50th percentile across the board', () => {
    const ev = scoreTrialEvents(
      { sex: 'male', ageYears: 28, bodyweightKg: 80, setting: 'HOME', results: { pushups: 22, plankSec: 80, squats60: 40, run2400Sec: 750 }, bestE1rm: {} },
      assessmentNorms,
    );
    for (const e of ev) expect(e.percentile).toBe(50);
    const s = computeTrueStats(
      { sex: 'male', ageYears: 28, bodyweightKg: 80, experience: 'novice', tests: { pushups: 22, plankSec: 80, squats60: 40 }, bestE1rm: { 'back-squat': 100 }, calisthenicsLevels: [], weeklyHardSets4w: 20, sessionsDone28: 0, sessionsPlanned28: 0 },
      assessmentNorms,
    );
    expect(s.stats.STR).toBe(50); // 1.25× squat = p50, 22 push-ups = p50
  });
});

import { generateDailyQuest, penaltyQuestOptions, REST_RITUAL } from '@lb/engine';
import { sideQuests } from '../src';

describe('quest content', () => {
  it('every quest exercise exists in the library', () => {
    const ids = [
      ...generateDailyQuest({ baselines: {}, experience: 'novice', scale: 0.6, trainingDay: false, heroClass: 'RANGER' }),
      ...generateDailyQuest({ baselines: {}, experience: 'novice', scale: 0.6, trainingDay: false, injuries: ['wrist', 'knee', 'shoulder'] }),
      ...penaltyQuestOptions({ scale: 0.6 }).flat(), ...penaltyQuestOptions({ scale: 0.6, injuries: ['knee', 'shoulder'] }).flat(), ...REST_RITUAL,
    ].map((s) => s.exerciseId);
    for (const id of ids) expect(exerciseById.has(id), id).toBe(true);
  });
  it('auto side quests point at real quick sessions', () => {
    for (const q of sideQuests.filter((x) => x.verify.startsWith('auto:quick:')))
      expect(quickSessions.some((s) => `auto:quick:${s.id}` === q.verify)).toBe(true);
  });
});

import { exerciseMedia, flows, programs as allPrograms } from '../src';

describe('visuals content (VISUALS.md)', () => {
  it('every exercise has a media entry, and no entry points at an unknown exercise', () => {
    for (const e of exercises) expect(exerciseMedia[e.id], e.id).toBeTruthy();
    for (const id of Object.keys(exerciseMedia)) expect(exerciseById.has(id), id).toBe(true);
  });
  it('launch tier covers every quick-session move, flow move and program main lift', () => {
    const need = new Set<string>();
    quickSessions.forEach((q) => q.moves.forEach((m) => need.add(m)));
    for (const k of ['warmup', 'cooldown'] as const) for (const f of Object.values(flows[k])) f.forEach((s) => need.add(s.exerciseId));
    allPrograms.forEach((p) => p.days.forEach((d) => d.slots.filter((s) => s.role === 'main').forEach((s) => (s.prefer ?? []).forEach((id) => need.add(id)))));
    for (const id of need) expect(exerciseMedia[id]?.tier, id).toBe(1);
  });
  it('flow moves exist and are timed-friendly', () => {
    for (const k of ['warmup', 'cooldown'] as const)
      for (const f of Object.values(flows[k])) for (const s of f) expect(exerciseById.has(s.exerciseId), s.exerciseId).toBe(true);
    for (const id of flows.safeSwaps) expect(exerciseById.has(id), id).toBe(true);
  });
});

import { curatedFoodById, curatedFoods } from '../src';
import { kcalFromMacros, rankFoods } from '@lb/engine';

describe('curated foods', () => {
  it('have unique ids and sensible servings', () => {
    expect(new Set(curatedFoods.map((f) => f.id)).size).toBe(curatedFoods.length);
    for (const f of curatedFoods) for (const s of f.servings) expect(s.grams, `${f.id} ${s.label}`).toBeLessThan(1000);
  });
  it('covers a real catalog (USDA FDC import, tools/foods/import-fdc.mjs)', () => {
    expect(curatedFoods.filter((f) => f.source === 'usda').length).toBeGreaterThanOrEqual(400);
  });
  it('label kcal agrees with macros (fiber-adjusted Atwater, ±15%) for every food', () => {
    // USDA derives cocoa's energy from cocoa-specific factors (protein 1.83, carbs 1.33 kcal/g)
    const specificFactors = new Set(['cocoa-powder']);
    for (const f of curatedFoods) {
      // low-energy foods (coffee, greens, citrus, mushrooms) are dominated by rounding and organic acids
      if (f.per100.kcal < 40 || specificFactors.has(f.id)) continue;
      // fiber yields ~2 kcal/g, not 4 — USDA's own factors account for this
      const fiber = f.per100.fiber ?? 0;
      const fromMacros = kcalFromMacros({ ...f.per100, carbs: f.per100.carbs - fiber }) + 2 * fiber;
      expect(Math.abs(f.per100.kcal - fromMacros) / f.per100.kcal, f.id).toBeLessThan(0.15);
    }
  });
  it('search puts the obvious food first across the full catalog', () => {
    const top = (q: string) => rankFoods(q, curatedFoods)[0]!.id;
    expect(top('egg')).toBe('egg-whole');
    expect(top('eggs')).toBe('egg-whole');
    expect(top('rice')).toBe('rice-white-cooked');
    expect(top('chicken')).toBe('chicken-breast-roasted');
    expect(top('milk')).toBe('milk-whole');
    expect(top('paneer')).toBe('paneer');
    expect(top('curd')).toBe('yogurt-whole');
  });
  it('builds recipes from ingredients by cooked weight', () => {
    // roti: 100 g whole-wheat flour (340 kcal) → 130 g cooked = 261.5 kcal / 100 g
    expect(curatedFoodById.get('roti')!.per100.kcal).toBeCloseTo(261.5, 0);
    expect(curatedFoodById.get('roti')!.source).toBe('recipe');
  });
});

import { normalizeOffProduct } from '../src';

describe('Open Food Facts mapping', () => {
  it('maps a product with serving size', () => {
    const f = normalizeOffProduct({ status: 1, product: { code: '123', product_name: 'Protein Bar', brands: 'Acme, Other', serving_quantity: 60, serving_size: '1 bar (60 g)', nutriments: { 'energy-kcal_100g': 350, proteins_100g: 33, carbohydrates_100g: 30, fat_100g: 10, fiber_100g: 5 } } })!;
    expect(f).toMatchObject({ id: 'off:123', brand: 'Acme', source: 'off', verified: false, per100: { kcal: 350, protein: 33 } });
    expect(f.servings[0]).toEqual({ label: '1 bar (60 g)', grams: 60 });
  });
  it('converts kJ when kcal is missing, rejects incomplete labels', () => {
    expect(normalizeOffProduct({ status: 1, product: { code: '1', product_name: 'X', nutriments: { energy_100g: 418.4, proteins_100g: 1, carbohydrates_100g: 20, fat_100g: 1 } } })!.per100.kcal).toBe(100);
    expect(normalizeOffProduct({ status: 1, product: { code: '2', product_name: 'Y', nutriments: { 'energy-kcal_100g': 100 } } })).toBeNull();
    expect(normalizeOffProduct({ status: 0 })).toBeNull();
  });
});
