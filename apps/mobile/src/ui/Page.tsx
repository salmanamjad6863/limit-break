import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { ScreenBackground } from './fx/ScreenBackground';

/** Full-screen page for pushed routes: background + safe area + optional header/footer. */
export function Page({
  header,
  footer,
  children,
  accent,
  scroll = true,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  accent?: string;
  scroll?: boolean;
}) {
  const { c, spacing } = useTheme();
  const body = { padding: spacing[4], gap: spacing[4], paddingBottom: spacing[8], width: '100%' as const, maxWidth: 560, alignSelf: 'center' as const };
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenBackground accent={accent} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {header}
        {scroll ? (
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={body}>
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, body]}>{children}</View>
        )}
        {footer ? <View style={{ paddingHorizontal: spacing[4], paddingVertical: spacing[3], gap: spacing[2], width: '100%', maxWidth: 560, alignSelf: 'center' }}>{footer}</View> : null}
      </SafeAreaView>
    </View>
  );
}
