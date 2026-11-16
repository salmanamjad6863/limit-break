import { describe, expect, it } from 'vitest';
import { initialStats, type AssessmentNorms } from '../src';

const t = (p: [number, number][]) => ({ anchors: p.map(([percentile, value]) => ({ percentile, value })) });
const norms: AssessmentNorms = {
  pushups: { male: t([[10, 12], [50, 22], [90, 36]]), female: t([[10, 2], [50, 11], [90, 25]]) },
  plankSec: { male: t([[10, 30], [50, 80], [90, 170]]), female: t([[10, 25], [50, 70], [90, 160]]) },
  squats60: { male: t([[10, 25], [50, 40], [90, 54]]), female: t([[10, 20], [50, 34], [90, 48]]) },
};

describe('initialStats', () => {
  it('measures STR/END from the assessment and grants 200 XP', () => {
    const r = initialStats({ sex: 'male', experience: 'novice', assessment: { pushups: 22, plankSec: 80, squats60: 40 }, norms });
    expect(r.stats.STR).toBe(50);
    expect(r.stats.END).toBe(50);
    expect(r.estimated).toBe(false);
    expect(r.xp).toBe(200);
  });
  it('same raw score ranks higher against the female table', () => {
    const m = initialStats({ sex: 'male', experience: 'novice', assessment: { pushups: 11, plankSec: 70, squats60: 34 }, norms });
    const f = initialStats({ sex: 'female', experience: 'novice', assessment: { pushups: 11, plankSec: 70, squats60: 34 }, norms });
    expect(f.stats.STR).toBeGreaterThan(m.stats.STR);
  });
  it('unspecified sex averages both tables', () => {
    const u = initialStats({ sex: 'unspecified', experience: 'novice', assessment: { pushups: 11, plankSec: 70, squats60: 34 }, norms });
    expect(u.percentiles!.pushups).toBeCloseTo((10 + 50) / 2, 0);
  });
  it('falls back to an experience estimate with no XP when skipped', () => {
    const r = initialStats({ sex: 'female', experience: 'intermediate', norms });
    expect(r.stats).toMatchObject({ STR: 50, END: 50, AGI: 20, VIT: 30, SPI: 10 });
    expect(r.estimated).toBe(true);
    expect(r.xp).toBe(0);
  });
});
