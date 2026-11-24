import { exerciseById, programById } from '@lb/content';
import type { TrainingStateResponse } from '@lb/contracts';
import type { PrismaClient } from '@lb/db';
import { getNotes, listWorkouts } from './service';
import { listRoutines, ownsRoutineProgram } from './routines';

export class TrainingStateError extends Error {
  constructor(public status: 400 | 404, message: string) {
    super(message);
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Rebuilds the phone's training state from the server (restore after signing in on a new phone). */
export async function getTrainingState(prisma: PrismaClient, userId: string): Promise<TrainingStateResponse> {
  const p = await prisma.profile.findUnique({
    where: { id: userId },
    select: { activeProgramId: true, programStartedAt: true, avoidExercises: true },
  });
  const active = p?.activeProgramId ?? null;
  const [recent, completedSessions, records, lastSets, notes, routines] = await Promise.all([
    listWorkouts(prisma, userId, undefined, 60),
    active
      ? prisma.workoutSession.count({
          where: { userId, kind: 'program', programId: active, ...(p?.programStartedAt ? { finishedAt: { gte: p.programStartedAt } } : {}) },
        })
      : Promise.resolve(0),
    prisma.personalRecord.groupBy({ by: ['exerciseId'], where: { userId }, _max: { e1rmKg: true } }),
    // newest working set per exercise (parameterised: userId is bound, never interpolated)
    prisma.$queryRaw<{ exerciseId: string; reps: number | null; weightKg: number | null }[]>`
      SELECT DISTINCT ON (ws."exerciseId") ws."exerciseId", ws."reps", ws."weightKg"
      FROM "WorkoutSet" ws JOIN "WorkoutSession" s ON s."id" = ws."sessionId"
      WHERE s."userId" = ${userId}::uuid AND ws."isWarmup" = false
      ORDER BY ws."exerciseId", ws."completedAt" DESC
      LIMIT 1000`,
    getNotes(prisma, userId),
    listRoutines(prisma, userId),
  ]);
  return {
    activeProgramId: active,
    completedSessions,
    recent,
    bestE1rm: Object.fromEntries(records.filter((r) => r._max.e1rmKg != null).map((r) => [r.exerciseId, round1(r._max.e1rmKg!)])),
    lastSet: Object.fromEntries(lastSets.map((r) => [r.exerciseId, { reps: r.reps, loadKg: r.weightKg }])),
    avoid: p?.avoidExercises ?? [],
    notes: notes.notes,
    routines,
  };
}

/** Picking a program restarts its rotation (same rule as the app). */
export async function setActiveProgram(prisma: PrismaClient, userId: string, programId: string) {
  if (!programById.has(programId) && !(await ownsRoutineProgram(prisma, userId, programId))) throw new TrainingStateError(400, 'unknown program');
  const p = await prisma.profile.findUnique({ where: { id: userId }, select: { activeProgramId: true } });
  if (!p) throw new TrainingStateError(404, 'profile not found');
  if (p.activeProgramId !== programId) {
    await prisma.profile.update({ where: { id: userId }, data: { activeProgramId: programId, programStartedAt: new Date() } });
  }
  return { activeProgramId: programId };
}

/** "This hurts" flags from the player; the workout generator swaps these exercises out. */
export async function setAvoid(prisma: PrismaClient, userId: string, exerciseId: string, avoid: boolean) {
  if (!exerciseById.has(exerciseId)) throw new TrainingStateError(400, 'unknown exercise');
  const p = await prisma.profile.findUnique({ where: { id: userId }, select: { avoidExercises: true } });
  if (!p) throw new TrainingStateError(404, 'profile not found');
  const set = new Set(p.avoidExercises);
  if (avoid) set.add(exerciseId);
  else set.delete(exerciseId);
  const list = [...set].slice(0, 100);
  await prisma.profile.update({ where: { id: userId }, data: { avoidExercises: list } });
  return { avoid: list };
}
