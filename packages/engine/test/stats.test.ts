import { describe, expect, it } from 'vitest';
import { computeTrueStats, evaluateTrial, scoreTrialEvents, trialStatus, type StatNorms } from '../src';

const A = (pairs: [number, number][], lowerIsBetter = false) => ({ anchors: pairs.map(([percentile, value]) => ({ percentile, value })), lowerIsBetter });
const both = (x: ReturnType<typeof A>) => ({ male: x, female: x });
const norms: StatNorms = {
  pushups: both(A([[10, 10], [50, 25], [90, 40]])),
  plankSec: both(A([[10, 30], [50, 80], [90, 170]])),
  squats60: both(A([[10, 25], [50, 40], [90, 54]])),
  run2400Sec: both(A([[10, 960], [50, 750], [90, 600]], true)),
  strengthRatio: { 'bench-press': both(A([[10, 0.6], [50, 1.0], [90, 1.5]])), 'back-squat': both(A([[10, 0.8], [50, 1.25], [90, 2.0]])) },
  calisthenicsLevel: A([[10, 1], [50, 3], [90, 5]]),
};
const base = {
  sex: 'male' as const, ageYears: 25, bodyweightKg: 80, experience: 'novice' as const, tests: {}, bestE1rm: {},
  calisthenicsLevels: [] as number[], weeklyHardSets4w: 0, sessionsDone28: 0, sessionsPlanned28: 0,
};

describe('True Stats (SYSTEMS §4.3)', () => {
  it('falls back to estimates and marks them', () => {
    const r = computeTrueStats(base, norms);
    expect(r.stats.STR).toBe(35);
    expect(r.sources.STR).toBe('estimated');
    expect(r.sources.AGI).toBe('estimated');
    expect(r.stats.SPI).toBe(10);
  });
  it('STR = max(gym lifts, calisthenics, push-ups)', () => {
    const r = computeTrueStats({ ...base, bestE1rm: { 'bench-press': 80, 'back-squat': 100 }, tests: { pushups: 10 } }, norms);
    // bench 1.0× → 50, squat 1.25× → 50 → gym 50 > push-ups 10
    expect(r.stats.STR).toBe(50);
    expect(r.sources.STR).toBe('measured');
    const cal = computeTrueStats({ ...base, calisthenicsLevels: [5, 2] }, norms);
    expect(cal.stats.STR).toBe(90);
  });
  it('END blends tests (70%) with training volume (30%)', () => {
    const r = computeTrueStats({ ...base, tests: { pushups: 25, plankSec: 80, squats60: 40 }, weeklyHardSets4w: 40 }, norms);
    expect(r.stats.END).toBe(0.7 * 50 + 0.3 * 100);
  });
  it('AGI from the run (lower time = higher percentile)', () => {
    expect(computeTrueStats({ ...base, tests: { run2400Sec: 600 } }, norms).stats.AGI).toBe(90);
    expect(computeTrueStats({ ...base, tests: { run2400Sec: 750 } }, norms).stats.AGI).toBe(50);
  });
  it('SPI from adherence; decay after 4 idle weeks', () => {
    expect(computeTrueStats({ ...base, sessionsDone28: 9, sessionsPlanned28: 12 }, norms).stats.SPI).toBe(75);
    const fresh = computeTrueStats({ ...base, tests: { pushups: 40 } }, norms).stats.STR;
    const idle = computeTrueStats({ ...base, tests: { pushups: 40 }, weeksSinceData: 10 }, norms).stats.STR;
    expect(idle).toBeCloseTo(fresh * 0.94, 5);
  });
});

describe('Rank Trials (SYSTEMS §4.4)', () => {
  it('home scores push-ups; gym uses the best logged lift', () => {
    const home = scoreTrialEvents({ sex: 'male', ageYears: 25, bodyweightKg: 80, setting: 'HOME', results: { pushups: 25, plankSec: 80, squats60: 40 }, bestE1rm: { 'bench-press': 120 } }, norms);
    expect(home.map((e) => e.id)).toEqual(['pushups', 'plankSec', 'squats60']);
    const gym = scoreTrialEvents({ sex: 'male', ageYears: 25, bodyweightKg: 80, setting: 'GYM', results: { plankSec: 80, squats60: 40 }, bestE1rm: { 'bench-press': 120 } }, norms);
    expect(gym[0]).toMatchObject({ id: 'lift', raw: 1.5, percentile: 90, note: 'bench-press' });
  });
  it('a D trial passes at composite ≥ 30 with no event under 10', () => {
    const events = scoreTrialEvents({ sex: 'male', ageYears: 25, bodyweightKg: 80, setting: 'HOME', results: { pushups: 20, plankSec: 60, squats60: 35 }, bestE1rm: {} }, norms);
    expect(evaluateTrial({ target: 'D', level: 10, heroClass: 'HYBRID', events }).passed).toBe(true);
  });
  it('eligibility: level gate, then 7-day cooldown after a failed attempt', () => {
    expect(trialStatus({ rank: 'E', level: 9, attempts: [] })).toMatchObject({ target: 'D', eligible: false, reason: 'level', levelRequired: 10 });
    expect(trialStatus({ rank: 'E', level: 10, attempts: [] }).eligible).toBe(true);
    const now = new Date('2026-11-20T00:00:00Z');
    const failed = [{ target: 'D', at: '2026-11-17T00:00:00Z', passed: false }];
    const s = trialStatus({ rank: 'E', level: 12, attempts: failed, now });
    expect(s).toMatchObject({ eligible: false, reason: 'cooldown', retryAt: '2026-11-24T00:00:00.000Z' });
    expect(trialStatus({ rank: 'E', level: 12, attempts: failed, now: new Date('2026-11-25T00:00:00Z') }).eligible).toBe(true);
    expect(trialStatus({ rank: 'C', level: 40, attempts: [] }).runRequired).toBe(true);
    expect(trialStatus({ rank: 'S', level: 99, attempts: [] }).reason).toBe('max-rank');
  });
});
