/**
 * Avatar Forge service (VISUALS.md §7 / docs/AVATAR.md).
 */
import type { AvatarLoadoutDto, AvatarMeResponse, BuyCosmeticInput, CosmeticDto, CosmeticSlot, EquipCosmeticInput } from '@lb/contracts';
import { cosmeticById, cosmetics } from '@lb/content';
import type { PrismaClient } from '@lb/db';
import { gameDate } from '@lb/engine';
import { EssenceError, grantEssence } from './essence';

const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'] as const;
const DEFAULTS: Record<CosmeticSlot, string | null> = {
  body: 'body-standard',
  hair: 'hair-shadow',
  outfit: 'outfit-training',
  accessory: null,
  aura: 'aura-spirit',
  prop: null,
  frame: 'frame-hunter',
};

export class AvatarError extends Error {
  constructor(public status: 400 | 403 | 404 | 409, message: string) {
    super(message);
  }
}

const emptyLoadout = (): AvatarLoadoutDto => ({
  body: DEFAULTS.body, hair: DEFAULTS.hair, outfit: DEFAULTS.outfit,
  accessory: null, aura: DEFAULTS.aura, prop: null, frame: DEFAULTS.frame,
});

function rankAtLeast(have: string, need: string | null) {
  if (!need) return true;
  return RANKS.indexOf(have as (typeof RANKS)[number]) >= RANKS.indexOf(need as (typeof RANKS)[number]);
}

async function ensureStarter(prisma: PrismaClient, userId: string) {
  // Only auto-grant free items with no rank/class gate — the rest are previewable, then claimed when unlocked.
  const free = cosmetics.filter((c) => c.free && !c.rankLock && !c.classLock);
  const owned = await prisma.cosmeticOwned.findMany({ where: { userId }, select: { cosmeticId: true } });
  const have = new Set(owned.map((o) => o.cosmeticId));
  const missing = free.filter((c) => !have.has(c.id));
  if (missing.length) {
    await prisma.cosmeticOwned.createMany({
      data: missing.map((c) => ({ userId, cosmeticId: c.id })),
      skipDuplicates: true,
    });
  }
  const loadout = await prisma.avatarLoadout.findUnique({ where: { userId } });
  if (!loadout) {
    await prisma.avatarLoadout.create({
      data: {
        userId,
        body: DEFAULTS.body,
        hair: DEFAULTS.hair,
        outfit: DEFAULTS.outfit,
        aura: DEFAULTS.aura,
        frame: DEFAULTS.frame,
      },
    });
  }
}

function toLoadout(row: {
  body: string | null; hair: string | null; outfit: string | null; accessory: string | null;
  aura: string | null; prop: string | null; frame: string | null;
} | null): AvatarLoadoutDto {
  if (!row) return emptyLoadout();
  return {
    body: row.body, hair: row.hair, outfit: row.outfit, accessory: row.accessory,
    aura: row.aura, prop: row.prop, frame: row.frame,
  };
}

export async function getAvatarMe(prisma: PrismaClient, userId: string): Promise<AvatarMeResponse> {
  await ensureStarter(prisma, userId);
  const [state, profile, owned, loadoutRow] = await Promise.all([
    prisma.hunterState.findUnique({ where: { userId } }),
    prisma.profile.findUnique({ where: { id: userId }, select: { heroClass: true } }),
    prisma.cosmeticOwned.findMany({ where: { userId }, select: { cosmeticId: true } }),
    prisma.avatarLoadout.findUnique({ where: { userId } }),
  ]);
  if (!state) throw new AvatarError(404, 'hunter not found');
  const have = new Set(owned.map((o) => o.cosmeticId));
  const loadout = toLoadout(loadoutRow);
  const equipped = new Set(Object.values(loadout).filter(Boolean) as string[]);
  const rank = state.rank;
  const heroClass = profile?.heroClass ?? null;

  const catalog: CosmeticDto[] = cosmetics.map((c) => {
    let lockedReason: string | null = null;
    if (!rankAtLeast(rank, c.rankLock)) lockedReason = `Requires ${c.rankLock}-Rank`;
    else if (c.classLock && c.classLock !== heroClass) lockedReason = `Requires ${c.classLock} class`;
    return {
      id: c.id, slot: c.slot, name: c.name, rarity: c.rarity, price: c.price, free: c.free,
      tint: c.tint, shape: c.shape, rankLock: c.rankLock, classLock: c.classLock,
      owned: have.has(c.id), equipped: equipped.has(c.id), lockedReason,
    };
  });

  return { essence: state.essence, loadout, catalog };
}

export async function equipCosmetic(prisma: PrismaClient, userId: string, input: EquipCosmeticInput) {
  await ensureStarter(prisma, userId);
  if (input.cosmeticId) {
    const item = cosmeticById.get(input.cosmeticId);
    if (!item) throw new AvatarError(404, 'cosmetic not found');
    if (item.slot !== input.slot) throw new AvatarError(400, 'cosmetic does not fit that slot');
    const owned = await prisma.cosmeticOwned.findUnique({ where: { userId_cosmeticId: { userId, cosmeticId: input.cosmeticId } } });
    if (!owned) throw new AvatarError(403, 'you do not own this cosmetic');
    const state = await prisma.hunterState.findUnique({ where: { userId } });
    const profile = await prisma.profile.findUnique({ where: { id: userId }, select: { heroClass: true } });
    if (!state) throw new AvatarError(404, 'hunter not found');
    if (!rankAtLeast(state.rank, item.rankLock)) throw new AvatarError(403, `Requires ${item.rankLock}-Rank`);
    if (item.classLock && item.classLock !== profile?.heroClass) throw new AvatarError(403, `Requires ${item.classLock} class`);
  }
  const data = { [input.slot]: input.cosmeticId } as Record<string, string | null>;
  await prisma.avatarLoadout.upsert({
    where: { userId },
    create: { userId, ...emptyLoadout(), ...data },
    update: data,
  });
  return getAvatarMe(prisma, userId);
}

export async function buyCosmetic(prisma: PrismaClient, userId: string, input: BuyCosmeticInput, timezone: string) {
  await ensureStarter(prisma, userId);
  const item = cosmeticById.get(input.cosmeticId);
  if (!item) throw new AvatarError(404, 'cosmetic not found');

  const owned = await prisma.cosmeticOwned.findUnique({ where: { userId_cosmeticId: { userId, cosmeticId: item.id } } });
  if (owned) return getAvatarMe(prisma, userId);

  const state = await prisma.hunterState.findUnique({ where: { userId } });
  const profile = await prisma.profile.findUnique({ where: { id: userId }, select: { heroClass: true, timezone: true } });
  if (!state) throw new AvatarError(404, 'hunter not found');
  // Rank/class gates: preview is free in the app; claiming still requires the achievement.
  if (!rankAtLeast(state.rank, item.rankLock)) throw new AvatarError(403, `Requires ${item.rankLock}-Rank`);
  if (item.classLock && item.classLock !== profile?.heroClass) throw new AvatarError(403, `Requires ${item.classLock} class`);
  if (item.price > 0 && state.essence < item.price) throw new AvatarError(400, 'not enough Essence');


  const localDate = gameDate(new Date(), timezone || profile?.timezone || 'UTC');
  try {
    await prisma.$transaction(async (tx) => {
      if (item.price > 0) {
        await grantEssence(tx, {
          userId, eventId: input.spendId, localDate, amount: -item.price, reason: `buy:${item.id}`,
        });
      }
      await tx.cosmeticOwned.create({ data: { userId, cosmeticId: item.id } });
    });
  } catch (e) {
    if (e instanceof EssenceError) throw new AvatarError(e.status === 409 ? 409 : 400, e.message);
    // unique ownership race: treat as success
    const again = await prisma.cosmeticOwned.findUnique({ where: { userId_cosmeticId: { userId, cosmeticId: item.id } } });
    if (!again) throw e;
  }
  return getAvatarMe(prisma, userId);
}
