/**
 * Every tunable number in the engine. Spec: SYSTEMS.md.
 * Change values here only — never inline magic numbers in formulas.
 */
export const KCAL_PER_KG = 7700; // ρ — energy density of weight change (SYSTEMS §2.3)

export const TREND = {
  alpha: 0.1, // per-day EMA smoothing (§1.4)
  outlierAbsKg: 2.0,
  outlierPct: 0.025,
  outlierAlphaScale: 0.5,
  minWeighInsForSlope: 5,
  minDaysForSlope: 10,
} as const;

export const TDEE = {
  windowDays: 21,
  minUsableDays: 10,
  fullConfidenceValidDays: 14,
  fullConfidenceWeighIns: 7,
  learningRate: 0.1, // recursive update step at full confidence
  minBmrMultiple: 1.05,
  maxBmrMultiple: 2.5,
  suspiciousCompleteDayKcal: 800,
  validDayMinMeals: 2,
  validDayMinTargetShare: 0.6,
} as const;

export const LIFESTYLE_FACTOR = {
  sedentary: 1.2,
  light: 1.3,
  active: 1.4,
  veryActive: 1.5,
} as const;

export const MET = {
  strength: 5.0,
  calisthenics: 6.0,
  cyclingModerate: 7.0,
  /** running MET ≈ speed in km/h */
  runningPerKmh: 1.0,
} as const;

export const TARGETS = {
  maxDeficitShareOfTdee: 0.25,
  maxDeficitKcal: 1000,
  floorKcal: { female: 1200, male: 1500, unspecified: 1350 },
  weeklyMaxChangeKcal: 150,
  /** % bodyweight per week, as a fraction (−0.005 = −0.5%/wk) */
  rates: {
    cut: [-0.0025, -0.005, -0.0075, -0.01],
    maintain: [0],
    recomp: [0],
    bulk: [0.001, 0.0025, 0.005],
  },
  maxCutRequiresBmi: 25,
} as const;

export const MACROS = {
  proteinPerKg: { cut: 2.0, maintain: 1.8, recomp: 1.8, bulk: 1.6 },
  proteinPerKgLbm: { cut: 2.4, maintain: 2.2, recomp: 2.2, bulk: 2.0 },
  proteinMinPerKg: 1.6,
  proteinMaxKcalShare: 0.4,
  fatShare: { lower: 0.2, balanced: 0.3, higher: 0.4 },
  fatMinPerKg: 0.6,
  minCarbsG: 50,
  fiberPer1000Kcal: 14,
  waterMlPerKg: 35,
  waterMlPerTrainingHour: 500,
  kcalPerG: { protein: 4, carbs: 4, fat: 9, alcohol: 7 },
  labelMismatchTolerance: 0.15,
} as const;

export const ADHERENCE = {
  proteinHit: 0.9,
  kcalToleranceKcal: 150,
  kcalTolerancePct: 0.1,
} as const;

export const LEVEL_CURVE = { a: 65, p: 1.77 } as const; // cumulativeXP(L) = a·(L−1)^p (§4.2)

export const XP = {
  setBase: 10,
  /** effort multiplier by reps-in-reserve; index = RIR (0..4) */
  effortByRir: [1.1, 1.1, 1.0, 0.9, 0.7] as readonly number[],
  effortUnknownRir: 0.9,
  hardSetMaxRir: 4,
  cardioPerMinute: 4,
  zoneFactor: { 1: 0.5, 2: 1.0, 3: 1.2, 4: 1.5, 5: 1.8 } as Record<1 | 2 | 3 | 4 | 5, number>,
  completionBonus: 50,
  completionThreshold: 0.8,
  prBonus: 25,
  prBonusMaxPerSession: 3,
  extraSetsMultiplier: 1.5,
  dailyQuest: 50,
  dailyQuestStreakBonusMax: 30,
  penaltyQuest: 20,
  sideQuest: 15,
  sideQuestMaxPerDay: 3,
  nutritionCompleteDay: 20,
  bossWin: 150,
  bossAttempt: 50,
  rankTrialPass: 300,
  hiddenQuest: 100,
  awakeningAssessment: 200,
  dailyCap: 500,
} as const;

export const GAME_DAY_ROLLOVER_HOUR = 3;
