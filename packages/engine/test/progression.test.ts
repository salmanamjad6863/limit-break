import { describe, expect, it } from 'vitest';
import {
  applyDailyCap, apBetween, cumulativeXp, e1rm, evaluateTrial, gameDate, hrZone, levelFromXp,
  pct1rm, percentileFromNorms, plateLoadout, sessionXp, setXp, warmupSets, xpToNext,
} from '../src';

describe('level curve (SYSTEMS §4.2 table)', () => {
  const table: [number, number, number][] = [
    [2, 65, 157], [5, 756, 366], [10, 3176, 651], [25, 18025, 1351], [40, 42569, 1951],
    [50, 63762, 2321], [60, 88577, 2675], [80, 148496, 3343], [100, 221405, 3974],
  ];
  it.each(table)('level %i: total %i, to next %i', (l, total, next) => {
    expect(cumulativeXp(l)).toBe(total);
    expect(xpToNext(l)).toBe(next);
  });
  it('levelFromXp is the inverse at every boundary', () => {
    for (let l = 1; l <= 150; l++) {
      expect(levelFromXp(cumulativeXp(l))).toBe(l);
      if (l > 1) expect(levelFromXp(cumulativeXp(l) - 1)).toBe(l - 1);
    }
  });
  it('AP: +1 per level, +2 bonus at multiples of 10', () => {
    expect(apBetween(1, 10)).toBe(11);
  });
});

describe('XP', () => {
  it('set XP by RIR, warm-ups give 0', () => {
    expect(setXp({ reps: 8, loadKg: 60, rir: 2 })).toBe(10);
    expect(setXp({ reps: 8, loadKg: 60, rir: 0 })).toBeCloseTo(11);
    expect(setXp({ reps: 8, loadKg: 60, rir: 6 })).toBe(0);
    expect(setXp({ reps: 8, loadKg: 30, isWarmup: true })).toBe(0);
  });
  it('sets beyond 1.5× plan earn nothing', () => {
    const sets = Array.from({ length: 40 }, () => ({ reps: 10, loadKg: 50, rir: 2 }));
    const r = sessionXp({ sets, plannedHardSets: 18, prCount: 5 });
    expect(r.ignoredSets).toBe(13);
    expect(r.prBonus).toBe(75);
    expect(r.total).toBe(27 * 10 + 50 + 75);
  });
  it('daily cap = 500', () => {
    expect(applyDailyCap(450, 200)).toEqual({ granted: 50, dropped: 150 });
  });
});

describe('training math', () => {
  it('e1RM: 100 kg × 5 @ RIR 0', () => {
    expect(e1rm(100, 5)).toBeCloseTo((116.667 + 112.5) / 2, 2);
    expect(e1rm(100, 13)).toBeNull();
  });
  it('%1RM 5 @ RIR2 = 0.811', () => expect(pct1rm(5, 2)).toBeCloseTo(0.811, 3));
  it('warm-up ramp', () => expect(warmupSets(100)).toEqual([{ kg: 40, reps: 5 }, { kg: 60, reps: 3 }, { kg: 80, reps: 1 }]));
  it('plate calculator falls back to the closest lower load', () => {
    const r = plateLoadout(101, 20, [{ kg: 20, perSide: 2 }, { kg: 10, perSide: 2 }, { kg: 5, perSide: 2 }, { kg: 2.5, perSide: 2 }, { kg: 1.25, perSide: 2 }]);
    expect(r.totalKg).toBe(100);
    expect(r.exact).toBe(false);
  });
  it('HR zones (Karvonen)', () => {
    // age 30 → HRmax 187; RHR 60 → 60% HRR = 136.2
    expect(hrZone(137, 30, 60)).toBe(2);
    expect(hrZone(180, 30, 60)).toBe(5);
  });
});

describe('ranks & norms', () => {
  const pushups = { anchors: [ { percentile: 10, value: 10 }, { percentile: 50, value: 25 }, { percentile: 90, value: 40 } ] };
  it('interpolates percentiles', () => expect(percentileFromNorms(32.5, pushups)).toBeCloseTo(70));
  it('lower-is-better metrics (run time)', () => {
    const run = { lowerIsBetter: true, anchors: [ { percentile: 10, value: 16 }, { percentile: 90, value: 9 } ] };
    expect(percentileFromNorms(12.5, run)).toBeCloseTo(50);
  });
  it('trial requires level, composite and per-event minimum', () => {
    const ok = evaluateTrial({ target: 'C', level: 25, heroClass: 'HYBRID', events: [
      { stat: 'STR', percentile: 55 }, { stat: 'END', percentile: 52 }, { stat: 'AGI', percentile: 50 } ] });
    expect(ok.passed).toBe(true);
    const weak = evaluateTrial({ target: 'C', level: 25, heroClass: 'HYBRID', events: [
      { stat: 'STR', percentile: 90 }, { stat: 'END', percentile: 80 }, { stat: 'AGI', percentile: 20 } ] });
    expect(weak.passed).toBe(false);
  });
});

describe('game day', () => {
  it('rolls over at 03:00 local time', () => {
    // 01:30 in Karachi (UTC+5) on Jan 2 → still Jan 1
    expect(gameDate(new Date('2026-01-01T20:30:00Z'), 'Asia/Karachi')).toBe('2026-01-01');
    // 03:30 local → Jan 2
    expect(gameDate(new Date('2026-01-01T22:30:00Z'), 'Asia/Karachi')).toBe('2026-01-02');
  });
});
