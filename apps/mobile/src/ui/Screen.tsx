import { useState, type ReactNode } from 'react';
import { Platform, RefreshControl, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { ScreenBackground } from './fx/ScreenBackground';
import { Appear } from './motion/Appear';
import { Text } from './Text';

// On web, NativeTabs float at the top instead of the bottom.
const WEB_TAB_BAR_HEIGHT = 84;

/** Standard screen: quiet background, optional large title + subtitle, scrolling content. */
export function Screen({
  children,
  accent,
  title,
  subtitle,
  right,
  onRefresh,
  onEndReached,
}: {
  children: ReactNode;
  accent?: string;
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  /** pull to refresh; the spinner shows until the promise settles */
  onRefresh?: () => Promise<unknown>;
  /** called when the user scrolls near the bottom (infinite lists) */
  onEndReached?: () => void;
}) {
  const { c, spacing } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh ? () => {
    setRefreshing(true);
    onRefresh().finally(() => setRefreshing(false));
  } : undefined;
  const onScroll = onEndReached ? (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    // start loading the next page well before the bottom so scrolling never stalls
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - layoutMeasurement.height * 1.5) onEndReached();
  } : undefined;
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenBackground accent={accent} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={onScroll ? 200 : undefined}
          refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.textDim} /> : undefined}
          contentContainerStyle={{
            padding: spacing[4],
            gap: spacing[5],
            paddingTop: Platform.OS === 'web' ? WEB_TAB_BAR_HEIGHT : spacing[3],
            paddingBottom: spacing[16] * 2,
            width: '100%',
            maxWidth: 560,
            alignSelf: 'center',
          }}>
          {title ? (
            <Appear index={0} style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing[3] }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="title">{title}</Text>
                {subtitle ? <Text variant="callout" dim>{subtitle}</Text> : null}
              </View>
              {right}
            </Appear>
          ) : null}
          {children}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
