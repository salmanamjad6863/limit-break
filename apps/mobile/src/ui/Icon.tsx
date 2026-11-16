import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useTheme } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Ionicons wrapper so every icon shares size/colour defaults. */
export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const { c } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? c.textDim} />;
}
