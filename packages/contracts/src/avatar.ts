/** Avatar Forge (VISUALS.md §7 / docs/AVATAR.md): Essence, cosmetics, loadout. */
import { z } from 'zod';
import { HeroClass, Rank, Uuid } from './common';

export const CosmeticSlot = z.enum(['body', 'hair', 'outfit', 'accessory', 'aura', 'prop', 'frame']);
export type CosmeticSlot = z.infer<typeof CosmeticSlot>;

export const CosmeticRarity = z.enum(['common', 'rare', 'epic', 'legendary']);
export type CosmeticRarity = z.infer<typeof CosmeticRarity>;

export const CosmeticDto = z.object({
  id: z.string(),
  slot: CosmeticSlot,
  name: z.string(),
  rarity: CosmeticRarity,
  price: z.number().int(),
  free: z.boolean(),
  tint: z.string(),
  shape: z.string(),
  rankLock: Rank.nullable(),
  classLock: HeroClass.nullable(),
  owned: z.boolean(),
  equipped: z.boolean(),
  lockedReason: z.string().nullable(),
  /** earned from an achievement tier, never sold */
  unlock: z.object({ achievement: z.string(), tier: z.number().int() }).nullable().default(null),
  style: z.string().nullable().default(null),
  colors: z.tuple([z.string(), z.string()]).nullable().default(null),
});
export type CosmeticDto = z.infer<typeof CosmeticDto>;

export const AvatarLoadoutDto = z.object({
  body: z.string().nullable(),
  hair: z.string().nullable(),
  outfit: z.string().nullable(),
  accessory: z.string().nullable(),
  aura: z.string().nullable(),
  prop: z.string().nullable(),
  frame: z.string().nullable(),
});
export type AvatarLoadoutDto = z.infer<typeof AvatarLoadoutDto>;

export const AvatarMeResponse = z.object({
  essence: z.number().int().min(0),
  loadout: AvatarLoadoutDto,
  catalog: z.array(CosmeticDto),
});
export type AvatarMeResponse = z.infer<typeof AvatarMeResponse>;

export const EquipCosmeticInput = z.object({
  slot: CosmeticSlot,
  /** null = unequip (slot falls back to free default if any) */
  cosmeticId: z.string().min(1).max(80).nullable(),
});
export type EquipCosmeticInput = z.infer<typeof EquipCosmeticInput>;

/** spendId = client idempotency key for the Essence debit + inventory grant. */
export const BuyCosmeticInput = z.object({
  cosmeticId: z.string().min(1).max(80),
  spendId: Uuid,
});
export type BuyCosmeticInput = z.infer<typeof BuyCosmeticInput>;
