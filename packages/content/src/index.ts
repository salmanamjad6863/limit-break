import { z } from 'zod';
import exercisesJson from './data/exercises.json';
import featuresJson from './data/features.json';
import heroesJson from './data/heroes.json';
import normsJson from './data/norms.json';
import notificationsJson from './data/notifications.json';
import workoutTypesJson from './data/workout-types.json';
import burnProtocol from './data/programs/burn-protocol.json';
import foundation from './data/programs/foundation.json';
import ironFoundation from './data/programs/iron-foundation.json';
import linearStrength from './data/programs/linear-strength.json';
import shinobiPath from './data/programs/shinobi-path.json';
import upperLowerBuilder from './data/programs/upper-lower-builder.json';
import quickSessionsJson from './data/quick-sessions.json';
import { AssessmentNorms, Exercise, FeatureMatrix, Hero, Notifications, ProgramTemplate, QuickSession, WorkoutType } from './schemas';

export * from './schemas';

/** Parsed at import time — invalid content fails fast in dev and in CI. */
export const exercises = z.array(Exercise).parse(exercisesJson);
export const heroes = z.array(Hero).parse(heroesJson);
export const features = FeatureMatrix.parse(featuresJson);
export const notifications = Notifications.parse(notificationsJson);
/** PROVISIONAL norm anchors — see data/norms.json `_status`. */
export const assessmentNorms = AssessmentNorms.parse(normsJson);

export const workoutTypes = z.array(WorkoutType).parse(workoutTypesJson);

/** Program templates (PLAN.md §5.9). Order = display order. */
export const programs = z
  .array(ProgramTemplate)
  .parse([foundation, shinobiPath, burnProtocol, ironFoundation, linearStrength, upperLowerBuilder]);
export const programById = new Map(programs.map((p) => [p.id, p]));
export const quickSessions = z.array(QuickSession).parse(quickSessionsJson);

export const exerciseById = new Map(exercises.map((e) => [e.id, e]));

/** Fills `{key}` placeholders in a notification template. */
export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
