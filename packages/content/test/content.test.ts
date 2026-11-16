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
