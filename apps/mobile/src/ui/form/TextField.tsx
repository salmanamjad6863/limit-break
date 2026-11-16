import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from '../Text';

export function TextField({ label, ...rest }: TextInputProps & { label: string }) {
  const { c, radius, spacing, type } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: spacing[2] }}>
      <Text variant="label" dim>{label}</Text>
      <TextInput
        placeholderTextColor={c.textMuted}
        selectionColor={c.accentGlow}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={{
          color: c.text,
          fontFamily: type.headline.font,
          fontSize: 20,
          paddingHorizontal: spacing[4],
          paddingVertical: spacing[3],
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: focused ? c.accentGlow : c.border,
          backgroundColor: c.surface,
          
        }}
      />
    </View>
  );
}
