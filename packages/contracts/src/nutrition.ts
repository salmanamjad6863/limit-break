import { z } from 'zod';

export const Meal = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);

export const FoodLogInput = z.object({
  id: z.uuid(),
  foodId: z.string(),
  grams: z.number().positive().max(5000),
  meal: Meal,
  loggedAt: z.iso.datetime({ offset: true }),
});
export type FoodLogInput = z.infer<typeof FoodLogInput>;

export const WeighInInput = z.object({
  id: z.uuid(),
  weightKg: z.number().min(30).max(300),
  measuredAt: z.iso.datetime({ offset: true }),
});
export type WeighInInput = z.infer<typeof WeighInInput>;

export const MacroTargets = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  carbsG: z.number(),
  fiberG: z.number(),
  waterMl: z.number(),
});
export type MacroTargets = z.infer<typeof MacroTargets>;
