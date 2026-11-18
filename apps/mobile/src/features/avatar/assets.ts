/**
 * Local Avatar Forge art pack (docs/AVATAR.md).
 * 2D sketch / manhwa portraits — look-dev; swap with VRoid layers later if needed.
 */
import type { ImageSource } from 'expo-image';

type BundledImage = number;

/** Full hunter portrait keyed by outfit cosmetic id. */
export const OUTFIT_PORTRAITS: Record<string, BundledImage> = {
  'outfit-training': require('../../../assets/avatar/hunter-training.jpg'),
  'outfit-street': require('../../../assets/avatar/hunter-training.jpg'),
  'outfit-techwear': require('../../../assets/avatar/hunter-techwear.jpg'),
  'outfit-shadow-coat': require('../../../assets/avatar/hunter-shadow-coat.jpg'),
  'outfit-crimson': require('../../../assets/avatar/hunter-crimson.jpg'),
  'outfit-ascendant': require('../../../assets/avatar/hunter-ascendant.jpg'),
  'outfit-iron': require('../../../assets/avatar/hunter-iron.jpg'),
  'outfit-storm': require('../../../assets/avatar/hunter-techwear.jpg'),
  'outfit-mythic': require('../../../assets/avatar/hunter-ascendant.jpg'),
  'outfit-sovereign': require('../../../assets/avatar/hunter-ascendant.jpg'),
};

export const AURA_OVERLAYS: Record<string, BundledImage> = {
  'aura-spirit': require('../../../assets/avatar/aura-spirit.jpg'),
  'aura-mint': require('../../../assets/avatar/aura-spirit.jpg'),
  'aura-ember': require('../../../assets/avatar/aura-ember.jpg'),
  'aura-void': require('../../../assets/avatar/aura-void.jpg'),
  'aura-gold': require('../../../assets/avatar/aura-gold.jpg'),
  'aura-sovereign': require('../../../assets/avatar/aura-gold.jpg'),
};

export const DEFAULT_PORTRAIT: BundledImage = OUTFIT_PORTRAITS['outfit-training']!;

export const STORY_PANELS: Record<string, BundledImage> = {
  'awakening-heart': require('../../../assets/story/awakening-heart.jpg'),
};

export type { ImageSource };
