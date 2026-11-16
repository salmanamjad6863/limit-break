import { colors, motion, radius, spacing, typeScale, type ThemeColors } from '@lb/tokens';

/** Dark-first. Light theme arrives with Settings. */
export function useTheme(): { c: ThemeColors; spacing: typeof spacing; radius: typeof radius; type: typeof typeScale; motion: typeof motion } {
  return { c: colors.dark, spacing, radius, type: typeScale, motion };
}
