import type { PlannedSet } from '@lb/engine';

export const range = (r?: [number, number]) => (!r ? '' : r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`);

/** "8–12 reps · 40 kg · RIR 2" / "30–45 s" / "5 reps · bodyweight" */
export function targetText(s: PlannedSet, opts: { bodyweight: boolean; unilateral?: boolean }): string {
  const parts: string[] = [];
  if (s.seconds) parts.push(`${range(s.seconds)} s${opts.unilateral ? ' / side' : ''}`);
  if (s.reps) parts.push(`${range(s.reps)} reps${opts.unilateral ? ' / side' : ''}`);
  if (s.loadKg != null) parts.push(`${s.loadKg} kg`);
  else if (opts.bodyweight && s.reps) parts.push('bodyweight');
  if (s.kind === 'working' && s.reps) parts.push(`RIR ${s.rir}`);
  return parts.join(' · ');
}

export const mmss = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.max(0, Math.floor(sec)) % 60).padStart(2, '0')}`;

export const ROLE_LABEL: Record<string, string> = {
  main: 'Main lift', secondary: 'Secondary', accessory: 'Accessory', core: 'Core', finisher: 'Finisher',
};
