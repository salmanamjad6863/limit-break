import { z } from 'zod';
import { NutritionSettings } from './nutrition';

/** Bump when the privacy policy or terms change materially: users re-consent. */
export const CONSENT_VERSION = '2026-11';

export const NutritionProfile = NutritionSettings.extend({ birthDate: z.iso.date() });
export type NutritionProfile = z.infer<typeof NutritionProfile>;
import {
  Experience, FatPreference, Goal, HeroClass, Lifestyle, NutritionMode, Rank, Sex, TrainingLocation,
} from './common';

/** Awakening Assessment (optional): max push-ups, plank hold, bodyweight squats in 60 s. */
export const Assessment = z.object({
  pushups: z.number().int().min(0).max(200),
  plankSec: z.number().int().min(0).max(1200),
  squats60: z.number().int().min(0).max(150),
});
export type Assessment = z.infer<typeof Assessment>;

/** Everything the Awakening onboarding collects (PLAN.md §7). */
export const OnboardingInput = z.object({
  hunterName: z.string().trim().min(2).max(20),
  heroId: z.string().min(1),
  goal: Goal,
  experience: Experience,
  location: TrainingLocation,
  equipment: z.array(z.string()).max(50),
  daysPerWeek: z.number().int().min(2).max(6),
  sessionMinutes: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(75)]),
  questTime: z.string().regex(/^\d{2}:\d{2}$/, 'HH:mm'),
  heroClass: HeroClass,
  sex: Sex,
  birthDate: z.iso.date(),
  heightCm: z.number().min(120).max(230),
  weightKg: z.number().min(30).max(300),
  bodyFatPct: z.number().min(3).max(60).nullable(),
  lifestyle: Lifestyle,
  injuries: z.array(z.string()).max(20),
  parqAnyYes: z.boolean(),
  nutritionMode: NutritionMode,
  fatPreference: FatPreference,
  timezone: z.string().min(1),
  assessment: Assessment.nullable(),
  notificationsOptIn: z.boolean(),
  /** explicit consent to health-data processing + terms/privacy (GDPR Art. 9); the version that was shown */
  /** must be the current version: the server stores what the user actually agreed to */
  consentVersion: z.literal(CONSENT_VERSION),
});
export type OnboardingInput = z.infer<typeof OnboardingInput>;

export const HunterState = z.object({
  level: z.number().int(),
  xp: z.number().int(),
  rank: Rank,
  apUnspent: z.number().int(),
  streak: z.number().int(),
  shields: z.number().int(),
  stats: z.object({ STR: z.number(), AGI: z.number(), END: z.number(), VIT: z.number(), SPI: z.number() }),
});
export type HunterState = z.infer<typeof HunterState>;

/** What the training engine needs about the user (no sensitive extras). */
export const TrainingProfile = z.object({
  goal: Goal,
  experience: Experience,
  location: TrainingLocation,
  equipment: z.array(z.string()),
  injuries: z.array(z.string()),
  daysPerWeek: z.number().int(),
  sessionMinutes: z.number().int(),
  sex: Sex,
  heightCm: z.number(),
  weightKg: z.number(),
  timezone: z.string(),
  /** picked training weekdays (0 = Sunday); absent for older profiles → default for daysPerWeek */
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  workoutTime: z.string().nullable().optional(),
});
export type TrainingProfile = z.infer<typeof TrainingProfile>;

export const MeResponse = z.object({
  id: z.string(),
  onboarded: z.boolean(),
  hunterName: z.string().nullable(),
  heroId: z.string().nullable(),
  heroClass: HeroClass.nullable(),
  state: HunterState.nullable(),
  profile: TrainingProfile.nullable().optional(),
  /** nutrition settings + birth date (needed for BMR) */
  nutrition: NutritionProfile.nullable().optional(),
  /** privacy/health-data consent the user last agreed to; the app asks again when it differs from CONSENT_VERSION */
  consentVersion: z.string().nullable().optional(),
});
export type MeResponse = z.infer<typeof MeResponse>;

/** Re-consent after a policy change (GDPR Art. 9 explicit consent, versioned). */
export const ConsentInput = z.object({ version: z.literal(CONSENT_VERSION) });
export type ConsentInput = z.infer<typeof ConsentInput>;
