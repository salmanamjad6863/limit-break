import { z } from 'zod';

export const LoggedSetInput = z.object({
  id: z.uuid(),
  exerciseId: z.string(),
  order: z.number().int().min(0),
  reps: z.number().int().min(0).max(1000).nullable(),
  weightKg: z.number().min(0).max(1000).nullable(),
  rir: z.number().int().min(0).max(10).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
  durationS: z.number().int().min(0).nullable(),
  distanceM: z.number().min(0).nullable(),
  isWarmup: z.boolean(),
  completedAt: z.iso.datetime({ offset: true }),
});
export type LoggedSetInput = z.infer<typeof LoggedSetInput>;

/** One mutation when the user taps "Finish" — id doubles as the idempotency key. */
export const FinishWorkoutInput = z.object({
  id: z.uuid(),
  plannedWorkoutId: z.string().nullable(),
  programId: z.string().nullable(),
  dayId: z.string().nullable(),
  sessionRpe: z.number().min(1).max(10).nullable(),
  /** interval / cardio work for XP (quick sessions) */
  cardio: z.array(z.object({ minutes: z.number().min(0).max(300), rpe: z.number().min(1).max(10) })).max(10).default([]),
  startedAt: z.iso.datetime({ offset: true }),
  finishedAt: z.iso.datetime({ offset: true }),
  plannedHardSets: z.number().int().min(0),
  sets: z.array(LoggedSetInput).max(200),
});
export type FinishWorkoutInput = z.infer<typeof FinishWorkoutInput>;

export const FinishWorkoutResponse = z.object({
  workoutId: z.string(),
  granted: z.number().int(),
  totalXp: z.number().int(),
  level: z.number().int(),
  prs: z.array(z.object({ exerciseId: z.string(), e1rmKg: z.number() })),
  rewards: z.array(z.any()),
  duplicate: z.boolean(),
});
export type FinishWorkoutResponse = z.infer<typeof FinishWorkoutResponse>;
