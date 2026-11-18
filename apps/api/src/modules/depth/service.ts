/**
 * Depth features (SYSTEMS.md §6): measurements, private progress photos, meal templates, weekly debrief.
 * Everything here is private to the hunter: photos are never part of community payloads.
 */
import { curatedFoodById } from '@lb/content';
import type {
  ApplyMealTemplateInput, ApplyMealTemplateResponse, AwakeningPairDto, CreateProgressPhotoInput, DebriefMetrics, MealTemplateDto, MealTemplateItem,
  MeasurementDto, MeasurementInput, MeasurementPoint, MeasurementsResponse, ProgressPhotoDto, ProgressPhotoKind, ProgressPhotosResponse,
  SignProgressPhotoResponse, TemplateMeal, UpsertMealTemplateInput, WeeklyDebriefDto,
} from '@lb/contracts';
import type { PrismaClient } from '@lb/db';
import { gameDate } from '@lb/engine';
import type { Deps } from '../../lib/types';
import { isUniqueViolation } from '../../lib/db';
import { upsertFood, uuidFrom } from '../nutrition/service';
import { templateDebrief } from './debrief';

export class DepthError extends Error {
  constructor(public status: 400 | 403 | 404 | 409 | 503, message: string) {
    super(message);
  }
}

export const PHOTO_BUCKET = 'progress-photos';
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_READ_SECONDS = 3600;
const MAX_TEMPLATES = 50;
const DAY = 86_400_000;

const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;

async function today(prisma: PrismaClient, userId: string) {
  const p = await prisma.profile.findUnique({ where: { id: userId }, select: { timezone: true } });
  return gameDate(new Date(), p?.timezone ?? 'UTC');
}

/* ---------------- Measurements ---------------- */

const toMeasurement = (m: {
  id: string; localDate: string; measuredAt: Date; weightKg: number | null; waistCm: number | null; chestCm: number | null; armCm: number | null; hipCm: number | null;
}): MeasurementDto => ({
  id: m.id, localDate: m.localDate, measuredAt: m.measuredAt.toISOString(), weightKg: m.weightKg, waistCm: m.waistCm, chestCm: m.chestCm, armCm: m.armCm, hipCm: m.hipCm,
});

export async function listMeasurements(prisma: PrismaClient, userId: string): Promise<MeasurementsResponse> {
  const since = shift(await today(prisma, userId), -90);
  const rows = await prisma.bodyMetric.findMany({ where: { userId, localDate: { gte: since } }, orderBy: { measuredAt: 'asc' } });
  const kept = rows.filter((m) => m.weightKg != null || m.waistCm != null || m.chestCm != null || m.armCm != null || m.hipCm != null);
  const series = (pick: (m: (typeof kept)[number]) => number | null): MeasurementPoint[] =>
    kept.flatMap((m) => {
      const v = pick(m);
      return v == null ? [] : [{ localDate: m.localDate, value: round1(v) }];
    });
  return {
    measurements: kept.map(toMeasurement),
    series: { waist: series((m) => m.waistCm), chest: series((m) => m.chestCm), arm: series((m) => m.armCm), weight: series((m) => m.weightKg) },
  };
}

/** Upsert by id; only the provided fields change, so a weigh-in row (weight) keeps its weight. */
export async function upsertMeasurement(prisma: PrismaClient, userId: string, input: MeasurementInput): Promise<MeasurementDto> {
  const existing = await prisma.bodyMetric.findUnique({ where: { id: input.id } });
  if (existing && existing.userId !== userId) throw new DepthError(409, 'id already used');
  const fields = {
    ...(input.waistCm != null ? { waistCm: input.waistCm } : {}),
    ...(input.chestCm != null ? { chestCm: input.chestCm } : {}),
    ...(input.armCm != null ? { armCm: input.armCm } : {}),
    ...(input.hipCm != null ? { hipCm: input.hipCm } : {}),
  };
  if (existing) {
    await prisma.bodyMetric.update({ where: { id: input.id }, data: { localDate: input.localDate, ...fields } });
  } else {
    await prisma.bodyMetric.create({ data: { id: input.id, userId, localDate: input.localDate, measuredAt: new Date(`${input.localDate}T12:00:00Z`), source: 'manual', ...fields } });
  }
  const row = await prisma.bodyMetric.findUnique({ where: { id: input.id } });
  return toMeasurement(row!);
}

/* ---------------- Progress photos ---------------- */

/** The only valid storage key for a user's photo: `progress/{userId}/{id}.jpg`. Never trusted from the client. */
export const photoKey = (userId: string, id: string) => `progress/${userId}/${id}.jpg`;

export async function signPhoto(deps: Deps, userId: string, id: string): Promise<SignProgressPhotoResponse> {
  if (!deps.storage) throw new DepthError(503, 'photo uploads are not configured');
  const storageKey = photoKey(userId, id);
  return { id, uploadUrl: await deps.storage.signUpload(PHOTO_BUCKET, storageKey), storageKey, maxBytes: MAX_PHOTO_BYTES };
}

type PhotoRow = { id: string; localDate: string; takenAt: Date; kind: string; storageKey: string; width: number; height: number; note: string | null };

async function toPhotoDto(deps: Deps, r: PhotoRow): Promise<ProgressPhotoDto> {
  const url = deps.storage ? await deps.storage.signRead(PHOTO_BUCKET, r.storageKey, PHOTO_READ_SECONDS).catch(() => null) : null;
  return { id: r.id, localDate: r.localDate, takenAt: r.takenAt.toISOString(), kind: r.kind as ProgressPhotoKind, width: r.width, height: r.height, note: r.note, url };
}

export async function createPhoto(prisma: PrismaClient, deps: Deps, userId: string, input: CreateProgressPhotoInput): Promise<ProgressPhotoDto> {
  if (input.storageKey !== photoKey(userId, input.id)) throw new DepthError(400, 'invalid photo key');
  const dupe = await prisma.progressPhoto.findUnique({ where: { id: input.id } });
  if (dupe) {
    if (dupe.userId !== userId) throw new DepthError(409, 'id already used');
    return toPhotoDto(deps, dupe);
  }
  const row = await prisma.progressPhoto.create({
    data: {
      id: input.id, userId, localDate: input.localDate, takenAt: input.takenAt ? new Date(input.takenAt) : new Date(), kind: input.kind,
      storageKey: input.storageKey, width: input.width, height: input.height, note: input.note?.trim() || null,
    },
  });
  return toPhotoDto(deps, row);
}

export async function listPhotos(prisma: PrismaClient, deps: Deps, userId: string, kind?: ProgressPhotoKind): Promise<ProgressPhotosResponse> {
  const rows = await prisma.progressPhoto.findMany({ where: { userId, ...(kind ? { kind } : {}) }, orderBy: { takenAt: 'desc' }, take: 200 });
  return { photos: await Promise.all(rows.map((r) => toPhotoDto(deps, r))) };
}

export async function awakeningPair(prisma: PrismaClient, deps: Deps, userId: string): Promise<AwakeningPairDto> {
  const [before, after] = await Promise.all([
    prisma.progressPhoto.findFirst({ where: { userId, kind: 'before' }, orderBy: { takenAt: 'asc' } }),
    prisma.progressPhoto.findFirst({ where: { userId, kind: 'after' }, orderBy: { takenAt: 'desc' } }),
  ]);
  if (before && after) return { before: await toPhotoDto(deps, before), after: await toPhotoDto(deps, after), source: 'tagged' };
  const recent = await prisma.progressPhoto.findMany({ where: { userId, kind: 'progress' }, orderBy: { takenAt: 'desc' }, take: 2 });
  if (recent.length === 2) return { before: await toPhotoDto(deps, recent[1]!), after: await toPhotoDto(deps, recent[0]!), source: 'progress' };
  return { before: before ? await toPhotoDto(deps, before) : null, after: after ? await toPhotoDto(deps, after) : null, source: 'incomplete' };
}

export async function deletePhoto(prisma: PrismaClient, deps: Deps, userId: string, id: string) {
  const row = await prisma.progressPhoto.findUnique({ where: { id } });
  if (!row || row.userId !== userId) throw new DepthError(404, 'photo not found');
  await prisma.progressPhoto.delete({ where: { id } });
  // best effort: the row is gone either way, a failed storage delete must not resurrect it
  await deps.storage?.remove?.(PHOTO_BUCKET, row.storageKey).catch(() => undefined);
  return { ok: true };
}

/* ---------------- Meal templates ---------------- */

const itemsOf = (json: unknown): MealTemplateItem[] => (Array.isArray(json) ? (json as MealTemplateItem[]) : []);

const toTemplate = (t: { id: string; name: string; meal: string; items: unknown; createdAt: Date; updatedAt: Date }): MealTemplateDto => ({
  id: t.id, name: t.name, meal: t.meal as TemplateMeal, items: itemsOf(t.items), createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(),
});

export async function listTemplates(prisma: PrismaClient, userId: string): Promise<{ templates: MealTemplateDto[] }> {
  const rows = await prisma.mealTemplate.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, take: MAX_TEMPLATES });
  return { templates: rows.map(toTemplate) };
}

/** A food is usable when it's curated content or a stored food that is shared or the user's own. */
async function assertFoodsUsable(prisma: PrismaClient, userId: string, foodIds: string[]) {
  const ids = [...new Set(foodIds)];
  const stored = await prisma.food.findMany({ where: { id: { in: ids } } });
  const byId = new Map(stored.map((f) => [f.id, f]));
  for (const id of ids) {
    const f = byId.get(id);
    if (f) {
      if (f.ownerId && f.ownerId !== userId) throw new DepthError(403, 'not your food');
    } else if (!curatedFoodById.has(id)) throw new DepthError(404, `unknown food: ${id}`);
  }
}

export async function upsertTemplate(prisma: PrismaClient, userId: string, input: UpsertMealTemplateInput): Promise<MealTemplateDto> {
  const existing = await prisma.mealTemplate.findUnique({ where: { id: input.id } });
  if (existing && existing.userId !== userId) throw new DepthError(409, 'id already used');
  if (!existing && (await prisma.mealTemplate.count({ where: { userId } })) >= MAX_TEMPLATES) throw new DepthError(409, `template limit reached (${MAX_TEMPLATES})`);
  await assertFoodsUsable(prisma, userId, input.items.map((i) => i.foodId));
  const items = input.items.map((i) => ({ foodId: i.foodId, grams: i.grams, ...(i.servingLabel ? { servingLabel: i.servingLabel } : {}) }));
  const row = existing
    ? await prisma.mealTemplate.update({ where: { id: input.id }, data: { name: input.name, meal: input.meal, items } })
    : await prisma.mealTemplate.create({ data: { id: input.id, userId, name: input.name, meal: input.meal, items } });
  return toTemplate(row);
}

export async function deleteTemplate(prisma: PrismaClient, userId: string, id: string) {
  const t = await prisma.mealTemplate.findUnique({ where: { id } });
  if (!t || t.userId !== userId) throw new DepthError(404, 'template not found');
  await prisma.mealTemplate.delete({ where: { id } });
  return { ok: true };
}

/**
 * Logs every item of a template on `toDate`. Idempotent by applyId: row ids are derived from
 * (user, template, applyId, item index), so a retried apply adds nothing twice.
 */
export async function applyTemplate(prisma: PrismaClient, userId: string, id: string, input: ApplyMealTemplateInput): Promise<ApplyMealTemplateResponse> {
  const t = await prisma.mealTemplate.findUnique({ where: { id } });
  if (!t || t.userId !== userId) throw new DepthError(404, 'template not found');
  const items = itemsOf(t.items);
  if (!items.length) throw new DepthError(409, 'template is empty');

  // make sure every food row exists (curated foods are created on first use, like a normal log)
  for (const item of items) {
    const stored = await prisma.food.findUnique({ where: { id: item.foodId } });
    if (stored) {
      if (stored.ownerId && stored.ownerId !== userId) throw new DepthError(403, 'not your food');
      continue;
    }
    const curated = curatedFoodById.get(item.foodId);
    if (!curated) throw new DepthError(404, `unknown food: ${item.foodId}`);
    await upsertFood(prisma, userId, { ...curated, brand: null, barcode: null });
  }

  const meal = t.meal === 'other' ? 'snack' : t.meal;
  const now = new Date();
  try {
    const res = await prisma.foodLog.createMany({
      data: items.map((item, index) => ({
        id: uuidFrom(`tpl:${userId}:${t.id}:${input.applyId}:${index}`), userId, foodId: item.foodId, grams: item.grams, meal,
        servingLabel: item.servingLabel ?? null, localDate: input.toDate, loggedAt: now,
      })),
      skipDuplicates: true,
    });
    return { applied: items.length, created: res.count };
  } catch (e) {
    if (isUniqueViolation(e)) return { applied: items.length, created: 0 };
    throw e;
  }
}

/* ---------------- Weekly debrief ---------------- */

const isMonday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 1;
const mondayOf = (iso: string) => shift(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));

const toDebrief = (r: { weekStart: string; body: string; metrics: unknown; createdAt: Date }): WeeklyDebriefDto => ({
  weekStart: r.weekStart, body: r.body, metrics: r.metrics as DebriefMetrics, createdAt: r.createdAt.toISOString(),
});

/** Numbers for one Monday–Sunday week (in the hunter's timezone game days). */
export async function gatherMetrics(prisma: PrismaClient, userId: string, weekStart: string): Promise<DebriefMetrics> {
  const weekEnd = shift(weekStart, 6);
  const range = { gte: weekStart, lte: weekEnd };
  const [workouts, xp, quests, state, prs, logs, target] = await Promise.all([
    prisma.workoutSession.count({ where: { userId, localDate: range, finishedAt: { not: null } } }),
    prisma.xpLedger.aggregate({ where: { userId, localDate: range }, _sum: { amount: true } }),
    prisma.questInstance.findMany({ where: { userId, localDate: range, kind: 'DAILY' } }),
    prisma.hunterState.findUnique({ where: { userId } }),
    prisma.personalRecord.count({ where: { userId, confirmed: true, achievedAt: { gte: new Date(`${weekStart}T00:00:00Z`), lte: new Date(`${shift(weekEnd, 1)}T00:00:00Z`) } } }),
    prisma.foodLog.findMany({ where: { userId, localDate: range }, include: { food: true } }),
    prisma.nutritionTarget.findFirst({ where: { userId, effectiveFrom: { lte: weekEnd } }, orderBy: { effectiveFrom: 'desc' } }),
  ]);

  const byDay = new Map<string, boolean>();
  for (const q of quests) byDay.set(q.localDate, (byDay.get(q.localDate) ?? true) && q.status === 'COMPLETED');
  const questDays = [...byDay.values()].filter(Boolean).length;

  const kcalByDay = new Map<string, number>();
  for (const l of logs) kcalByDay.set(l.localDate, (kcalByDay.get(l.localDate) ?? 0) + (l.food.kcal100 * l.grams) / 100);
  const loggedDays = [...kcalByDay.values()];
  const adherence =
    target && target.kcal > 0 && loggedDays.length
      ? Math.round((loggedDays.filter((k) => Math.abs(k - target.kcal) <= target.kcal * 0.15).length / loggedDays.length) * 100)
      : null;

  return {
    weekStart, weekEnd, workouts, xp: xp._sum.amount ?? 0, questDays, streak: state?.streak ?? 0, prs,
    nutritionDaysLogged: loggedDays.length, nutritionAdherencePct: adherence,
  };
}

/** Which week a request means: explicit Monday, or the last completed week. Unfinished weeks aren't debriefed (and aren't cached). */
async function resolveWeek(prisma: PrismaClient, userId: string, weekStart?: string) {
  const lastWeek = shift(mondayOf(await today(prisma, userId)), -7);
  const week = weekStart ?? lastWeek;
  if (!isMonday(week)) throw new DepthError(400, 'weekStart must be a Monday');
  if (week > lastWeek) throw new DepthError(409, 'that week is not over yet');
  return week;
}

export async function getDebrief(prisma: PrismaClient, deps: Deps, userId: string, weekStart?: string): Promise<WeeklyDebriefDto> {
  const week = await resolveWeek(prisma, userId, weekStart);
  const stored = await prisma.weeklyDebrief.findUnique({ where: { userId_weekStart: { userId, weekStart: week } } });
  return stored ? toDebrief(stored) : generateDebrief(prisma, deps, userId, week);
}

/** Generates (once) and caches the debrief; later calls return the stored one. Falls back to the template on any writer failure. */
export async function generateDebrief(prisma: PrismaClient, deps: Deps, userId: string, weekStart?: string): Promise<WeeklyDebriefDto> {
  const week = await resolveWeek(prisma, userId, weekStart);
  const stored = await prisma.weeklyDebrief.findUnique({ where: { userId_weekStart: { userId, weekStart: week } } });
  if (stored) return toDebrief(stored);

  const metrics = await gatherMetrics(prisma, userId, week);
  let body: string | undefined;
  if (deps.debriefWriter) body = (await deps.debriefWriter(metrics).catch(() => undefined))?.trim();
  if (!body) body = templateDebrief(metrics);
  try {
    return toDebrief(await prisma.weeklyDebrief.create({ data: { userId, weekStart: week, body, metrics } }));
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // a concurrent request won the race: return its debrief
    const winner = await prisma.weeklyDebrief.findUnique({ where: { userId_weekStart: { userId, weekStart: week } } });
    if (winner) return toDebrief(winner);
    throw e;
  }
}
