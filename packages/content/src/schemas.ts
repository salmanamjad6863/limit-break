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

export const Notifications = z.record(z.string(), z.string());
export { FeatureMatrix };

const Anchors = z.object({
  anchors: z
    .array(z.object({ percentile: z.number().min(0).max(100), value: z.number() }))
    .min(2)
    .refine((a) => a.every((x, i) => i === 0 || (x.percentile > a[i - 1]!.percentile && x.value >= a[i - 1]!.value)), 'anchors must ascend'),
  lowerIsBetter: z.boolean().optional(),
});
const BySex = z.object({ male: Anchors, female: Anchors });
export const AssessmentNorms = z.object({ pushups: BySex, plankSec: BySex, squats60: BySex });

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
  levels: z.array(z.enum(['beginner', 'novice', 'intermediate', 'advanced'])).min(1),
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
