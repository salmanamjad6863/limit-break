import type { Cosmetic } from '@lb/content';
import { HeroEmblem, type AuraStyle } from '@/ui/fx';

/** The hunter's animated sigil in their equipped aura (frames belong to the profile picture, not the sigil). */
export function HunterSigil({ size, color, initial, aura }: { size: number; color: string; initial: string; aura?: Cosmetic | null }) {
  return (
    <HeroEmblem size={size} color={color} initial={initial}
      aura={aura ? { colors: aura.colors ?? null, style: (aura.style as AuraStyle | null) ?? 'pulse' } : null} />
  );
}
