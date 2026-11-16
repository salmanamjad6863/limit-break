import { describe, expect, it } from 'vitest';
import { assessmentNorms, exerciseById, exercises, features, heroes } from '../src';

describe('content', () => {
  it('norm tables parse and ascend', () => {
    expect(assessmentNorms.pushups.male.anchors.length).toBeGreaterThan(2);
  });
  it('parses and has unique ids', () => {
    expect(new Set(exercises.map((e) => e.id)).size).toBe(exercises.length);
    expect(heroes).toHaveLength(6);
  });
  it('progression chains only reference known exercises', () => {
    for (const e of exercises) {
      for (const id of e.progression?.split('>') ?? []) expect(exerciseById.has(id), `${e.id} → ${id}`).toBe(true);
    }
  });
  it('every feature has a tier', () => {
    expect(Object.keys(features).length).toBe(12);
  });
});

import { computeTrueStats, scoreTrialEvents } from '@lb/engine';
import { trials } from '../src';

describe('real norms and trials', () => {
  it('trial config covers home and gym STR/END and AGI', () => {
    const ids = trials.events.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['pushups', 'lift', 'plankSec', 'squats60', 'run2400Sec']));
  });
  it('a median adult male scores ~50th percentile across the board', () => {
    const ev = scoreTrialEvents(
      { sex: 'male', ageYears: 28, bodyweightKg: 80, setting: 'HOME', results: { pushups: 22, plankSec: 80, squats60: 40, run2400Sec: 750 }, bestE1rm: {} },
      assessmentNorms,
    );
    for (const e of ev) expect(e.percentile).toBe(50);
    const s = computeTrueStats(
      { sex: 'male', ageYears: 28, bodyweightKg: 80, experience: 'novice', tests: { pushups: 22, plankSec: 80, squats60: 40 }, bestE1rm: { 'back-squat': 100 }, calisthenicsLevels: [], weeklyHardSets4w: 20, sessionsDone28: 0, sessionsPlanned28: 0 },
      assessmentNorms,
    );
    expect(s.stats.STR).toBe(50); // 1.25× squat = p50, 22 push-ups = p50
  });
});
