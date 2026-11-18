/**
 * Nutrition ("Mana") — SYSTEMS.md §2. Diary, foods, weigh-ins, weekly targets and the check-in.
 * All maths lives in @lb/engine so the offline app computes identical numbers.
 */
import { createHash } from 'node:crypto';
import { curatedFoodById, curatedFoods, normalizeOffProduct, offProductUrl, OFF_USER_AGENT } from '@lb/content';
import type {
  CopyInput, DayFlagsInput, FoodDto, FoodLogDto, FoodLogInput, FoodLogPatch, Meal, NutritionDayResponse, NutritionPlanDto,
  NutritionSettings, NutritionSummaryResponse, Totals, WeighInInput,
} from '@lb/contracts';
import type { PrismaClient } from '@lb/db';
import {
  ageOn, allowedRates, bmi, computeTrend, gameDate, nutrientsForGrams, rankFoods, weeklyCheckIn, weeklyTargets,
  type IntakeDay, type NutritionProfileInput, type PersonalUse, type StoredTarget, type WeighIn,
} from '@lb/engine';

export class NutritionError extends Error {
  constructor(public status: 400 | 403 | 404 | 409, message: string) {
    super(message);
  }
}

const DAY = 86_400_000;
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;

async function loadProfile(prisma: PrismaClient, userId: string) {
  const p = await prisma.profile.findUnique({ where: { id: userId } });
  if (!p?.onboardedAt || !p.birthDate || !p.goal || p.heightCm == null) throw new NutritionError(409, 'finish onboarding first');
  return p;
}
type Profile = Awaited<ReturnType<typeof loadProfile>>;

function settingsOf(p: Profile, bodyFatPct: number | null): NutritionSettings {
  return {
    goal: p.goal as NutritionSettings['goal'], ratePerWeek: p.ratePerWeek, fatPreference: p.fatPreference as NutritionSettings['fatPreference'],
    lifestyle: (p.lifestyle ?? 'light') as NutritionSettings['lifestyle'], nutritionMode: p.nutritionMode as NutritionSettings['nutritionMode'],
    bodyFatPct, checkInDay: p.checkInDay, hideCalories: p.hideCalories, proteinOverrideG: p.proteinOverrideG, fatOverrideG: p.fatOverrideG,
  };
}

function foodOf(row: { id: string; name: string; brand: string | null; kcal100: number; p100: number; c100: number; f100: number; fiber100: number | null; servings: unknown; source: string; verified: boolean; barcode: string | null }): FoodDto {
  const curated = curatedFoodById.get(row.id);
  if (curated) return { ...curated, brand: null, barcode: null };
  return {
    id: row.id, name: row.name, brand: row.brand,
    per100: { kcal: row.kcal100, protein: row.p100, carbs: row.c100, fat: row.f100, ...(row.fiber100 != null ? { fiber: row.fiber100 } : {}) },
    servings: Array.isArray(row.servings) ? (row.servings as FoodDto['servings']) : [], source: row.source as FoodDto['source'],
    verified: row.verified, barcode: row.barcode,
  };
}

const totalsOf = (logs: readonly { food: FoodDto; grams: number }[]): Totals => {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const l of logs) {
    const n = nutrientsForGrams(l.food.per100, l.grams);
    t.kcal += n.kcal; t.protein += n.protein; t.carbs += n.carbs; t.fat += n.fat; t.fiber += n.fiber ?? 0;
  }
  return { kcal: Math.round(t.kcal), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat), fiber: round1(t.fiber) };
};

/** Hours trained on a game day (water target +0.5 L/h, §2.5). */
async function trainingHoursOn(prisma: PrismaClient, userId: string, localDate: string) {
  const rows = await prisma.workoutSession.findMany({ where: { userId, localDate }, select: { kind: true, startedAt: true, finishedAt: true, cardioMinutes: true } });
  const minutes = rows.reduce(
    (m, r) => m + (r.kind === 'manual' ? r.cardioMinutes : r.finishedAt ? Math.min(360, (r.finishedAt.getTime() - r.startedAt.getTime()) / 60000) : 0),
    0,
  );
  return Math.round((minutes / 60) * 4) / 4;
}

/** Deterministic uuid (v5-style, sha1) so a retried copy re-derives the same row ids. */
function uuidFrom(key: string) {
  const h = createHash('sha1').update(`limitbreak:${key}`).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/** Everything the planner needs, loaded once. */
async function context(prisma: PrismaClient, userId: string) {
  const p = await loadProfile(prisma, userId);
  const today = gameDate(new Date(), p.timezone);
  const from = shift(today, -180);
  const [metrics, logs, flags, latest] = await Promise.all([
    prisma.bodyMetric.findMany({ where: { userId, localDate: { gte: from } }, orderBy: { measuredAt: 'asc' } }),
    prisma.foodLog.findMany({ where: { userId, localDate: { gte: from } }, include: { food: true } }),
    prisma.nutritionDay.findMany({ where: { userId, localDate: { gte: from } } }),
    prisma.nutritionTarget.findFirst({ where: { userId }, orderBy: { effectiveFrom: 'desc' } }),
  ]);
  const weighIns: (WeighIn & { id: string })[] = metrics.filter((m) => m.weightKg != null).map((m) => ({ id: m.id, date: m.localDate, kg: m.weightKg! }));
  const bodyFatPct = [...metrics].reverse().find((m) => m.bodyFatPct != null)?.bodyFatPct ?? null;
  const byDay = new Map<string, { kcal: number; meals: Set<string> }>();
  for (const l of logs) {
    const d = byDay.get(l.localDate) ?? { kcal: 0, meals: new Set<string>() };
    d.kcal += nutrientsForGrams(foodOf(l.food).per100, l.grams).kcal;
    d.meals.add(l.meal);
    byDay.set(l.localDate, d);
  }
  const complete = new Map(flags.map((f) => [f.localDate, f]));
  const intake: IntakeDay[] = [...byDay].filter(([date]) => date < today).map(([date, d]) => ({
    date, kcal: d.kcal, meals: d.meals.size, markedComplete: complete.get(date)?.markedComplete ?? false, lowDayConfirmed: complete.get(date)?.lowDayConfirm ?? false,
  }));
  const settings = settingsOf(p, bodyFatPct);
  const profile: NutritionProfileInput = {
    sex: (p.sex ?? 'unspecified') as NutritionProfileInput['sex'], birthDate: p.birthDate!.toISOString().slice(0, 10), heightCm: p.heightCm!,
    weightKg: weighIns.at(-1)?.kg ?? 75, bodyFatPct, lifestyle: settings.lifestyle, goal: settings.goal, ratePerWeek: settings.ratePerWeek,
    fatPreference: settings.fatPreference,
    weeklySessions: Array.from({ length: p.daysPerWeek ?? 3 }, () => ({ kind: 'strength' as const, minutes: p.sessionMinutes ?? 45 })),
  };
  return { p, today, weighIns, intake, settings, profile, latest, logs, flags };
}

/** Weekly-stable targets; stores a new NutritionTarget when the week (or the goal) changes. */
/** `adaptive` = premium feature `adaptiveTdee`: without it, targets use the standard formula (no intake learning). */
async function planFor(prisma: PrismaClient, userId: string, c: Awaited<ReturnType<typeof context>>, adaptive = true, trainingHoursToday = 0): Promise<NutritionPlanDto> {
  const latest: StoredTarget | null = c.latest
    ? { effectiveFrom: c.latest.effectiveFrom, kcal: c.latest.kcal, proteinG: c.latest.proteinG, fatG: c.latest.fatG, carbsG: c.latest.carbsG, fiberG: c.latest.fiberG, goal: c.latest.goal as StoredTarget['goal'], ratePerWeek: c.latest.ratePerWeek }
    : null;
  const r = weeklyTargets({ profile: c.profile, weighIns: c.weighIns, intake: adaptive ? c.intake : [], today: c.today, latest, override: { proteinG: c.settings.proteinOverrideG, fatG: c.settings.fatOverrideG }, trainingHoursToday });
  if (r.store) {
    const m = r.plan.macros;
    await prisma.nutritionTarget.create({
      data: { userId, effectiveFrom: c.today, kcal: r.plan.target.kcal, proteinG: m.proteinG, fatG: m.fatG, carbsG: m.carbsG, fiberG: m.fiberG, goal: c.settings.goal, ratePerWeek: c.settings.ratePerWeek },
    });
  }
  const m = r.macros;
  return {
    kcal: Math.round(m.kcal), proteinG: Math.round(m.proteinG), fatG: Math.round(m.fatG), carbsG: Math.round(m.carbsG), fiberG: Math.round(m.fiberG), waterMl: Math.round(m.waterMl / 50) * 50,
    tdee: Math.round(r.plan.tdee), prior: Math.round(r.plan.prior), bmr: Math.round(r.plan.bmr), trendKg: round1(r.plan.trendKg),
    confidence: Math.round(r.plan.confidence * 100) / 100, calibrating: r.plan.calibrating, validDays: r.plan.validDays,
    rails: r.plan.target.appliedRails, effectiveFrom: r.effectiveFrom, lowIntake: r.plan.lowIntake,
  };
}

export async function getDay(prisma: PrismaClient, userId: string, date?: string, adaptive = true): Promise<NutritionDayResponse> {
  const c = await context(prisma, userId);
  const day = date ?? c.today;
  const logs: FoodLogDto[] = c.logs
    .filter((l) => l.localDate === day)
    .sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime())
    .map((l) => ({ id: l.id, food: foodOf(l.food), grams: l.grams, meal: l.meal as Meal, servingLabel: l.servingLabel, localDate: l.localDate, loggedAt: l.loggedAt.toISOString() }));
  const flags = c.flags.find((f) => f.localDate === day);
  const plan = await planFor(prisma, userId, c, adaptive, await trainingHoursOn(prisma, userId, day));
  return {
    date: day, logs, waterMl: flags?.waterMl ?? 0, markedComplete: flags?.markedComplete ?? false, lowDayConfirm: flags?.lowDayConfirm ?? false,
    totals: totalsOf(logs), plan, settings: c.settings,
  };
}

/** Curated foods come from content (trusted); OFF foods are shared; custom/quick foods stay private. */
async function upsertFood(prisma: PrismaClient, userId: string, f: FoodDto) {
  const curated = curatedFoodById.get(f.id);
  const src = curated ?? f;
  if (!curated && f.source !== 'off' && f.source !== 'custom' && f.source !== 'quick') throw new NutritionError(400, 'unknown curated food');
  const existing = await prisma.food.findUnique({ where: { id: src.id } });
  if (existing) {
    if (existing.ownerId && existing.ownerId !== userId) throw new NutritionError(403, 'not your food');
    // the owner edited their custom/quick food: keep the stored row in sync (shared OFF/curated rows never change here)
    if (existing.ownerId === userId && !curated) {
      await prisma.food.update({
        where: { id: src.id },
        data: {
          name: src.name, brand: src.brand ?? null, kcal100: src.per100.kcal, p100: src.per100.protein, c100: src.per100.carbs, f100: src.per100.fat,
          fiber100: src.per100.fiber ?? null, servings: src.servings,
        },
      });
    }
    return;
  }
  await prisma.food.create({
    data: {
      id: src.id, source: src.source, name: src.name, brand: src.brand ?? null, barcode: src.barcode ?? null,
      kcal100: src.per100.kcal, p100: src.per100.protein, c100: src.per100.carbs, f100: src.per100.fat, fiber100: src.per100.fiber ?? null,
      servings: src.servings, verified: curated ? true : false, ownerId: src.source === 'custom' || src.source === 'quick' ? userId : null,
    },
  });
}

export async function addLog(prisma: PrismaClient, userId: string, input: FoodLogInput): Promise<FoodLogDto> {
  const dupe = await prisma.foodLog.findUnique({ where: { id: input.id }, include: { food: true } });
  if (dupe) {
    if (dupe.userId !== userId) throw new NutritionError(409, 'id already used');
    return { id: dupe.id, food: foodOf(dupe.food), grams: dupe.grams, meal: dupe.meal as Meal, servingLabel: dupe.servingLabel, localDate: dupe.localDate, loggedAt: dupe.loggedAt.toISOString() };
  }
  await upsertFood(prisma, userId, input.food);
  await prisma.foodLog.create({
    data: { id: input.id, userId, foodId: input.food.id, grams: input.grams, meal: input.meal, servingLabel: input.servingLabel ?? null, localDate: input.localDate, loggedAt: new Date(input.loggedAt) },
  });
  return { ...input, food: curatedFoodById.get(input.food.id) ? { ...curatedFoodById.get(input.food.id)!, brand: null, barcode: null } : input.food };
}

async function ownLog(prisma: PrismaClient, userId: string, id: string) {
  const log = await prisma.foodLog.findUnique({ where: { id } });
  if (!log || log.userId !== userId) throw new NutritionError(404, 'log not found');
  return log;
}

export async function patchLog(prisma: PrismaClient, userId: string, id: string, patch: FoodLogPatch) {
  await ownLog(prisma, userId, id);
  await prisma.foodLog.update({ where: { id }, data: { ...(patch.grams != null ? { grams: patch.grams } : {}), ...(patch.meal ? { meal: patch.meal } : {}), ...(patch.servingLabel !== undefined ? { servingLabel: patch.servingLabel } : {}) } });
  return { ok: true };
}

export async function deleteLog(prisma: PrismaClient, userId: string, id: string) {
  await ownLog(prisma, userId, id);
  await prisma.foodLog.delete({ where: { id } });
  return { ok: true };
}

/**
 * Copy a whole day or one meal to another day (logged now). Idempotent by copyId: each new row id is derived
 * from (copyId, source row id), so a retried request inserts nothing twice.
 */
export async function copyLogs(prisma: PrismaClient, userId: string, input: CopyInput) {
  const src = await prisma.foodLog.findMany({ where: { userId, localDate: input.fromDate, ...(input.meal ? { meal: input.meal } : {}) } });
  if (!src.length) throw new NutritionError(404, 'nothing to copy');
  const now = new Date();
  const copyId = input.copyId ?? crypto.randomUUID();
  // never copy rows an earlier run of this same copy created (copying a day onto itself)
  const rows = src.filter((l) => !src.some((o) => uuidFrom(`copy:${userId}:${copyId}:${o.id}`) === l.id));
  await prisma.foodLog.createMany({
    data: rows.map((l) => ({
      id: uuidFrom(`copy:${userId}:${copyId}:${l.id}`), userId, foodId: l.foodId, grams: l.grams, meal: l.meal, servingLabel: l.servingLabel, localDate: input.toDate, loggedAt: now,
    })),
    skipDuplicates: true,
  });
  return { copied: rows.length };
}

export async function searchFoods(prisma: PrismaClient, userId: string, q: string): Promise<FoodDto[]> {
  const since = shift(gameDate(new Date(), 'UTC'), -90);
  const [mine, recent] = await Promise.all([
    prisma.food.findMany({ where: { OR: [{ ownerId: userId }, { logs: { some: { userId } } }] }, take: 500 }),
    prisma.foodLog.findMany({ where: { userId, localDate: { gte: since } }, select: { foodId: true, localDate: true } }),
  ]);
  const personal = new Map<string, PersonalUse>();
  const todayMs = Date.now();
  for (const r of recent) {
    const u = personal.get(r.foodId) ?? { count: 0, daysSinceLast: 999 };
    u.count++;
    u.daysSinceLast = Math.min(u.daysSinceLast, Math.floor((todayMs - Date.parse(`${r.localDate}T00:00:00Z`)) / DAY));
    personal.set(r.foodId, u);
  }
  const pool = new Map<string, FoodDto>(curatedFoods.map((f) => [f.id, { ...f, brand: null, barcode: null }]));
  for (const f of mine) if (!pool.has(f.id)) pool.set(f.id, foodOf(f));
  const all = [...pool.values()];
  if (!q.trim()) {
    // no query: your most-used foods first (≤ 3 taps to re-log)
    return all.filter((f) => personal.has(f.id)).sort((a, b) => personal.get(b.id)!.count - personal.get(a.id)!.count).slice(0, 20);
  }
  return rankFoods(q, all, personal, 30);
}

const defaultLookup = async (barcode: string) => {
  const res = await fetch(offProductUrl(barcode), { headers: { 'User-Agent': OFF_USER_AGENT } });
  return res.ok ? res.json() : null;
};

/** Barcode → cached food, else Open Food Facts (cached for everyone; ODbL attribution shown in the app). */
export async function lookupBarcode(prisma: PrismaClient, barcode: string, lookup = defaultLookup): Promise<FoodDto> {
  if (!/^\d{6,14}$/.test(barcode)) throw new NutritionError(400, 'invalid barcode');
  const cached = await prisma.food.findUnique({ where: { barcode } });
  if (cached) return foodOf(cached);
  const food = normalizeOffProduct(await lookup(barcode));
  if (!food) throw new NutritionError(404, 'product not found or label incomplete');
  await prisma.food.create({
    data: {
      id: food.id, source: 'off', name: food.name, brand: food.brand ?? null, barcode, kcal100: food.per100.kcal, p100: food.per100.protein,
      c100: food.per100.carbs, f100: food.per100.fat, fiber100: food.per100.fiber ?? null, servings: food.servings, verified: false,
    },
  });
  return { ...food, brand: food.brand ?? null, barcode };
}

export async function createFood(prisma: PrismaClient, userId: string, food: FoodDto): Promise<FoodDto> {
  if (food.source !== 'custom' && food.source !== 'quick') throw new NutritionError(400, 'only custom or quick foods can be created');
  if (!food.id.startsWith(`${food.source}:`)) throw new NutritionError(400, 'custom food ids are prefixed with their source');
  await upsertFood(prisma, userId, food);
  return food;
}

export async function addWeighIn(prisma: PrismaClient, userId: string, w: WeighInInput) {
  const existing = await prisma.bodyMetric.findUnique({ where: { id: w.id } });
  if (existing) {
    if (existing.userId !== userId) throw new NutritionError(409, 'id already used');
    return { ok: true };
  }
  await prisma.bodyMetric.create({ data: { id: w.id, userId, weightKg: w.weightKg, localDate: w.localDate, measuredAt: new Date(w.measuredAt), source: 'manual' } });
  return { ok: true };
}

export async function deleteWeighIn(prisma: PrismaClient, userId: string, id: string) {
  const m = await prisma.bodyMetric.findUnique({ where: { id } });
  if (!m || m.userId !== userId) throw new NutritionError(404, 'weigh-in not found');
  await prisma.bodyMetric.delete({ where: { id } });
  return { ok: true };
}

export async function setDayFlags(prisma: PrismaClient, userId: string, input: DayFlagsInput) {
  const data = {
    ...(input.waterMl != null ? { waterMl: input.waterMl } : {}),
    ...(input.markedComplete != null ? { markedComplete: input.markedComplete } : {}),
    ...(input.lowDayConfirm != null ? { lowDayConfirm: input.lowDayConfirm } : {}),
  };
  await prisma.nutritionDay.upsert({ where: { userId_localDate: { userId, localDate: input.localDate } }, create: { userId, localDate: input.localDate, ...data }, update: data });
  return { ok: true };
}

export async function getSummary(prisma: PrismaClient, userId: string, adaptive = true): Promise<NutritionSummaryResponse> {
  const c = await context(prisma, userId);
  const plan = await planFor(prisma, userId, c, adaptive, await trainingHoursOn(prisma, userId, c.today));
  const trend = computeTrend(c.weighIns);
  const ids = new Map(c.weighIns.map((w) => [w.date, w.id]));
  const age = ageOn(c.profile.birthDate, c.today);
  return {
    plan,
    settings: c.settings,
    weighIns: trend.slice(-90).map((t) => ({ id: ids.get(t.date) ?? t.date, date: t.date, kg: t.kg, trend: round1(t.trend) })),
    checkIn: weeklyCheckIn({ intake: c.intake, weighIns: c.weighIns, kcalTarget: plan.kcal, goal: c.settings.goal, ratePerWeek: c.settings.ratePerWeek, trendKg: plan.trendKg, today: c.today }),
    allowedRates: allowedRates(c.settings.goal, { bmi: bmi(plan.trendKg, c.profile.heightCm), ageYears: age }),
  };
}

/** Settings are editable any time; the rate must be one the engine allows for this goal (safety rails). */
export async function updateSettings(prisma: PrismaClient, userId: string, s: NutritionSettings, adaptive = true) {
  const c = await context(prisma, userId);
  const age = ageOn(c.profile.birthDate, c.today);
  const rates = allowedRates(s.goal, { bmi: bmi(c.weighIns.at(-1)?.kg ?? c.profile.weightKg, c.profile.heightCm), ageYears: age });
  if (!rates.some((r) => Math.abs(r - s.ratePerWeek) < 1e-9)) throw new NutritionError(400, `rate not allowed for ${s.goal}`);
  await prisma.profile.update({
    where: { id: userId },
    data: { goal: s.goal, ratePerWeek: s.ratePerWeek, fatPreference: s.fatPreference, lifestyle: s.lifestyle, nutritionMode: s.nutritionMode, checkInDay: s.checkInDay, hideCalories: s.hideCalories, proteinOverrideG: s.proteinOverrideG, fatOverrideG: s.fatOverrideG },
  });
  if (s.bodyFatPct !== c.settings.bodyFatPct && s.bodyFatPct != null) {
    await prisma.bodyMetric.create({ data: { id: crypto.randomUUID(), userId, bodyFatPct: s.bodyFatPct, localDate: c.today, measuredAt: new Date(), source: 'manual' } });
  }
  return getSummary(prisma, userId, adaptive);
}
