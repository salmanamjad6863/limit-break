import { z } from 'zod';
import exercisesJson from './data/exercises.json';
import featuresJson from './data/features.json';
import heroesJson from './data/heroes.json';
import cosmeticsJson from './data/cosmetics.json';
import normsJson from './data/norms.json';
import notificationsJson from './data/notifications.json';
import workoutTypesJson from './data/workout-types.json';
import burnProtocol from './data/programs/burn-protocol.json';
import foundation from './data/programs/foundation.json';
import ironFoundation from './data/programs/iron-foundation.json';
import linearStrength from './data/programs/linear-strength.json';
import shinobiPath from './data/programs/shinobi-path.json';
import upperLowerBuilder from './data/programs/upper-lower-builder.json';
import pushPullLegs from './data/programs/push-pull-legs.json';
import upperLowerFull from './data/programs/upper-lower-full.json';
import powerbuilding from './data/programs/powerbuilding.json';
import lowerGlutes from './data/programs/lower-glutes.json';
import dumbbellOnly from './data/programs/dumbbell-only.json';
import quickSessionsJson from './data/quick-sessions.json';
import sideQuestsJson from './data/side-quests.json';
import trialsJson from './data/trials.json';
import exerciseMediaJson from './data/exercise-media.json';
import flowsJson from './data/flows.json';
import foodsJson from './data/foods.json';
import { AssessmentNorms, Cosmetic, Exercise, ExerciseMediaEntry, FeatureMatrix, Flows, FoodsFile, Hero, type FoodItem, type Per100, Notifications, ProgramTemplate, QuickSession, SideQuest, TrialsConfig, WorkoutType } from './schemas';


export * from './schemas';

/** Parsed at import time — invalid content fails fast in dev and in CI. */
export const exercises = z.array(Exercise).parse(exercisesJson);
export const heroes = z.array(Hero).parse(heroesJson);
export const cosmetics = z.array(Cosmetic).parse(cosmeticsJson);
export const cosmeticById = new Map(cosmetics.map((c) => [c.id, c]));
export const features = FeatureMatrix.parse(featuresJson);

export const notifications = Notifications.parse(notificationsJson);
/** PROVISIONAL norm anchors — see data/norms.json `_status`. */
export const assessmentNorms = AssessmentNorms.parse(normsJson);

export const workoutTypes = z.array(WorkoutType).parse(workoutTypesJson);

/** Program templates (PLAN.md §5.9). Order = display order. */
export const programs = z
  .array(ProgramTemplate)
  .parse([
    foundation, dumbbellOnly, shinobiPath, burnProtocol, ironFoundation, linearStrength, upperLowerFull, lowerGlutes, upperLowerBuilder, pushPullLegs, powerbuilding,
  ]);
export const programById = new Map(programs.map((p) => [p.id, p]));
/** Free tier (feature `starterPrograms`); the rest are `allPrograms` (premium, SYSTEMS.md §7.2). A user's running program is never locked. */
export const starterProgramIds: ReadonlySet<string> = new Set(['foundation', 'dumbbell-only', 'iron-foundation', 'linear-strength', 'burn-protocol']);
export const quickSessions = z.array(QuickSession).parse(quickSessionsJson);
export const trials = TrialsConfig.parse(trialsJson);
export const sideQuests = z.array(SideQuest).parse(sideQuestsJson);
/** Demo media per exercise; clips are added here as the content pipeline produces them. */
export const exerciseMedia = z.record(z.string(), ExerciseMediaEntry).parse(exerciseMediaJson);
export const flows = Flows.parse(flowsJson);

export const exerciseById = new Map(exercises.map((e) => [e.id, e]));

const foodsFile = FoodsFile.parse(foodsJson);

/**
 * Curated foods (USDA SR Legacy values) + home-cooked/regional dishes whose values come from
 * their USDA ingredients by cooked weight (SYSTEMS.md §2.7) — transparent, not guessed.
 */
export const curatedFoods: FoodItem[] = (() => {
  const base = new Map(foodsFile.foods.map((f) => [f.id, f]));
  const out: FoodItem[] = foodsFile.foods.map((f) => ({
    id: f.id, name: f.name, group: f.group, per100: f.per100, servings: f.servings, source: 'usda', verified: true, popularity: 0.6,
  }));
  for (const r of foodsFile.recipes) {
    const total: Required<Per100> = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    for (const ing of r.ingredients) {
      const f = base.get(ing.food);
      if (!f) throw new Error(`recipe ${r.id}: unknown ingredient ${ing.food}`);
      for (const k of Object.keys(total) as (keyof Per100)[]) total[k] += ((f.per100[k] ?? 0) * ing.grams) / 100;
    }
    const per100 = Object.fromEntries(
      (Object.keys(total) as (keyof Per100)[]).map((k) => [k, Math.round((total[k] / r.cookedWeightG) * 1000) / 10]),
    ) as Required<Per100>;
    out.push({ id: r.id, name: r.name, group: r.group, per100, servings: r.servings, source: 'recipe', verified: true, popularity: 0.3 });
  }
  return out;
})();
export const curatedFoodById = new Map(curatedFoods.map((f) => [f.id, f]));
/** How many curated foods have been confirmed against USDA (the rest await `verify-foods.mjs`). */
export const foodsChecked = { checked: foodsFile.foods.filter((f) => f.checkedAt).length, total: foodsFile.foods.length };

/** Fills `{key}` placeholders in a notification template. */
export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
export * from './off';
export * from './trainer';
