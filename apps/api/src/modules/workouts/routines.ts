/**
 * The hunter's own weekly routines (custom workouts). The phone creates them offline (client uuid)
 * and saves each edit with its edit time; the newest edit wins, so an old offline save replayed
 * later never overwrites a newer one from another phone.
 */
import { exerciseById } from '@lb/content';
import type { RoutineDto, RoutineInput } from '@lb/contracts';
import type { Prisma, PrismaClient } from '@lb/db';
import { ROUTINE_LIMITS, routineIdOf, routineProgramId } from '@lb/engine';
import { TrainingStateError } from './state';

type Row = { id: string; name: string; days: Prisma.JsonValue; schedule: Prisma.JsonValue; updatedAt: Date };
const toDto = (r: Row): RoutineDto => ({
  id: r.id, name: r.name, days: r.days as RoutineDto['days'], schedule: r.schedule as RoutineDto['schedule'], updatedAt: r.updatedAt.toISOString(),
});

export async function listRoutines(prisma: PrismaClient, userId: string): Promise<RoutineDto[]> {
  const rows = await prisma.customRoutine.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, take: ROUTINE_LIMITS.routines });
  return rows.map(toDto);
}

export async function saveRoutine(prisma: PrismaClient, userId: string, id: string, input: RoutineInput): Promise<{ routine: RoutineDto; stale: boolean }> {
  if (input.id !== id) throw new TrainingStateError(400, 'id mismatch');
  const unknown = input.days.flatMap((d) => d.slots).find((s) => !exerciseById.has(s.exerciseId));
  if (unknown) throw new TrainingStateError(400, `unknown exercise ${unknown.exerciseId}`);
  const updatedAt = new Date(input.updatedAt);
  // a few minutes of clock skew is fine; far-future stamps would pin a routine against later edits
  if (updatedAt.getTime() > Date.now() + 10 * 60_000) throw new TrainingStateError(400, 'updatedAt is in the future');

  const existing = await prisma.customRoutine.findUnique({ where: { id } });
  if (existing && existing.userId !== userId) throw new TrainingStateError(404, 'routine not found');
  if (existing && existing.updatedAt >= updatedAt) return { routine: toDto(existing), stale: true };
  if (!existing && (await prisma.customRoutine.count({ where: { userId } })) >= ROUTINE_LIMITS.routines) {
    throw new TrainingStateError(400, `at most ${ROUTINE_LIMITS.routines} routines`);
  }
  const data = { name: input.name, days: input.days as Prisma.InputJsonValue, schedule: input.schedule as Prisma.InputJsonValue, updatedAt };
  const row = existing
    ? await prisma.customRoutine.update({ where: { id }, data })
    : await prisma.customRoutine.create({ data: { id, userId, ...data } });
  return { routine: toDto(row), stale: false };
}

/** Deleting the active routine leaves no active program; the app falls back to its recommendation. */
export async function deleteRoutine(prisma: PrismaClient, userId: string, id: string) {
  const { count } = await prisma.customRoutine.deleteMany({ where: { id, userId } });
  const p = await prisma.profile.findUnique({ where: { id: userId }, select: { activeProgramId: true } });
  if (p && routineIdOf(p.activeProgramId) === id) {
    await prisma.profile.update({ where: { id: userId }, data: { activeProgramId: null, programStartedAt: null } });
  }
  return { deleted: count > 0 };
}

/** For PUT /workouts/program: a routine id is valid only if it belongs to this hunter. */
export async function ownsRoutineProgram(prisma: PrismaClient, userId: string, programId: string): Promise<boolean> {
  const id = routineIdOf(programId);
  if (!id || routineProgramId(id) !== programId) return false;
  return (await prisma.customRoutine.count({ where: { id, userId } })) > 0;
}
