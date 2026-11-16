import { exerciseById, exercises, programById, programs, quickSessions, workoutTypes, type Exercise } from '@lb/content';
import type { CatalogExercise } from '@lb/engine';

/** Content exercises already satisfy the engine's CatalogExercise shape (Zod fills defaults). */
export const catalog: Exercise[] = exercises;
// compile-time check that content stays compatible with the engine
const _engineCompatible: readonly CatalogExercise[] = catalog;
void _engineCompatible;
export { exerciseById, programById, programs, quickSessions, workoutTypes };

export const exerciseName = (id: string) => exerciseById.get(id)?.name ?? id;

const PATTERN_LABEL: Record<string, string> = {
  horizontal_push: 'Push', vertical_push: 'Overhead push', vertical_push_dip: 'Dip', horizontal_pull: 'Row',
  vertical_pull: 'Pull-down / pull-up', squat: 'Squat', squat_iso: 'Squat hold', lunge: 'Single leg', hinge: 'Hinge',
  hip_thrust: 'Glutes', knee_flexion: 'Hamstrings', calf: 'Calves', elbow_flexion: 'Biceps', elbow_extension: 'Triceps',
  shoulder_abduction: 'Side delts', rear_delt: 'Rear delts', core_anti_extension: 'Core', core_anti_lateral: 'Core',
  core_anti_rotation: 'Core', core_flexion: 'Core', carry: 'Carry', conditioning: 'Conditioning', plyo: 'Power',
  cardio: 'Cardio', mobility: 'Mobility',
};
export const patternLabel = (p: string) => PATTERN_LABEL[p] ?? p.replace(/_/g, ' ');
export const muscleLabel = (m: string) => m.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
