import { z } from 'zod';
import { FatPreference, Goal, Lifestyle, NutritionMode } from './common';

/** SYSTEMS.md §2 — nutrition ("Mana"). */
export const Meal = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type Meal = z.infer<typeof Meal>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const FoodPer100 = z.object({
  kcal: z.number().min(0).max(902),
  protein: z.number().min(0).max(100),
  carbs: z.number().min(0).max(100),
  fat: z.number().min(0).max(100),
  fiber: z.number().min(0).max(100).optional(),
  /** grams of alcohol (7 kcal/g) — beer, wine, spirits */
  alcohol: z.number().min(0).max(100).optional(),
});
export type FoodPer100 = z.infer<typeof FoodPer100>;

export const FoodDto = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  brand: z.string().max(80).nullable().optional(),
  per100: FoodPer100,
  servings: z.array(z.object({ label: z.string().min(1).max(40), grams: z.number().positive().max(2000) })).max(12),
  source: z.enum(['usda', 'recipe', 'off', 'custom', 'quick']),
  verified: z.boolean(),
  barcode: z.string().max(32).nullable().optional(),
});
export type FoodDto = z.infer<typeof FoodDto>;

/** The client sends a snapshot of the food; the server trusts curated ids from content and stores the rest. */
export const FoodLogInput = z.object({
  id: z.uuid(),
  food: FoodDto,
  grams: z.number().positive().max(5000),
  meal: Meal,
  servingLabel: z.string().max(40).nullable().optional(),
  localDate: isoDate,
  loggedAt: z.iso.datetime({ offset: true }),
});
export type FoodLogInput = z.infer<typeof FoodLogInput>;

export const FoodLogPatch = z.object({
  grams: z.number().positive().max(5000).optional(),
  meal: Meal.optional(),
  servingLabel: z.string().max(40).nullable().optional(),
});
export type FoodLogPatch = z.infer<typeof FoodLogPatch>;

export const FoodLogDto = FoodLogInput.omit({ id: true }).extend({ id: z.string() });
export type FoodLogDto = z.infer<typeof FoodLogDto>;

/** copyId = client-generated idempotency key: a retried copy derives the same row ids and adds nothing twice. */
export const CopyInput = z.object({ fromDate: isoDate, toDate: isoDate, meal: Meal.optional(), copyId: z.uuid().optional() });
export type CopyInput = z.infer<typeof CopyInput>;

export const WeighInInput = z.object({
  id: z.uuid(),
  weightKg: z.number().min(30).max(300),
  localDate: isoDate,
  measuredAt: z.iso.datetime({ offset: true }),
});
export type WeighInInput = z.infer<typeof WeighInInput>;

export const DayFlagsInput = z.object({
  localDate: isoDate,
  waterMl: z.number().int().min(0).max(10_000).optional(),
  markedComplete: z.boolean().optional(),
  /** "Was this a full day?" — confirms a complete day under 800 kcal is real so it counts (SYSTEMS.md §2.3) */
  lowDayConfirm: z.boolean().optional(),
});
export type DayFlagsInput = z.infer<typeof DayFlagsInput>;

/** Everything the user can change about nutrition at any time (SYSTEMS.md §2.10). */
export const NutritionSettings = z.object({
  goal: Goal,
  /** fraction of bodyweight per week (−0.005 = −0.5%/week); must be one the engine allows */
  ratePerWeek: z.number().min(-0.01).max(0.005),
  fatPreference: FatPreference,
  lifestyle: Lifestyle,
  nutritionMode: NutritionMode,
  bodyFatPct: z.number().min(3).max(60).nullable(),
  /** 0 = Sunday … 6 = Saturday */
  checkInDay: z.number().int().min(0).max(6),
  hideCalories: z.boolean(),
  /** manual macro override (§2.5): carbs fill the rest */
  proteinOverrideG: z.number().min(40).max(400).nullable(),
  fatOverrideG: z.number().min(20).max(250).nullable(),
});
export type NutritionSettings = z.infer<typeof NutritionSettings>;

export const MacroTargets = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  carbsG: z.number(),
  fiberG: z.number(),
  waterMl: z.number(),
});
export type MacroTargets = z.infer<typeof MacroTargets>;

export const NutritionPlanDto = MacroTargets.extend({
  tdee: z.number(),
  prior: z.number(),
  bmr: z.number(),
  trendKg: z.number(),
  confidence: z.number(),
  calibrating: z.boolean(),
  validDays: z.number().int(),
  rails: z.array(z.string()),
  /** the date these weekly targets took effect */
  effectiveFrom: isoDate,
  /** §2.8 safety rule fired: 3 of the last 7 days very low → supportive check-in, deficit increases paused */
  lowIntake: z.boolean().default(false),
});
export type NutritionPlanDto = z.infer<typeof NutritionPlanDto>;

export const Totals = z.object({ kcal: z.number(), protein: z.number(), carbs: z.number(), fat: z.number(), fiber: z.number() });
export type Totals = z.infer<typeof Totals>;

export const NutritionDayResponse = z.object({
  date: isoDate,
  logs: z.array(FoodLogDto),
  waterMl: z.number().int(),
  markedComplete: z.boolean(),
  /** the user confirmed this (complete, < 800 kcal) day was a full day */
  lowDayConfirm: z.boolean().default(false),
  totals: Totals,
  plan: NutritionPlanDto,
  settings: NutritionSettings,
});
export type NutritionDayResponse = z.infer<typeof NutritionDayResponse>;

export const CheckInDto = z.object({
  verdict: z.enum(['insufficient', 'onTrack', 'faster', 'slower']),
  validDays: z.number().int(),
  observedKgPerWeek: z.number().nullable(),
  goalKgPerWeek: z.number(),
  message: z.string(),
});
export type CheckInDto = z.infer<typeof CheckInDto>;

export const NutritionSummaryResponse = z.object({
  plan: NutritionPlanDto,
  settings: NutritionSettings,
  weighIns: z.array(z.object({ id: z.string(), date: isoDate, kg: z.number(), trend: z.number() })),
  checkIn: CheckInDto,
  /** rates the UI may offer for the current goal (engine `allowedRates`) */
  allowedRates: z.array(z.number()),
});
export type NutritionSummaryResponse = z.infer<typeof NutritionSummaryResponse>;

export const FoodSearchResponse = z.object({ foods: z.array(FoodDto) });
export type FoodSearchResponse = z.infer<typeof FoodSearchResponse>;

/** Defaults for a goal (SYSTEMS.md §2.4): cut −0.5%/wk, lean bulk +0.1%/wk. */
export const defaultRate = (goal: z.infer<typeof Goal>) => (goal === 'cut' ? -0.005 : goal === 'bulk' ? 0.001 : 0);
