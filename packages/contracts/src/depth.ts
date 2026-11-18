/** Sprint 11 depth features (SYSTEMS.md §6): measurements, private progress photos, meal templates, weekly debrief. */
import { z } from 'zod';
import { IsoDate, IsoDateTime, Uuid } from './common';

/* ---------------- Measurements ---------------- */

/** Upsert by id. At least one measurement is required. Extra fields (e.g. a note) are ignored. */
export const MeasurementInput = z
  .object({
    id: Uuid,
    localDate: IsoDate,
    waistCm: z.number().min(30).max(250).optional(),
    chestCm: z.number().min(40).max(250).optional(),
    armCm: z.number().min(10).max(80).optional(),
    hipCm: z.number().min(40).max(250).optional(),
  })
  .refine((m) => m.waistCm != null || m.chestCm != null || m.armCm != null || m.hipCm != null, { message: 'at least one measurement is required' });
export type MeasurementInput = z.infer<typeof MeasurementInput>;

export const MeasurementDto = z.object({
  id: z.string(),
  localDate: IsoDate,
  measuredAt: IsoDateTime,
  weightKg: z.number().nullable(),
  waistCm: z.number().nullable(),
  chestCm: z.number().nullable(),
  armCm: z.number().nullable(),
  hipCm: z.number().nullable(),
});
export type MeasurementDto = z.infer<typeof MeasurementDto>;

export const MeasurementPoint = z.object({ localDate: IsoDate, value: z.number() });
export type MeasurementPoint = z.infer<typeof MeasurementPoint>;

/** Last 90 days, oldest first, plus one trend series per metric. */
export const MeasurementsResponse = z.object({
  measurements: z.array(MeasurementDto),
  series: z.object({
    waist: z.array(MeasurementPoint),
    chest: z.array(MeasurementPoint),
    arm: z.array(MeasurementPoint),
    weight: z.array(MeasurementPoint),
  }),
});
export type MeasurementsResponse = z.infer<typeof MeasurementsResponse>;

/* ---------------- Progress photos (private) ---------------- */

export const ProgressPhotoKind = z.enum(['before', 'after', 'progress']);
export type ProgressPhotoKind = z.infer<typeof ProgressPhotoKind>;

export const SignProgressPhotoInput = z.object({ id: Uuid });
export type SignProgressPhotoInput = z.infer<typeof SignProgressPhotoInput>;

export const SignProgressPhotoResponse = z.object({
  id: z.string(),
  uploadUrl: z.string(),
  /** progress/{userId}/{id}.jpg */
  storageKey: z.string(),
  maxBytes: z.number(),
});
export type SignProgressPhotoResponse = z.infer<typeof SignProgressPhotoResponse>;

export const CreateProgressPhotoInput = z.object({
  id: Uuid,
  localDate: IsoDate,
  takenAt: IsoDateTime.optional(),
  kind: ProgressPhotoKind,
  storageKey: z.string().min(1).max(200),
  width: z.number().int().min(1).max(20_000),
  height: z.number().int().min(1).max(20_000),
  note: z.string().max(200).nullable().optional(),
});
export type CreateProgressPhotoInput = z.infer<typeof CreateProgressPhotoInput>;

export const ProgressPhotoDto = z.object({
  id: z.string(),
  localDate: IsoDate,
  takenAt: IsoDateTime,
  kind: ProgressPhotoKind,
  width: z.number(),
  height: z.number(),
  note: z.string().nullable(),
  /** short-lived signed read URL; null when storage is unavailable */
  url: z.string().nullable(),
});
export type ProgressPhotoDto = z.infer<typeof ProgressPhotoDto>;

export const ProgressPhotosResponse = z.object({ photos: z.array(ProgressPhotoDto) });
export type ProgressPhotosResponse = z.infer<typeof ProgressPhotosResponse>;

/** Side-by-side "Awakening" view. `tagged` = earliest before + latest after; `progress` = two latest progress shots (older = before). */
export const AwakeningPairDto = z.object({
  before: ProgressPhotoDto.nullable(),
  after: ProgressPhotoDto.nullable(),
  source: z.enum(['tagged', 'progress', 'incomplete']),
});
export type AwakeningPairDto = z.infer<typeof AwakeningPairDto>;

/* ---------------- Meal templates ---------------- */

export const TemplateMeal = z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']);
export type TemplateMeal = z.infer<typeof TemplateMeal>;

export const MealTemplateItem = z.object({
  foodId: z.string().min(1).max(120),
  grams: z.number().positive().max(5000),
  servingLabel: z.string().max(40).nullable().optional(),
});
export type MealTemplateItem = z.infer<typeof MealTemplateItem>;

export const UpsertMealTemplateInput = z.object({
  id: Uuid,
  name: z.string().trim().min(1).max(60),
  meal: TemplateMeal,
  items: z.array(MealTemplateItem).min(1).max(30),
});
export type UpsertMealTemplateInput = z.infer<typeof UpsertMealTemplateInput>;

export const MealTemplateDto = z.object({
  id: z.string(),
  name: z.string(),
  meal: TemplateMeal,
  items: z.array(MealTemplateItem),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type MealTemplateDto = z.infer<typeof MealTemplateDto>;

/** applyId = client idempotency key: a retried apply derives the same FoodLog ids and adds nothing twice. */
export const ApplyMealTemplateInput = z.object({ toDate: IsoDate, applyId: Uuid });
export type ApplyMealTemplateInput = z.infer<typeof ApplyMealTemplateInput>;

export const ApplyMealTemplateResponse = z.object({ applied: z.number(), created: z.number() });
export type ApplyMealTemplateResponse = z.infer<typeof ApplyMealTemplateResponse>;

/* ---------------- Weekly debrief (private) ---------------- */

export const DebriefMetrics = z.object({
  weekStart: IsoDate,
  weekEnd: IsoDate,
  workouts: z.number(),
  xp: z.number(),
  /** days on which every daily quest was completed */
  questDays: z.number(),
  streak: z.number(),
  prs: z.number(),
  nutritionDaysLogged: z.number(),
  /** % of logged days within ±15% of the kcal target; null without a target or logs. Never shown publicly. */
  nutritionAdherencePct: z.number().nullable(),
});
export type DebriefMetrics = z.infer<typeof DebriefMetrics>;

export const WeeklyDebriefDto = z.object({
  weekStart: IsoDate,
  body: z.string(),
  metrics: DebriefMetrics,
  createdAt: IsoDateTime,
});
export type WeeklyDebriefDto = z.infer<typeof WeeklyDebriefDto>;

export const GenerateDebriefInput = z.object({ weekStart: IsoDate.optional() });
export type GenerateDebriefInput = z.infer<typeof GenerateDebriefInput>;
