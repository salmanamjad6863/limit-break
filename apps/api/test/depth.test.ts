import { gameDate } from '@lb/engine';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { templateDebrief } from '../src/modules/depth/debrief';
import { matches, USER, uuid } from './fakeDb';

const OTHER = '00000000-0000-4000-8000-0000000000ff';
const DAY = 86_400_000;
const shift = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * DAY).toISOString().slice(0, 10);
const today = () => gameDate(new Date(), 'UTC');
const mondayOf = (iso: string) => shift(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));
const lastMonday = () => shift(mondayOf(today()), -7);

const createdOf = (data: any) => ({ createdAt: new Date(), updatedAt: new Date(), ...data });

/** In-memory Prisma double for the depth module. */
function depthDb() {
  const db = {
    metrics: [] as any[],
    photos: [] as any[],
    templates: [] as any[],
    foods: [] as any[],
    logs: [] as any[],
    debriefs: [] as any[],
    sessions: [] as any[],
    ledger: [] as any[],
    quests: [] as any[],
    records: [] as any[],
    targets: [] as any[],
    state: { userId: USER, streak: 4 } as any,
  };
  const sortBy = (rows: any[], orderBy?: Record<string, 'asc' | 'desc'>) => {
    if (!orderBy) return [...rows];
    const [[k, dir]] = Object.entries(orderBy) as [[string, 'asc' | 'desc']];
    return [...rows].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (dir === 'asc' ? 1 : -1));
  };
  const crud = (rows: any[], defaults: (d: any) => any = (d) => d) => ({
    findUnique: async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null,
    findFirst: async ({ where, orderBy }: any = {}) => sortBy(rows.filter((r) => matches(r, where)), orderBy)[0] ?? null,
    findMany: async ({ where, orderBy, take }: any = {}) => sortBy(rows.filter((r) => matches(r, where)), orderBy).slice(0, take ?? 1e9),
    count: async ({ where }: any = {}) => rows.filter((r) => matches(r, where)).length,
    create: async ({ data }: any) => {
      const row = defaults(data);
      rows.push(row);
      return row;
    },
    update: async ({ where, data }: any) => Object.assign(rows.find((r) => r.id === where.id), data, { updatedAt: new Date() }),
    delete: async ({ where }: any) => {
      rows.splice(rows.findIndex((r) => r.id === where.id), 1);
    },
  });
  const prisma: any = {
    profile: { findUnique: async () => ({ id: USER, timezone: 'UTC' }) },
    bodyMetric: crud(db.metrics, (d) => ({ weightKg: null, waistCm: null, chestCm: null, armCm: null, hipCm: null, ...d })),
    progressPhoto: crud(db.photos, (d) => ({ note: null, ...createdOf(d) })),
    mealTemplate: crud(db.templates, createdOf),
    food: {
      findUnique: async ({ where }: any) => db.foods.find((f) => f.id === where.id) ?? null,
      findMany: async ({ where }: any) => db.foods.filter((f) => where.id.in.includes(f.id)),
      create: async ({ data }: any) => db.foods.push({ brand: null, barcode: null, fiber100: null, ownerId: null, ...data }),
      update: async ({ where, data }: any) => Object.assign(db.foods.find((f) => f.id === where.id), data),
    },
    foodLog: {
      findMany: async ({ where, include }: any) => db.logs.filter((l) => matches(l, where)).map((l) => (include ? { ...l, food: db.foods.find((f) => f.id === l.foodId) } : l)),
      createMany: async ({ data, skipDuplicates }: any) => {
        let count = 0;
        for (const d of data) {
          if (db.logs.some((l) => l.id === d.id)) {
            if (skipDuplicates) continue;
            throw Object.assign(new Error('unique'), { code: 'P2002' });
          }
          db.logs.push(d);
          count++;
        }
        return { count };
      },
    },
    weeklyDebrief: {
      findUnique: async ({ where }: any) => db.debriefs.find((d) => d.userId === where.userId_weekStart.userId && d.weekStart === where.userId_weekStart.weekStart) ?? null,
      create: async ({ data }: any) => {
        if (db.debriefs.some((d) => d.userId === data.userId && d.weekStart === data.weekStart)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        const row = { id: uuid(500 + db.debriefs.length), createdAt: new Date(), ...data };
        db.debriefs.push(row);
        return row;
      },
    },
    workoutSession: { count: async ({ where }: any) => db.sessions.filter((s) => matches(s, where)).length },
    xpLedger: { aggregate: async ({ where }: any) => ({ _sum: { amount: db.ledger.filter((l) => matches(l, where)).reduce((s, l) => s + l.amount, 0) } }) },
    questInstance: { findMany: async ({ where }: any) => db.quests.filter((q) => matches(q, where)) },
    hunterState: { findUnique: async () => db.state },
    personalRecord: { count: async ({ where }: any) => db.records.filter((r) => matches(r, { userId: where.userId, confirmed: where.confirmed, achievedAt: where.achievedAt })).length },
    nutritionTarget: { findFirst: async () => db.targets[0] ?? null },
  };
  return { db, prisma };
}

const storage = () => ({
  signUpload: vi.fn(async (bucket: string, path: string) => `https://storage.test/upload/${bucket}/${path}?token=t`),
  signRead: vi.fn(async (bucket: string, path: string) => `https://storage.test/read/${bucket}/${path}?token=t`),
  remove: vi.fn(async () => undefined),
});

const app = (prisma: any, extra: Record<string, unknown> = {}) => createApp({ prisma, paywallEnabled: false, verifyToken: async () => ({ userId: USER }), ...extra });
const call = (a: ReturnType<typeof app>, method: string, path: string, body?: unknown) =>
  a.request(path, { method, headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

describe('Depth: measurements', () => {
  it('upserts by id, only touching provided fields, and keeps an existing weight', async () => {
    const { db, prisma } = depthDb();
    db.metrics.push({ id: uuid(1), userId: USER, localDate: today(), measuredAt: new Date(), weightKg: 80, waistCm: null, chestCm: null, armCm: null, hipCm: null });
    const a = app(prisma);
    expect((await call(a, 'POST', '/depth/measurements', { id: uuid(1), localDate: today(), waistCm: 84.5, note: 'ignored' })).status).toBe(200);
    expect(db.metrics).toHaveLength(1);
    expect(db.metrics[0]).toMatchObject({ weightKg: 80, waistCm: 84.5, chestCm: null });
    const res = await call(a, 'POST', '/depth/measurements', { id: uuid(1), localDate: today(), chestCm: 101 });
    expect(db.metrics).toHaveLength(1);
    expect(db.metrics[0]).toMatchObject({ waistCm: 84.5, chestCm: 101 });
    expect((await res.json()) as any).toMatchObject({ weightKg: 80, waistCm: 84.5, chestCm: 101, armCm: null });
    // a new id creates a row
    await call(a, 'POST', '/depth/measurements', { id: uuid(2), localDate: today(), armCm: 38 });
    expect(db.metrics).toHaveLength(2);
    expect(db.metrics[1]).toMatchObject({ userId: USER, armCm: 38, source: 'manual' });
  });

  it('rejects empty/out-of-range bodies and someone else’s id', async () => {
    const { db, prisma } = depthDb();
    db.metrics.push({ id: uuid(9), userId: OTHER, localDate: today(), measuredAt: new Date(), weightKg: null });
    const a = app(prisma);
    expect((await call(a, 'POST', '/depth/measurements', { id: uuid(3), localDate: today() })).status).toBe(400);
    expect((await call(a, 'POST', '/depth/measurements', { id: uuid(3), localDate: today(), armCm: 500 })).status).toBe(400);
    expect((await call(a, 'POST', '/depth/measurements', { id: uuid(9), localDate: today(), waistCm: 80 })).status).toBe(409);
    expect(db.metrics).toHaveLength(1);
  });

  it('lists the last 90 days with one trend series per metric', async () => {
    const { db, prisma } = depthDb();
    const row = (n: number, ago: number, f: Record<string, number | null>) => ({
      id: uuid(n), userId: USER, localDate: shift(today(), -ago), measuredAt: new Date(Date.now() - ago * DAY), weightKg: null, waistCm: null, chestCm: null, armCm: null, hipCm: null, ...f,
    });
    db.metrics.push(row(1, 120, { waistCm: 99 }), row(2, 30, { waistCm: 90, weightKg: 82 }), row(3, 5, { waistCm: 88, chestCm: 100 }), row(4, 2, {}), row(5, 1, { weightKg: 81 }));
    db.metrics.push({ ...row(6, 1, { waistCm: 1 }), userId: OTHER });
    const body = (await (await call(app(prisma), 'GET', '/depth/measurements')).json()) as any;
    expect(body.measurements.map((m: any) => m.id)).toEqual([uuid(2), uuid(3), uuid(5)]);
    expect(body.series.waist.map((p: any) => p.value)).toEqual([90, 88]);
    expect(body.series.chest).toEqual([{ localDate: shift(today(), -5), value: 100 }]);
    expect(body.series.weight.map((p: any) => p.value)).toEqual([82, 81]);
    expect(body.series.arm).toEqual([]);
  });
});

describe('Depth: progress photos', () => {
  const photo = (n: number, over: Record<string, unknown> = {}) => ({
    id: uuid(n), localDate: today(), kind: 'progress', storageKey: `progress/${USER}/${uuid(n)}.jpg`, width: 1080, height: 1440, ...over,
  });

  it('signs an upload at progress/{userId}/{id}.jpg in the private bucket; 503 without storage', async () => {
    const st = storage();
    const { prisma } = depthDb();
    const res = (await (await call(app(prisma, { storage: st }), 'POST', '/depth/photos/sign', { id: uuid(1) })).json()) as any;
    expect(st.signUpload).toHaveBeenCalledWith('progress-photos', `progress/${USER}/${uuid(1)}.jpg`);
    expect(res).toMatchObject({ id: uuid(1), storageKey: `progress/${USER}/${uuid(1)}.jpg` });
    expect((await call(app(prisma), 'POST', '/depth/photos/sign', { id: uuid(1) })).status).toBe(503);
    expect((await call(app(prisma, { storage: st }), 'POST', '/depth/photos/sign', { id: 'nope' })).status).toBe(400);
  });

  it('only accepts the derived storage key: no other user’s path, no other id, no traversal', async () => {
    const { db, prisma } = depthDb();
    const a = app(prisma, { storage: storage() });
    for (const storageKey of [
      `progress/${OTHER}/${uuid(1)}.jpg`, `progress/${USER}/${uuid(2)}.jpg`, `community/${USER}/${uuid(1)}.jpg`,
      `progress/${USER}/../${OTHER}/${uuid(1)}.jpg`, `progress/${USER}/${uuid(1)}.png`, uuid(1),
    ]) {
      expect((await call(a, 'POST', '/depth/photos', photo(1, { storageKey }))).status).toBe(400);
    }
    expect(db.photos).toHaveLength(0);
    const ok = await call(a, 'POST', '/depth/photos', photo(1, { note: ' day one ' }));
    expect(ok.status).toBe(200);
    expect((await ok.json()) as any).toMatchObject({ id: uuid(1), kind: 'progress', note: 'day one', url: expect.stringContaining('progress-photos') });
    // retry = same photo, no duplicate; someone else's id = 409
    expect((await call(a, 'POST', '/depth/photos', photo(1))).status).toBe(200);
    expect(db.photos).toHaveLength(1);
    db.photos.push({ ...photo(7), userId: OTHER, takenAt: new Date() });
    expect((await call(a, 'POST', '/depth/photos', photo(7))).status).toBe(409);
  });

  it('lists by kind and builds the awakening pair (tagged first, else two latest progress shots)', async () => {
    const { db, prisma } = depthDb();
    const a = app(prisma, { storage: storage() });
    const at = (n: number, daysAgo: number, kind: string) => ({ ...photo(n, { kind }), userId: USER, takenAt: new Date(Date.now() - daysAgo * DAY), createdAt: new Date() });
    db.photos.push(at(1, 100, 'before'), at(2, 90, 'before'), at(3, 10, 'after'), at(4, 1, 'after'), at(5, 50, 'progress'), at(6, 20, 'progress'), at(7, 5, 'progress'));
    db.photos.push({ ...at(8, 200, 'before'), userId: OTHER });
    expect(((await (await call(a, 'GET', '/depth/photos?kind=before')).json()) as any).photos.map((p: any) => p.id)).toEqual([uuid(2), uuid(1)]);
    expect((await call(a, 'GET', '/depth/photos?kind=nonsense')).status).toBe(400);
    const tagged = (await (await call(a, 'GET', '/depth/photos/awakening')).json()) as any;
    expect(tagged).toMatchObject({ source: 'tagged', before: { id: uuid(1) }, after: { id: uuid(4) } });

    db.photos.splice(0, db.photos.length, at(5, 50, 'progress'), at(6, 20, 'progress'), at(7, 5, 'progress'));
    const prog = (await (await call(a, 'GET', '/depth/photos/awakening')).json()) as any;
    expect(prog).toMatchObject({ source: 'progress', before: { id: uuid(6) }, after: { id: uuid(7) } });

    db.photos.splice(0, db.photos.length, at(5, 50, 'progress'));
    expect((await (await call(a, 'GET', '/depth/photos/awakening')).json()) as any).toMatchObject({ source: 'incomplete', before: null, after: null });
  });

  it('deletes only your own photo and removes the stored file', async () => {
    const st = storage();
    const { db, prisma } = depthDb();
    const a = app(prisma, { storage: st });
    db.photos.push({ ...photo(1), userId: USER, takenAt: new Date(), note: null }, { ...photo(2), userId: OTHER, takenAt: new Date(), note: null });
    expect((await call(a, 'DELETE', `/depth/photos/${uuid(2)}`)).status).toBe(404);
    expect((await call(a, 'DELETE', `/depth/photos/${uuid(1)}`)).status).toBe(200);
    expect(st.remove).toHaveBeenCalledWith('progress-photos', `progress/${USER}/${uuid(1)}.jpg`);
    expect(db.photos.map((p) => p.id)).toEqual([uuid(2)]);
  });
});

describe('Depth: meal templates', () => {
  const tpl = (over: Record<string, unknown> = {}) => ({
    id: uuid(1), name: 'Usual lunch', meal: 'lunch',
    items: [{ foodId: 'rice-white-cooked', grams: 186, servingLabel: '1 cup' }, { foodId: 'rice-white-cooked', grams: 50 }], ...over,
  });

  it('upserts by id, validates foods, and keeps templates private', async () => {
    const { db, prisma } = depthDb();
    const a = app(prisma);
    expect((await call(a, 'PUT', '/depth/meal-templates', tpl())).status).toBe(200);
    expect((await call(a, 'PUT', '/depth/meal-templates', tpl({ name: 'Renamed', meal: 'other' }))).status).toBe(200);
    expect(db.templates).toHaveLength(1);
    expect(db.templates[0]).toMatchObject({ name: 'Renamed', meal: 'other', userId: USER });
    expect((await call(a, 'PUT', '/depth/meal-templates', tpl({ id: uuid(2), items: [{ foodId: 'does-not-exist', grams: 10 }] }))).status).toBe(404);
    expect((await call(a, 'PUT', '/depth/meal-templates', tpl({ id: uuid(2), items: [] }))).status).toBe(400);
    db.templates.push({ id: uuid(9), userId: OTHER, name: 'theirs', meal: 'lunch', items: [], createdAt: new Date(), updatedAt: new Date() });
    expect((await call(a, 'PUT', '/depth/meal-templates', tpl({ id: uuid(9) }))).status).toBe(409);
    const list = (await (await call(a, 'GET', '/depth/meal-templates')).json()) as any;
    expect(list.templates.map((t: any) => t.id)).toEqual([uuid(1)]);
    expect((await call(a, 'DELETE', `/depth/meal-templates/${uuid(9)}`)).status).toBe(404);
    expect((await call(a, 'DELETE', `/depth/meal-templates/${uuid(1)}`)).status).toBe(200);
  });

  it('apply is idempotent by applyId: a retry adds nothing, a new applyId adds again', async () => {
    const { db, prisma } = depthDb();
    const a = app(prisma);
    await call(a, 'PUT', '/depth/meal-templates', tpl({ meal: 'other' }));
    const body = { toDate: today(), applyId: uuid(100) };
    const first = (await (await call(a, 'POST', `/depth/meal-templates/${uuid(1)}/apply`, body)).json()) as any;
    expect(first).toEqual({ applied: 2, created: 2 });
    expect(db.logs).toHaveLength(2);
    expect(db.logs.every((l) => l.userId === USER && l.localDate === today() && l.meal === 'snack')).toBe(true); // "other" logs as snack
    expect(db.logs[0]).toMatchObject({ foodId: 'rice-white-cooked', grams: 186, servingLabel: '1 cup' });
    expect(new Set(db.logs.map((l) => l.id)).size).toBe(2);
    expect(db.foods.map((f) => f.id)).toEqual(['rice-white-cooked']); // curated food row created on first use

    const retry = (await (await call(a, 'POST', `/depth/meal-templates/${uuid(1)}/apply`, body)).json()) as any;
    expect(retry).toEqual({ applied: 2, created: 0 });
    expect(db.logs).toHaveLength(2);

    await call(a, 'POST', `/depth/meal-templates/${uuid(1)}/apply`, { ...body, applyId: uuid(101) });
    expect(db.logs).toHaveLength(4);
  });

  it('apply 404s for a missing or foreign template and 400s for a bad body', async () => {
    const { db, prisma } = depthDb();
    const a = app(prisma);
    db.templates.push({ id: uuid(9), userId: OTHER, name: 'theirs', meal: 'lunch', items: [{ foodId: 'rice-white-cooked', grams: 10 }], createdAt: new Date(), updatedAt: new Date() });
    expect((await call(a, 'POST', `/depth/meal-templates/${uuid(9)}/apply`, { toDate: today(), applyId: uuid(1) })).status).toBe(404);
    expect((await call(a, 'POST', `/depth/meal-templates/${uuid(5)}/apply`, { toDate: today(), applyId: uuid(1) })).status).toBe(404);
    expect((await call(a, 'POST', `/depth/meal-templates/${uuid(5)}/apply`, { toDate: 'soon' })).status).toBe(400);
    expect(db.logs).toHaveLength(0);
  });
});

describe('Depth: weekly debrief', () => {
  /** A busy last week for USER (plus noise outside the week). */
  function seed(db: ReturnType<typeof depthDb>['db']) {
    const w = lastMonday();
    db.sessions.push(
      { id: 's1', userId: USER, localDate: w, finishedAt: new Date() }, { id: 's2', userId: USER, localDate: shift(w, 2), finishedAt: new Date() },
      { id: 's3', userId: USER, localDate: shift(w, 3), finishedAt: null }, { id: 's4', userId: USER, localDate: shift(w, -1), finishedAt: new Date() },
    );
    db.ledger.push({ userId: USER, localDate: w, amount: 120 }, { userId: USER, localDate: shift(w, 6), amount: 80 }, { userId: USER, localDate: shift(w, 7), amount: 999 });
    db.quests.push(
      { userId: USER, localDate: w, kind: 'DAILY', status: 'COMPLETED' }, { userId: USER, localDate: w, kind: 'DAILY', status: 'COMPLETED' },
      { userId: USER, localDate: shift(w, 1), kind: 'DAILY', status: 'COMPLETED' }, { userId: USER, localDate: shift(w, 1), kind: 'DAILY', status: 'FAILED' },
      { userId: USER, localDate: shift(w, 2), kind: 'DAILY', status: 'COMPLETED' }, { userId: USER, localDate: shift(w, 2), kind: 'BOSS', status: 'ACTIVE' },
    );
    db.records.push({ userId: USER, confirmed: true, achievedAt: new Date(`${shift(w, 1)}T10:00:00Z`) }, { userId: USER, confirmed: true, achievedAt: new Date(`${shift(w, -3)}T10:00:00Z`) });
    db.foods.push({ id: 'rice', kcal100: 100 });
    db.targets.push({ kcal: 2000, effectiveFrom: shift(w, -10) });
    db.logs.push(
      { id: 'l1', userId: USER, localDate: w, foodId: 'rice', grams: 2000 }, // 2000 kcal: on target
      { id: 'l2', userId: USER, localDate: shift(w, 1), foodId: 'rice', grams: 1000 }, // 1000 kcal: off
    );
  }

  it('without an API key writes a deterministic System-voice template from the metrics', async () => {
    const { db, prisma } = depthDb();
    seed(db);
    const a = app(prisma);
    const res = await call(a, 'POST', '/depth/debrief/generate', {});
    expect(res.status).toBe(200);
    const d = (await res.json()) as any;
    expect(d.weekStart).toBe(lastMonday());
    expect(d.metrics).toEqual({
      weekStart: lastMonday(), weekEnd: shift(lastMonday(), 6), workouts: 2, xp: 200, questDays: 2, streak: 4, prs: 1, nutritionDaysLogged: 2, nutritionAdherencePct: 50,
    });
    expect(d.body).toBe(templateDebrief(d.metrics));
    expect(d.body).toContain('2 workouts');
    expect(d.body).toContain('200 XP');
    expect(db.debriefs).toHaveLength(1);
    expect(db.debriefs[0].userId).toBe(USER);
  });

  it('is cached per week: GET and a second generate return the stored debrief without calling the writer', async () => {
    const { db, prisma } = depthDb();
    seed(db);
    const writer = vi.fn(async () => 'The ledger is read. You are not alone in it.');
    const a = app(prisma, { debriefWriter: writer });
    const first = (await (await call(a, 'POST', '/depth/debrief/generate', { weekStart: lastMonday() })).json()) as any;
    expect(first.body).toBe('The ledger is read. You are not alone in it.');
    expect(writer).toHaveBeenCalledTimes(1);
    expect((writer.mock.calls as unknown as unknown[][])[0]![0]).toMatchObject({ workouts: 2 });
    const again = (await (await call(a, 'POST', '/depth/debrief/generate', {})).json()) as any;
    const got = (await (await call(a, 'GET', `/depth/debrief?week=${lastMonday()}`)).json()) as any;
    const bare = (await (await call(a, 'GET', '/depth/debrief')).json()) as any;
    expect([again, got, bare].every((d) => d.body === first.body && d.createdAt === first.createdAt)).toBe(true);
    expect(writer).toHaveBeenCalledTimes(1);
    expect(db.debriefs).toHaveLength(1);
  });

  it('falls back to the template when the writer fails or returns nothing, and GET generates when nothing is stored', async () => {
    const { db, prisma } = depthDb();
    seed(db);
    const failing = app(prisma, { debriefWriter: async () => { throw new Error('anthropic down'); } });
    const d = (await (await call(failing, 'GET', '/depth/debrief')).json()) as any;
    expect(d.body).toBe(templateDebrief(d.metrics));
    db.debriefs.length = 0;
    const blank = app(prisma, { debriefWriter: async () => '   ' });
    expect(((await (await call(blank, 'POST', '/depth/debrief/generate', {})).json()) as any).body).toBe(templateDebrief(d.metrics));
  });

  it('an empty week gets a calm line, never guilt', () => {
    const body = templateDebrief({ weekStart: '2026-11-02', weekEnd: '2026-11-08', workouts: 0, xp: 0, questDays: 0, streak: 0, prs: 0, nutritionDaysLogged: 0, nutritionAdherencePct: null });
    expect(body).toContain('recorded nothing');
    expect(body).not.toMatch(/fail|lazy|shame|fat|weight/i);
  });

  it('validates the week: Mondays only, and not a week that is still running', async () => {
    const { prisma } = depthDb();
    const a = app(prisma);
    expect((await call(a, 'POST', '/depth/debrief/generate', { weekStart: shift(lastMonday(), 1) })).status).toBe(400);
    expect((await call(a, 'POST', '/depth/debrief/generate', { weekStart: mondayOf(today()) })).status).toBe(409);
    expect((await call(a, 'GET', '/depth/debrief?week=garbage')).status).toBe(400);
    expect((await call(a, 'GET', `/depth/debrief?week=${shift(lastMonday(), -7)}`)).status).toBe(200);
  });
});
