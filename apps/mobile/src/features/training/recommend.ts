import type { ProgramTemplate } from '@lb/content';
import type { TrainingProfile } from '@lb/contracts';
import { programs } from './catalog';

/** Score how well a program fits the user (PLAN.md §5.9). Higher is better; −∞ = unsuitable. */
export function programFit(p: ProgramTemplate, u: TrainingProfile): number {
  const locOk = u.location === 'HYBRID' ? true : p.locations.includes(u.location);
  if (!locOk) return -Infinity;
  let score = 0;
  if (p.levels.includes(u.experience)) score += 50;
  else score -= 30;
  if (p.goals.includes(u.goal)) score += 20;
  const nearestDays = Math.min(...p.daysPerWeek.map((d) => Math.abs(d - u.daysPerWeek)));
  score -= nearestDays * 12;
  if (u.goal === 'cut' && p.id === 'burn-protocol') score += 15;
  return score;
}

export function rankedPrograms(u: TrainingProfile): { program: ProgramTemplate; fit: number }[] {
  return programs
    .map((program) => ({ program, fit: programFit(program, u) }))
    .filter((x) => Number.isFinite(x.fit))
    .sort((a, b) => b.fit - a.fit);
}

export const recommendedProgramId = (u: TrainingProfile) => rankedPrograms(u)[0]?.program.id ?? 'foundation';
