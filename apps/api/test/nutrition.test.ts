import { gameDate } from '@lb/engine';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { matches, USER, uuid } from './fakeDb';

const OTHER = '00000000-0000-4000-8000-0000000000ff';
const today = () => gameDate(new Date(), 'UTC');
const shift = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

/** In-memory Prisma double for the nutrition module. */
function nutritionDb(opts: { goal?: string; rate?: number; premium?: boolean } = {}) {
  const db = {
    profile: {
      id: USER, onboardedAt: new Date('2026-01-01'), birthDate: new Date('2001-01-10T00:00:00Z'), goal: opts.goal ?? 'cut', heightCm: 178, sex: 'male',
      timezone: 'UTC', ratePerWeek: opts.rate ?? -0.005, fatPreference: 'balanced', lifestyle: 'light', nutritionMode: 'full', checkInDay: 1,
      hideCalories: false, proteinOverrideG: null as number | null, fatOverrideG: null as number | null, daysPerWeek: 4, sessionMinutes: 60,
    } as any,
    metrics: [{ id: uuid(900), userId: USER, weightKg: 80, bodyFatPct: null, localDate: shift(today(), -40), measuredAt: new Date(Date.now() - 40 * 864e5) }] as any[],
    foods: [] as any[],
    logs: [] as any[],
    days: [] as any[],
    targets: [] as any[],
  };
  const withFood = (l: any) => ({ ...l, food: db.foods.find((f) => f.id === l.foodId) });
  const prisma: any = {
    profile: { findUnique: async () => db.profile, update: async ({ data }: any) => Object.assign(db.profile, data) },
    bodyMetric: {
      findMany: async ({ where }: any) => db.metrics.filter((m) => matches(m, where)).sort((a, b) => a.measuredAt - b.measuredAt),
      findUnique: async ({ where }: any) => db.metrics.find((m) => m.id === where.id) ?? null,
      create: async ({ data }: any) => db.metrics.push({ bodyFatPct: null, weightKg: null, ...data }),
      delete: async ({ where }: any) => { db.metrics = db.metrics.filter((m) => m.id !== where.id); },
    },
    food: {
      findUnique: async ({ where }: any) => db.foods.find((f) => (where.id ? f.id === where.id : f.barcode === where.barcode)) ?? null,
      findMany: async ({ where }: any) => db.foods.filter((f) => f.ownerId === USER || db.logs.some((l) => l.foodId === f.id && l.userId === USER)),
      create: async ({ data }: any) => db.foods.push({ brand: null, barcode: null, fiber100: null, ownerId: null, ...data }),
    },
    foodLog: {
      findMany: async ({ where, include }: any) => db.logs.filter((l) => matches(l, where)).map((l) => (include ? withFood(l) : l)),
      findUnique: async ({ where, include }: any) => { const l = db.logs.find((x) => x.id === where.id); return l ? (include ? withFood(l) : l) : null; },
      create: async ({ data }: any) => db.logs.push(data),
      createMany: async ({ data }: any) => db.logs.push(...data),
      update: async ({ where, data }: any) => Object.assign(db.logs.find((l) => l.id === where.id), data),
      delete: async ({ where }: any) => { db.logs = db.logs.filter((l) => l.id !== where.id); },
    },
    nutritionDay: {
      findMany: async ({ where }: any) => db.days.filter((d) => matches(d, where)),
      upsert: async ({ where, create, update }: any) => {
        const d = db.days.find((x) => x.userId === where.userId_localDate.userId && x.localDate === where.userId_localDate.localDate);
        if (d) Object.assign(d, update); else db.days.push({ markedComplete: false, lowDayConfirm: false, waterMl: 0, ...create });
      },
    },
    nutritionTarget: {
      findFirst: async () => [...db.targets].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0] ?? null,
      create: async ({ data }: any) => db.targets.push(data),
    },
    entitlement: { findFirst: async () => (opts.premium ? { id: 'e1' } : null) },
  };
  return { db, prisma };
}

const app = (prisma: any, lookupBarcode?: (code: string) => Promise<unknown>, paywallEnabled = false) =>
  createApp({ prisma, paywallEnabled, verifyToken: async () => ({ userId: USER }), lookupBarcode });
const call = (a: ReturnType<typeof app>, method: string, path: string, body?: unknown) =>
  a.request(path, { method, headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

const rice = { id: 'rice-white-cooked', name: 'tampered', per100: { kcal: 1, protein: 99, carbs: 0, fat: 0 }, servings: [{ label: 'x', grams: 1 }], source: 'usda', verified: true };
const log = (n: number, grams = 186, extra: Record<string, unknown> = {}) => ({
  id: uuid(n), food: rice, grams, meal: 'lunch', servingLabel: '1 cup', localDate: today(), loggedAt: new Date().toISOString(), ...extra,
});

describe('Nutrition API', () => {
  it('builds today’s targets from the real profile (SYSTEMS.md §2.6 numbers) and stores them for the week', async () => {
    const { db, prisma } = nutritionDb();
    const day = (await (await call(app(prisma), 'GET', '/nutrition/day')).json()) as any;
    expect(day.plan.kcal).toBe(2073);
    expect(day.plan.proteinG).toBe(160);
    expect(day.plan.calibrating).toBe(true);
    expect(db.targets).toHaveLength(1);
    await call(app(prisma), 'GET', '/nutrition/day');
    expect(db.targets).toHaveLength(1); // stable within the week
  });

  it('logs curated foods with trusted values (client cannot tamper), idempotently, and totals the day', async () => {
    const { db, prisma } = nutritionDb();
    const a = app(prisma);
    expect((await call(a, 'POST', '/nutrition/logs', log(1))).status).toBe(200);
    await call(a, 'POST', '/nutrition/logs', log(1)); // retry after a flaky network
    expect(db.logs).toHaveLength(1);
    expect(db.foods[0]).toMatchObject({ id: 'rice-white-cooked', kcal100: 130, verified: true });
    const day = (await (await call(a, 'GET', '/nutrition/day')).json()) as any;
    expect(day.totals.kcal).toBe(Math.round(130 * 1.86));
    expect(day.logs[0].food.name).toBe('Rice, white, cooked');
  });

  it('edits, moves, deletes and copies logs — only your own', async () => {
    const { db, prisma } = nutritionDb();
    const a = app(prisma);
    await call(a, 'POST', '/nutrition/logs', log(1));
    await call(a, 'PATCH', `/nutrition/logs/${uuid(1)}`, { grams: 93, meal: 'dinner' });
    expect(db.logs[0]).toMatchObject({ grams: 93, meal: 'dinner' });
    const copied = (await (await call(a, 'POST', '/nutrition/copy', { fromDate: today(), toDate: shift(today(), 1) })).json()) as any;
    expect(copied.copied).toBe(1);
    expect(db.logs.filter((l) => l.localDate === shift(today(), 1))).toHaveLength(1);
    db.logs.push({ id: uuid(77), userId: OTHER, foodId: 'rice-white-cooked', grams: 1, meal: 'lunch', localDate: today(), loggedAt: new Date() });
    expect((await call(a, 'DELETE', `/nutrition/logs/${uuid(77)}`)).status).toBe(404);
    expect((await call(a, 'DELETE', `/nutrition/logs/${uuid(1)}`)).status).toBe(200);
  });

  it('search ranks curated foods and your history; empty query returns your most-used foods', async () => {
    const { prisma } = nutritionDb();
    const a = app(prisma);
    const r = (await (await call(a, 'GET', '/nutrition/foods?q=chick')).json()) as any;
    expect(r.foods.slice(0, 5).map((f: any) => f.id)).toEqual(expect.arrayContaining(['chicken-breast-roasted', 'chickpeas-boiled']));
    const rice = (await (await call(a, 'GET', '/nutrition/foods?q=rice')).json()) as any;
    expect(rice.foods[0].id).toBe('rice-white-cooked');
    await call(a, 'POST', '/nutrition/logs', log(1));
    const recent = (await (await call(a, 'GET', '/nutrition/foods')).json()) as any;
    expect(recent.foods[0].id).toBe('rice-white-cooked');
  });

  it('barcode: Open Food Facts once, then cached for everyone', async () => {
    const { db, prisma } = nutritionDb();
    let calls = 0;
    const lookup = async () => {
      calls++;
      return { status: 1, product: { code: '5000112637922', product_name: 'Cola Zero', brands: 'Fizz', nutriments: { 'energy-kcal_100g': 0.3, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0 } } };
    };
    const a = app(prisma, lookup);
    const f = (await (await call(a, 'GET', '/nutrition/foods/barcode/5000112637922')).json()) as any;
    expect(f).toMatchObject({ id: 'off:5000112637922', source: 'off', verified: false, brand: 'Fizz' });
    await call(a, 'GET', '/nutrition/foods/barcode/5000112637922');
    expect(calls).toBe(1);
    expect(db.foods).toHaveLength(1);
    expect((await call(app(prisma, async () => ({ status: 0 })), 'GET', '/nutrition/foods/barcode/123456789')).status).toBe(404);
    expect((await call(a, 'GET', '/nutrition/foods/barcode/abc')).status).toBe(400);
  });

  it('custom foods are private to their owner', async () => {
    const { db, prisma } = nutritionDb();
    const shake = { id: `custom:${uuid(5)}`, name: 'My shake', per100: { kcal: 80, protein: 10, carbs: 6, fat: 1.5 }, servings: [{ label: '1 bottle', grams: 400 }], source: 'custom', verified: false };
    expect((await call(app(prisma), 'POST', '/nutrition/foods', shake)).status).toBe(200);
    expect(db.foods[0].ownerId).toBe(USER);
    db.foods[0].ownerId = OTHER;
    expect((await call(app(prisma), 'POST', '/nutrition/logs', { ...log(9), food: shake })).status).toBe(403);
    expect((await call(app(prisma), 'POST', '/nutrition/foods', { ...shake, id: 'shake' })).status).toBe(400);
  });

  it('weigh-ins feed the trend; water and complete flags save per day', async () => {
    const { db, prisma } = nutritionDb();
    const a = app(prisma);
    for (let d = 0; d < 6; d++) {
      await call(a, 'POST', '/nutrition/weigh-ins', { id: uuid(100 + d), weightKg: 80 - d * 0.1, localDate: shift(today(), -10 + d * 2), measuredAt: new Date().toISOString() });
    }
    const s = (await (await call(a, 'GET', '/nutrition/summary')).json()) as any;
    expect(s.weighIns.length).toBe(7);
    expect(s.weighIns.at(-1).trend).toBeLessThan(80);
    expect(s.checkIn.verdict).toBe('insufficient'); // no food logged yet → targets unchanged, no shaming
    expect(s.allowedRates).toEqual([-0.0025, -0.005, -0.0075, -0.01]); // BMI ≥ 25 → −1%/week is offered
    await call(a, 'POST', '/nutrition/day', { localDate: today(), waterMl: 1500, markedComplete: true });
    expect(db.days[0]).toMatchObject({ waterMl: 1500, markedComplete: true });
    expect((await call(a, 'DELETE', `/nutrition/weigh-ins/${uuid(100)}`)).status).toBe(200);
  });

  it('settings: any field editable, unsafe rates rejected, goal change applies immediately', async () => {
    const { db, prisma } = nutritionDb();
    const a = app(prisma);
    await call(a, 'GET', '/nutrition/day');
    const base = { goal: 'cut', ratePerWeek: -0.005, fatPreference: 'balanced', lifestyle: 'light', nutritionMode: 'full', bodyFatPct: null, checkInDay: 1, hideCalories: false, proteinOverrideG: null, fatOverrideG: null };
    expect((await call(a, 'PUT', '/nutrition/settings', { ...base, goal: 'bulk', ratePerWeek: -0.005 })).status).toBe(400); // a cut rate on a bulk goal
    const r = (await (await call(a, 'PUT', '/nutrition/settings', { ...base, goal: 'maintain', ratePerWeek: 0, proteinOverrideG: 180 })).json()) as any;
    expect(db.profile.goal).toBe('maintain');
    expect(r.plan.kcal).toBe(2513);
    expect(r.plan.proteinG).toBe(180);
    expect(db.targets).toHaveLength(2);
  });
});

describe('premium gate: adaptive TDEE (SYSTEMS.md §7.2)', () => {
  /** 28 days of eating ~2,100 kcal while losing 0.05 kg/day → observed TDEE ≈ 2,485 */
  const seed = (db: any) => {
    db.metrics = [];
    for (let d = 1; d <= 28; d++) {
      const date = shift(today(), -d);
      db.metrics.push({ id: uuid(2000 + d), userId: USER, weightKg: 80 - 0.05 * (28 - d), bodyFatPct: null, localDate: date, measuredAt: new Date(Date.parse(`${date}T07:00:00Z`)) });
      for (const meal of ['breakfast', 'lunch', 'dinner']) db.logs.push({ id: `${d}-${meal}`, userId: USER, foodId: 'rice-white-cooked', grams: 538, meal, localDate: date, loggedAt: new Date() });
    }
    db.foods.push({ id: 'rice-white-cooked', name: 'Rice', kcal100: 130, p100: 2.4, c100: 28.6, f100: 0.2, fiber100: 0.3, servings: [], source: 'usda', verified: true, ownerId: null, brand: null, barcode: null });
  };
  it('everything stays open while the paywall is off', async () => {
    const { db, prisma } = nutritionDb();
    seed(db);
    const day = (await (await call(app(prisma), 'GET', '/nutrition/day')).json()) as any;
    expect(day.plan.calibrating).toBe(false);
  });
  it('paywall on: free users get formula targets, premium users get adaptive learning', async () => {
    const free = nutritionDb();
    seed(free.db);
    const f = (await (await call(app(free.prisma, undefined, true), 'GET', '/nutrition/day')).json()) as any;
    expect(f.plan.calibrating).toBe(true);
    expect(f.plan.tdee).toBe(f.plan.prior);
    const prem = nutritionDb({ premium: true });
    seed(prem.db);
    const p = (await (await call(app(prem.prisma, undefined, true), 'GET', '/nutrition/day')).json()) as any;
    expect(p.plan.calibrating).toBe(false);
    expect(p.plan.tdee).not.toBe(p.plan.prior);
  });
});
