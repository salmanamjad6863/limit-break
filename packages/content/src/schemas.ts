import { FeatureMatrix, HeroClass } from '@lb/contracts';
import { z } from 'zod';

export const RestType = z.enum(['mainCompound', 'secondaryCompound', 'accessory', 'isolation']);

export const Exercise = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  pattern: z.string(),
  /** every item required */
  equipment: z.array(z.string()),
  /** at least one required (e.g. dumbbells OR kettlebell) */
  anyOf: z.array(z.string()).optional(),
  primary: z.array(z.string()).min(1),
  secondary: z.array(z.string()),
  difficulty: z.number().int().min(1).max(5),
  bwFactor: z.number().min(0).max(1.2),
  restType: RestType,
  kind: z.enum(['reps', 'time']).default('reps'),
  loadType: z.enum(['barbell', 'dumbbell', 'kettlebell', 'machine', 'band', 'bodyweight', 'none']).default('bodyweight'),
  unilateral: z.boolean().optional(),
  /** injury tags this exercise should be avoided with */
  avoid: z.array(z.string()).optional(),
  cues: z.array(z.string()).default([]),
  mistakes: z.array(z.string()).default([]),
  timed: z.boolean().optional(),
  /** ">"-separated chain of exercise ids, easiest → hardest */
  progression: z.string().optional(),
});
export type Exercise = z.infer<typeof Exercise>;

export const Hero = z.object({
  id: z.string(),
  name: z.string(),
  epithet: z.string(),
  heroClass: HeroClass,
  accent: z.string().regex(/^#[0-9A-F]{6}$/i),
});
export type Hero = z.infer<typeof Hero>;

/** Avatar Forge catalog (VISUALS.md §7 / docs/AVATAR.md). Procedural `shape` until PNG layers ship. */
export const CosmeticSlot = z.enum(['body', 'hair', 'outfit', 'accessory', 'aura', 'prop', 'frame']);
export type CosmeticSlot = z.infer<typeof CosmeticSlot>;

export const CosmeticRarity = z.enum(['common', 'rare', 'epic', 'legendary']);
export type CosmeticRarity = z.infer<typeof CosmeticRarity>;

export const Cosmetic = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  slot: CosmeticSlot,
  name: z.string().min(1).max(60),
  rarity: CosmeticRarity,
  /** Essence price; 0 = free unlock when owned/granted */
  price: z.number().int().min(0).max(10_000),
  free: z.boolean(),
  tint: z.string().regex(/^#[0-9A-F]{6}$/i),
  shape: z.enum(['body', 'hair', 'outfit', 'accessory', 'aura', 'prop', 'frame']),
  rankLock: z.enum(['E', 'D', 'C', 'B', 'A', 'S']).nullable(),
  classLock: HeroClass.nullable(),
});
export type Cosmetic = z.infer<typeof Cosmetic>;


export const Notifications = z.record(z.string(), z.string());
export { FeatureMatrix };

const Anchors = z
  .object({
    anchors: z.array(z.object({ percentile: z.number().min(0).max(100), value: z.number() })).min(2),
    lowerIsBetter: z.boolean().optional(),
  })
  .refine(
    (n) =>
      n.anchors.every(
        (x, i) =>
          i === 0 ||
          (x.percentile > n.anchors[i - 1]!.percentile &&
            (n.lowerIsBetter ? x.value <= n.anchors[i - 1]!.value : x.value >= n.anchors[i - 1]!.value)),
      ),
    'percentiles must ascend; values must ascend (or descend when lowerIsBetter)',
  );
const BySex = z.object({ male: Anchors, female: Anchors });
export const AssessmentNorms = z.object({
  pushups: BySex,
  plankSec: BySex,
  squats60: BySex,
  run2400Sec: BySex,
  strengthRatio: z.record(z.string(), BySex),
  calisthenicsLevel: Anchors,
});

export const TrialEventDef = z.object({
  id: z.enum(['pushups', 'lift', 'plankSec', 'squats60', 'run2400Sec']),
  name: z.string(),
  stat: z.enum(['STR', 'END', 'AGI']),
  input: z.enum(['count', 'history', 'stopwatch', 'countdown60', 'time']),
  unit: z.string(),
  settings: z.array(z.enum(['HOME', 'GYM'])).min(1),
  optionalBelow: z.enum(['D', 'C', 'B', 'A', 'S']).optional(),
  how: z.string(),
  standards: z.array(z.string()).min(1),
});
export type TrialEventDef = z.infer<typeof TrialEventDef>;
export const TrialsConfig = z.object({ restBetweenEventsSec: z.number().int(), events: z.array(TrialEventDef).min(3) });

export const WorkoutType = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  /** Ionicons name */
  icon: z.string(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i),
  summary: z.string(),
  minutes: z.tuple([z.number().int(), z.number().int()]),
  intensity: z.number().int().min(1).max(5),
  settings: z.array(z.enum(['HOME', 'GYM', 'HYBRID'])),
});
export type WorkoutType = z.infer<typeof WorkoutType>;

export const SlotRole = z.enum(['main', 'secondary', 'accessory', 'core', 'finisher']);
export const ProgramSlot = z
  .object({
    pattern: z.string(),
    fallback: z.array(z.string()).optional(),
    role: SlotRole,
    sets: z.number().int().min(1).max(10),
    reps: z.tuple([z.number().int(), z.number().int()]).optional(),
    seconds: z.tuple([z.number().int(), z.number().int()]).optional(),
    rir: z.number().int().min(0).max(5),
    prefer: z.array(z.string()).optional(),
    optional: z.boolean().optional(),
  })
  .refine((s) => !!s.reps !== !!s.seconds, 'a slot needs exactly one of reps or seconds');

export const ProgramTemplate = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  typeId: z.string(),
  summary: z.string(),
  levels: z.array(z.enum(['beginner', 'novice', 'intermediate', 'advanced', 'pro'])).min(1),
  locations: z.array(z.enum(['HOME', 'GYM', 'HYBRID'])).min(1),
  goals: z.array(z.enum(['cut', 'maintain', 'recomp', 'bulk'])).min(1),
  daysPerWeek: z.array(z.number().int().min(2).max(6)).min(1),
  blockWeeks: z.number().int().min(3).max(12),
  deloadEvery: z.number().int().min(3).max(12),
  days: z
    .array(z.object({ id: z.string(), name: z.string(), focus: z.enum(['upper', 'lower', 'full']), slots: z.array(ProgramSlot).min(3) }))
    .min(1),
});
export type ProgramTemplate = z.infer<typeof ProgramTemplate>;

export const QuickSession = z.object({
  id: z.string(),
  name: z.string(),
  typeId: z.string(),
  summary: z.string(),
  rpe: z.number().min(1).max(10),
  work: z.number().int().min(5),
  rest: z.number().int().min(0),
  rounds: z.number().int().min(1),
  moves: z.array(z.string()).min(1),
});
export type QuickSession = z.infer<typeof QuickSession>;

export const SideQuest = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  /** Ionicons name */
  icon: z.string(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i),
  /** manual = honest check-off; auto:* = verified from logged data */
  verify: z.union([z.literal('manual'), z.literal('auto:program-workout'), z.string().regex(/^auto:quick:[a-z0-9-]+$/)]),
  upgrade: z.string().optional(),
});
export type SideQuest = z.infer<typeof SideQuest>;

/** One exercise's demo media (VISUALS.md §2.1, §3.2). Paths are Storage/CDN keys; absent = not produced yet. */
export const ExerciseMediaEntry = z.object({
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** animated WebP loop, front three-quarter */
  loop: z.string().optional(),
  side: z.string().optional(),
  thumb: z.string().optional(),
  trainer: z.array(z.enum(['a', 'b'])).optional(),
  cueMarks: z.array(z.object({ at: z.number().min(0), cue: z.number().int().min(0) })).optional(),
  approvedBy: z.string().optional(),
  /** where the motion came from, for the licence log (VISUALS.md §3.3, §10) */
  source: z.enum(['mixamo', 'rokoko-vision', 'mocap', 'hand-keyed']).optional(),
});
export type ExerciseMediaEntry = z.infer<typeof ExerciseMediaEntry>;

export const FlowStep = z.object({
  exerciseId: z.string(),
  seconds: z.number().int().min(10).max(300),
  perSide: z.boolean().optional(),
  optional: z.boolean().optional(),
});
const FocusFlows = z.object({ upper: z.array(FlowStep), lower: z.array(FlowStep), full: z.array(FlowStep) });
export const Flows = z.object({ warmup: FocusFlows, cooldown: FocusFlows, safeSwaps: z.array(z.string()).min(1) });
export type Flows = z.infer<typeof Flows>;

/* ---------------- Nutrition: curated foods (SYSTEMS.md §2.10) ---------------- */
export const Per100 = z.object({
  kcal: z.number().min(0).max(902),
  protein: z.number().min(0).max(100),
  carbs: z.number().min(0).max(100),
  fat: z.number().min(0).max(100),
  fiber: z.number().min(0).max(100).optional(),
});
export type Per100 = z.infer<typeof Per100>;

export const Serving = z.object({ label: z.string().min(1), grams: z.number().positive() });
export type Serving = z.infer<typeof Serving>;

export const FoodGroup = z.enum(['protein', 'dairy', 'legumes', 'grains', 'fruit', 'veg', 'fats', 'drinks', 'sweets', 'meals']);

export const CuratedFood = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  group: FoodGroup,
  per100: Per100,
  servings: z.array(Serving).min(1),
  /** exact USDA SR Legacy description, for the verifier (scripts/verify-foods.mjs) */
  usda: z.string(),
  fdcId: z.number().int().optional(),
  /** date the values were last confirmed against USDA */
  checkedAt: z.string().optional(),
});

export const CuratedRecipe = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  group: FoodGroup,
  ingredients: z.array(z.object({ food: z.string(), grams: z.number().positive() })).min(1),
  cookedWeightG: z.number().positive(),
  servings: z.array(Serving).min(1),
});

export const FoodsFile = z.object({ foods: z.array(CuratedFood), recipes: z.array(CuratedRecipe) });

/** What the app searches and logs: one shape for curated, recipe, barcode and custom foods. */
export interface FoodItem {
  id: string;
  name: string;
  brand?: string | null;
  group?: z.infer<typeof FoodGroup>;
  per100: Per100;
  servings: Serving[];
  source: 'usda' | 'recipe' | 'off' | 'custom' | 'quick';
  verified: boolean;
  barcode?: string | null;
  /** 0–1 search prior: staples above mixed dishes (SYSTEMS.md §2.7 globalPopularity) */
  popularity?: number;
}
