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
  /** SYSTEMS.md §3.11: drop sets and sets taken to failure are logged as such */
  setType: z.enum(['normal', 'drop', 'failure']).default('normal'),
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
  kind: z.enum(['program', 'quick']).default('program'),
  name: z.string().max(80).nullable().default(null),
  notes: z.string().max(1000).nullable().default(null),
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

/* ---------------- Sprint 5.5: schedule, history, edits, manual logs (SYSTEMS.md §3.10–3.11) ---------------- */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:mm');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Everything about training the user can change at any time (Training settings screen). */
export const TrainingSettingsInput = z.object({
  experience: z.enum(['beginner', 'novice', 'intermediate', 'advanced', 'pro']),
  location: z.enum(['HOME', 'GYM', 'HYBRID']),
  equipment: z.array(z.string()).max(50),
  injuries: z.array(z.string()).max(20),
  sessionMinutes: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(75), z.literal(90)]),
  /** 0 = Sunday … 6 = Saturday; 2–6 training days */
  weekdays: z.array(z.number().int().min(0).max(6)).min(2).max(6).refine((w) => new Set(w).size === w.length, 'duplicate weekday'),
  /** when you usually train; reminders fire 30 min before. null = no reminders */
  workoutTime: hhmm.nullable(),
  /** set once by profiles created before male/female became required; optional otherwise */
  sex: z.enum(['male', 'female']).optional(),
});
export type TrainingSettingsInput = z.infer<typeof TrainingSettingsInput>;

export const WorkoutSource = z.enum(['app', 'manual']);

export const WorkoutSummaryDto = z.object({
  id: z.string(),
  date: isoDate,
  name: z.string(),
  kind: z.enum(['program', 'quick', 'manual']),
  source: WorkoutSource,
  minutes: z.number(),
  workingSets: z.number().int(),
  volumeKg: z.number(),
  xp: z.number().int(),
  prs: z.array(z.object({ exerciseId: z.string(), e1rmKg: z.number() })),
  notes: z.string().nullable(),
  /** editable/deletable for 7 days (leaderboard integrity) */
  editableUntil: isoDate,
  /** program rotation (quick sessions: the quick-session id in dayId) */
  programId: z.string().nullable().optional(),
  dayId: z.string().nullable().optional(),
});
export type WorkoutSummaryDto = z.infer<typeof WorkoutSummaryDto>;

export const WorkoutDetailDto = WorkoutSummaryDto.extend({
  sessionRpe: z.number().nullable(),
  sets: z.array(LoggedSetInput.extend({ id: z.string() })),
});
export type WorkoutDetailDto = z.infer<typeof WorkoutDetailDto>;

export const WorkoutListResponse = z.object({ workouts: z.array(WorkoutSummaryDto) });
export type WorkoutListResponse = z.infer<typeof WorkoutListResponse>;

/** Full replacement of the sets + notes; the server recomputes PRs, stats and XP as a diff. */
export const EditWorkoutInput = z.object({
  /** client-generated id of this edit = idempotency key for the XP adjustment */
  editId: z.uuid(),
  sets: z.array(LoggedSetInput).max(200),
  notes: z.string().max(1000).nullable(),
  sessionRpe: z.number().min(1).max(10).nullable(),
});
export type EditWorkoutInput = z.infer<typeof EditWorkoutInput>;

export const EditWorkoutResponse = z.object({ xp: z.number().int(), delta: z.number().int(), totalXp: z.number().int(), level: z.number().int() });
export type EditWorkoutResponse = z.infer<typeof EditWorkoutResponse>;

/** Training done without the app. Counts for personal XP and streaks, never for leaderboards. */
export const ManualWorkoutInput = z.object({
  id: z.uuid(),
  type: z.enum(['strength', 'cardio', 'sport', 'class', 'other']),
  name: z.string().trim().min(2).max(60),
  minutes: z.number().int().min(5).max(300),
  rpe: z.number().int().min(1).max(10),
  localDate: isoDate,
  distanceKm: z.number().min(0).max(300).nullable(),
  notes: z.string().max(1000).nullable(),
});
export type ManualWorkoutInput = z.infer<typeof ManualWorkoutInput>;

export const ExerciseNoteInput = z.object({ note: z.string().max(300) });
export const ExerciseNotesResponse = z.object({ notes: z.record(z.string(), z.string()) });
export type ExerciseNotesResponse = z.infer<typeof ExerciseNotesResponse>;

/**
 * Everything the on-device training state needs, restored after signing in on a new phone
 * (the player's defaults, the program rotation, notes and pain flags).
 */
/* ---------------- own weekly routines ---------------- */

const range = z.tuple([z.number().int().min(1).max(600), z.number().int().min(1).max(600)]).refine(([lo, hi]) => lo <= hi, 'low > high');
export const RoutineSlotDto = z
  .object({
    exerciseId: z.string().min(1).max(80),
    sets: z.number().int().min(1).max(10),
    reps: range.optional(),
    seconds: range.optional(),
    rir: z.number().int().min(0).max(5),
    restSeconds: z.number().int().min(10).max(600).optional(),
    superset: z.string().regex(/^[A-Z]$/).nullable().optional(),
  })
  .refine((s) => !!s.reps !== !!s.seconds, 'a slot needs exactly one of reps or seconds');
export const RoutineDayDto = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().trim().min(1).max(40),
  slots: z.array(RoutineSlotDto).min(1).max(20),
});
export const RoutineDto = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(40),
    days: z.array(RoutineDayDto).min(1).max(7),
    /** weekday "0" (Sunday) … "6" → day id */
    schedule: z.record(z.string().regex(/^[0-6]$/), z.string()),
    updatedAt: z.iso.datetime(),
  })
  .refine((r) => new Set(r.days.map((d) => d.id)).size === r.days.length, 'duplicate day id')
  .refine((r) => Object.values(r.schedule).every((id) => r.days.some((d) => d.id === id)), 'schedule names an unknown day')
  .refine((r) => Object.keys(r.schedule).length > 0, 'put at least one day on the week');
export type RoutineDto = z.infer<typeof RoutineDto>;
/** PUT /workouts/routines/:id — the id comes from the path */
export const RoutineInput = RoutineDto;
export type RoutineInput = z.infer<typeof RoutineInput>;

export const TrainingStateResponse = z.object({
  activeProgramId: z.string().nullable(),
  /** program sessions finished since the program was picked → which day is next */
  completedSessions: z.number().int(),
  /** most recent workouts (newest first) */
  recent: z.array(WorkoutSummaryDto),
  /** best e1RM per exercise (kg) */
  bestE1rm: z.record(z.string(), z.number()),
  /** last working set per exercise, to pre-fill the logger */
  lastSet: z.record(z.string(), z.object({ reps: z.number().nullable(), loadKg: z.number().nullable() })),
  avoid: z.array(z.string()),
  notes: z.record(z.string(), z.string()),
  /** the hunter's own weekly routines */
  routines: z.array(RoutineDto),
});
export type TrainingStateResponse = z.infer<typeof TrainingStateResponse>;

export const ActiveProgramInput = z.object({ programId: z.string().min(1).max(60) });
export type ActiveProgramInput = z.infer<typeof ActiveProgramInput>;

export const AvoidExerciseInput = z.object({ exerciseId: z.string().min(1).max(80), avoid: z.boolean() });
export type AvoidExerciseInput = z.infer<typeof AvoidExerciseInput>;
