import { generateWorkout, type TrainingContext } from '@lb/engine';
import { describe, expect, it } from 'vitest';
import { exercises, programs } from '../src';

const users: Record<string, Omit<TrainingContext, 'experience'>> = {
  'home, no equipment': { equipment: [], injuries: [], sessionMinutes: 45, bodyweightKg: 75 },
  'home, dumbbells + bands + bar': { equipment: ['dumbbells', 'bands', 'pull_up_bar'], injuries: [], sessionMinutes: 45, bodyweightKg: 75 },
  'full gym': {
    equipment: ['pull_up_bar', 'bands', 'dumbbells', 'kettlebell', 'bench', 'barbell', 'rack', 'cable', 'machines', 'dip_bars'],
    injuries: [], sessionMinutes: 75, bodyweightKg: 80,
  },
};

describe('every program day generates a complete workout for its intended users', () => {
  for (const p of programs) {
    const settings = p.locations.includes('GYM') && !p.locations.includes('HOME') ? ['full gym'] : Object.keys(users);
    for (const level of p.levels) {
      for (const who of settings) {
        it(`${p.id} · ${level} · ${who}`, () => {
          for (const day of p.days) {
            const w = generateWorkout(day, exercises, { ...users[who]!, experience: level });
            expect(w.unfilled, `${day.id} unfilled`).toEqual([]);
            expect(w.exercises.length).toBeGreaterThanOrEqual(3);
            expect(new Set(w.exercises.map((e) => e.exerciseId)).size).toBe(w.exercises.length);
          }
        });
      }
    }
  }

  it('a shoulder injury removes overhead pressing everywhere', () => {
    const gym = users['full gym']!;
    for (const p of programs)
      for (const day of p.days) {
        const w = generateWorkout(day, exercises, { ...gym, injuries: ['shoulder'], experience: 'intermediate' });
        for (const e of w.exercises) expect(['overhead-press', 'db-shoulder-press', 'dip']).not.toContain(e.exerciseId);
      }
  });
});
