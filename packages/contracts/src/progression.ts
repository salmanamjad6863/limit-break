import { z } from 'zod';
import { Rank } from './common';

export const StatKey = z.enum(['STR', 'AGI', 'END', 'VIT', 'SPI']);
export const FitnessTests = z.object({
  pushups: z.number().int().min(0).max(200).nullable().optional(),
  plankSec: z.number().int().min(0).max(1800).nullable().optional(),
  squats60: z.number().int().min(0).max(150).nullable().optional(),
  run2400Sec: z.number().int().min(240).max(3600).nullable().optional(),
});
export type FitnessTests = z.infer<typeof FitnessTests>;

export const TrialAttemptInput = z.object({
  id: z.uuid(),
  setting: z.enum(['HOME', 'GYM']),
  results: FitnessTests,
});
export type TrialAttemptInput = z.infer<typeof TrialAttemptInput>;

export const ScoredEvent = z.object({
  id: z.string(),
  stat: z.enum(['STR', 'END', 'AGI']),
  raw: z.number(),
  percentile: z.number(),
  note: z.string().optional(),
});

export const TrialAttemptResponse = z.object({
  attemptId: z.string(),
  target: Rank,
  passed: z.boolean(),
  composite: z.number(),
  required: z.object({ composite: z.number(), minEvent: z.number() }),
  events: z.array(ScoredEvent),
  reasons: z.array(z.string()),
  retryAt: z.string().nullable(),
  rewards: z.array(z.any()),
  duplicate: z.boolean(),
});
export type TrialAttemptResponse = z.infer<typeof TrialAttemptResponse>;

export const TrialStatusDto = z.object({
  target: Rank.nullable(),
  levelRequired: z.number().nullable(),
  eligible: z.boolean(),
  reason: z.enum(['max-rank', 'level', 'cooldown', 'ready']),
  retryAt: z.string().nullable(),
  runRequired: z.boolean(),
});

export const ProgressionResponse = z.object({
  stats: z.record(StatKey, z.number()),
  sources: z.record(StatKey, z.enum(['measured', 'estimated'])),
  details: z.record(StatKey, z.string()),
  trial: TrialStatusDto,
  attempts: z.array(z.object({
    id: z.string(), target: Rank, at: z.string(), passed: z.boolean(), composite: z.number(),
    /** A/S passes need verification to appear on leaderboards (SYSTEMS.md §4.4) */
    verification: z.enum(['none', 'required', 'pending', 'verified', 'rejected']).default('none'),
    reviewNote: z.string().nullable().default(null),
  })),
  xpByDay: z.array(z.object({ date: z.string(), xp: z.number() })),
  prs: z.array(z.object({ exerciseId: z.string(), e1rmKg: z.number(), at: z.string() })),
});
export type ProgressionResponse = z.infer<typeof ProgressionResponse>;

/* ---------------- A/S trial verification (SYSTEMS.md §4.4) ---------------- */
export const VerificationStatus = z.enum(['none', 'required', 'pending', 'verified', 'rejected']);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

/** Signed, one-time upload target for the trial video (private bucket; never proxied by the API). */
export const VerificationUploadResponse = z.object({ uploadUrl: z.string(), videoKey: z.string(), maxBytes: z.number().int() });
export type VerificationUploadResponse = z.infer<typeof VerificationUploadResponse>;

export const SubmitVerificationInput = z.object({ videoKey: z.string().min(1).max(200) });

export const ReviewInput = z.object({ decision: z.enum(['verified', 'rejected']), note: z.string().max(300).nullable() });
export type ReviewInput = z.infer<typeof ReviewInput>;

export const PendingReview = z.object({ attemptId: z.string(), userId: z.string(), target: Rank, composite: z.number(), videoUrl: z.string().nullable(), submittedAt: z.string() });
export type PendingReview = z.infer<typeof PendingReview>;
