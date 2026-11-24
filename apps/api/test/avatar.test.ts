import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { USER, uuid } from './fakeDb';

function avatarDb() {
  const owned: { userId: string; cosmeticId: string; acquiredAt: Date }[] = [];
  let loadout: any = null;
  const ledger: any[] = [];
  const earned: { achievementId: string; tier: number }[] = [];
  const state = { userId: USER, rank: 'E', essence: 100, streak: 0 };
  const prisma: any = {
    profile: { findUnique: async () => ({ id: USER, timezone: 'UTC', heroClass: 'HYBRID' }) },
    hunterState: {
      findUnique: async () => ({ ...state }),
      update: async ({ data }: any) => {
        if (data.essence?.increment != null) state.essence += data.essence.increment;
        else if (typeof data.essence === 'number') state.essence = data.essence;
        return { ...state };
      },
    },
    achievementUnlock: { findMany: async () => earned },
    cosmeticOwned: {
      findMany: async ({ where }: any) => owned.filter((o) => o.userId === where.userId),
      findUnique: async ({ where }: any) =>
        owned.find((o) => o.userId === where.userId_cosmeticId.userId && o.cosmeticId === where.userId_cosmeticId.cosmeticId) ?? null,
      createMany: async ({ data, skipDuplicates }: any) => {
        for (const d of data) {
          if (owned.some((o) => o.userId === d.userId && o.cosmeticId === d.cosmeticId)) {
            if (skipDuplicates) continue;
            throw Object.assign(new Error('unique'), { code: 'P2002' });
          }
          owned.push({ ...d, acquiredAt: new Date() });
        }
      },
      create: async ({ data }: any) => {
        if (owned.some((o) => o.userId === data.userId && o.cosmeticId === data.cosmeticId)) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        owned.push({ ...data, acquiredAt: new Date() });
        return owned.at(-1);
      },
    },
    avatarLoadout: {
      findUnique: async () => loadout,
      create: async ({ data }: any) => {
        loadout = { ...data, updatedAt: new Date() };
        return loadout;
      },
      upsert: async ({ create, update }: any) => {
        loadout = loadout ? { ...loadout, ...update, updatedAt: new Date() } : { ...create, updatedAt: new Date() };
        return loadout;
      },
    },
    essenceLedger: {
      findUnique: async ({ where }: any) =>
        ledger.find((l) => l.eventId === where.eventId_reason.eventId && l.reason === where.eventId_reason.reason) ?? null,
      aggregate: async ({ where }: any) => {
        const rows = ledger.filter((l) => l.userId === where.userId && l.localDate === where.localDate && (where.amount?.gt == null || l.amount > 0));
        return { _sum: { amount: rows.reduce((s, r) => s + r.amount, 0) } };
      },
      create: async ({ data }: any) => {
        if (ledger.some((l) => l.eventId === data.eventId && l.reason === data.reason)) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        ledger.push({ ...data, id: ledger.length + 1, createdAt: new Date() });
        return ledger.at(-1);
      },
    },
    $transaction: async (fn: any) => fn(prisma),
  };
  return { prisma, owned, state, earned, get loadout() { return loadout; } };
}

const auth = { Authorization: 'Bearer test' };
const appOf = (prisma: any) =>
  createApp({ prisma, paywallEnabled: false, verifyToken: async () => ({ userId: USER }) });

describe('avatar forge', () => {
  it('grants free starters and returns catalog', async () => {
    const { prisma } = avatarDb();
    const app = appOf(prisma);
    const res = await app.request('/avatar', { headers: auth });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.essence).toBe(100);
    expect(body.loadout.body).toBe('body-standard');
    expect(body.catalog.some((c: any) => c.id === 'body-standard' && c.owned)).toBe(true);
    expect(body.catalog.some((c: any) => c.id === 'outfit-shadow-coat' && !c.owned)).toBe(true);
  });

  it('buys with Essence idempotently and equips', async () => {
    const { prisma, state } = avatarDb();
    const app = appOf(prisma);
    await app.request('/avatar', { headers: auth });
    const spendId = uuid(42);
    const buy1 = await app.request('/avatar/buy', {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cosmeticId: 'hair-wind', spendId }),
    });
    expect(buy1.status).toBe(200);
    expect((await buy1.json()).catalog.find((c: any) => c.id === 'hair-wind').owned).toBe(true);
    expect(state.essence).toBe(60);

    const buy2 = await app.request('/avatar/buy', {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cosmeticId: 'hair-wind', spendId }),
    });
    expect(buy2.status).toBe(200);
    expect(state.essence).toBe(60);

    const equip = await app.request('/avatar/equip', {
      method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: 'hair', cosmeticId: 'hair-wind' }),
    });
    expect(equip.status).toBe(200);
    expect((await equip.json()).loadout.hair).toBe('hair-wind');
  });

  it('blocks rank-locked cosmetics', async () => {
    const { prisma } = avatarDb();
    const app = appOf(prisma);
    await app.request('/avatar', { headers: auth });
    const res = await app.request('/avatar/buy', {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cosmeticId: 'outfit-shadow-coat', spendId: uuid(43) }),
    });
    expect(res.status).toBe(403);
  });

  it('frames and auras from achievements: never sold, granted once the tier is earned, then equippable', async () => {
    const { prisma, earned } = avatarDb();
    const app = appOf(prisma);
    const json = { ...auth, 'Content-Type': 'application/json' };
    const me = async () => (await (await app.request('/avatar', { headers: auth })).json()) as any;
    const laurel = (await me()).catalog.find((c: any) => c.id === 'frame-laurel-gold');
    expect(laurel).toMatchObject({ owned: false, lockedReason: 'Earn Iron Will Gold', style: 'laurel', unlock: { achievement: 'iron-will', tier: 2 } });
    expect((await app.request('/avatar/buy', { method: 'POST', headers: json, body: JSON.stringify({ cosmeticId: 'frame-laurel-gold', spendId: uuid(44) }) })).status).toBe(403);
    earned.push({ achievementId: 'iron-will', tier: 2 });
    expect((await me()).catalog.find((c: any) => c.id === 'frame-laurel-gold')).toMatchObject({ owned: true, lockedReason: null });
    const eq = await app.request('/avatar/equip', { method: 'PUT', headers: json, body: JSON.stringify({ slot: 'frame', cosmeticId: 'frame-laurel-gold' }) });
    expect(((await eq.json()) as any).loadout.frame).toBe('frame-laurel-gold');
    // "None": no frame at all
    const none = await app.request('/avatar/equip', { method: 'PUT', headers: json, body: JSON.stringify({ slot: 'frame', cosmeticId: null }) });
    expect(((await none.json()) as any).loadout.frame).toBeNull();
  });
});
