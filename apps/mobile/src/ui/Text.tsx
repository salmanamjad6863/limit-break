import type { TypeVariant } from '@lb/tokens';
import { Text as RNText, type TextProps } from 'react-native';
import { useTheme } from '@/theme';

/** Single text primitive. `label` is uppercase with light tracking; everything else is sentence case. */
export function Text({
  variant = 'body',
  dim,
  muted,
  color,
  style,
  ...rest
}: TextProps & { variant?: TypeVariant; dim?: boolean; muted?: boolean; color?: string }) {
  const { c, type } = useTheme();
  const t = type[variant];
  return (
    <RNText
      {...rest}
      style={[
        {
          fontSize: t.size,
          lineHeight: t.line,
          fontFamily: t.font,
          letterSpacing: t.tracking,
          color: color ?? (muted ? c.textMuted : dim ? c.textDim : c.text),
          textTransform: variant === 'label' ? 'uppercase' : 'none',
          fontVariant: variant === 'stat' ? ['tabular-nums'] : undefined,
        },
        style,
      ]}
    />
  );
}
