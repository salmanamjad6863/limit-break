/**
 * Starting True Stats from the Awakening Assessment (PLAN.md §7 step 10, SYSTEMS.md §4.3).
 * STR ← push-up percentile (home proxy until lifts are logged)
 * END ← mean percentile of push-ups, plank and 60 s squats
 * AGI / VIT / SPI start at conservative placeholders until real cardio, sleep and adherence data exist.
 */
import type { Sex } from '../body';
import { XP } from '../constants';
import { percentileFromNorms, type NormAnchors, type Stats } from './ranks';

export type Experience = 'beginner' | 'novice' | 'intermediate' | 'advanced';

export interface AssessmentResult {
  pushups: number;
  plankSec: number;
  squats60: number;
}

export interface AssessmentNorms {
  pushups: { male: NormAnchors; female: NormAnchors };
  plankSec: { male: NormAnchors; female: NormAnchors };
  squats60: { male: NormAnchors; female: NormAnchors };
}

const EXPERIENCE_ESTIMATE: Record<Experience, number> = {
  beginner: 20,
  novice: 35,
  intermediate: 50,
  advanced: 65,
};

export const STARTING_PLACEHOLDERS = { AGI: 20, VIT: 30, SPI: 10 } as const;

/** Percentile for one test; 'unspecified' sex averages the male and female tables. */
export function testPercentile(
  value: number,
  table: { male: NormAnchors; female: NormAnchors },
  sex: Sex,
): number {
  if (sex === 'male') return percentileFromNorms(value, table.male);
  if (sex === 'female') return percentileFromNorms(value, table.female);
  return (percentileFromNorms(value, table.male) + percentileFromNorms(value, table.female)) / 2;
}

export interface InitialStatsResult {
  stats: Stats;
  /** true when STR/END were estimated from experience instead of measured */
  estimated: boolean;
  percentiles: { pushups: number; plankSec: number; squats60: number } | null;
  /** one-time XP grant for completing the assessment */
  xp: number;
}

export function initialStats(input: {
  sex: Sex;
  experience: Experience;
  assessment?: AssessmentResult | null;
  norms: AssessmentNorms;
}): InitialStatsResult {
  const { assessment, norms, sex } = input;
  if (!assessment) {
    const est = EXPERIENCE_ESTIMATE[input.experience];
    return { stats: { STR: est, END: est, ...STARTING_PLACEHOLDERS }, estimated: true, percentiles: null, xp: 0 };
  }
  const p = {
    pushups: testPercentile(assessment.pushups, norms.pushups, sex),
    plankSec: testPercentile(assessment.plankSec, norms.plankSec, sex),
    squats60: testPercentile(assessment.squats60, norms.squats60, sex),
  };
  const round1 = (x: number) => Math.round(x * 10) / 10;
  return {
    stats: {
      STR: round1(p.pushups),
      END: round1((p.pushups + p.plankSec + p.squats60) / 3),
      ...STARTING_PLACEHOLDERS,
    },
    estimated: false,
    percentiles: p,
    xp: XP.awakeningAssessment,
  };
}
