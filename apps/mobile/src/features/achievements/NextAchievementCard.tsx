import { achievementById } from '@lb/content';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Bar, Icon, PressableScale, Text } from '@/ui';
import { AchievementBadge, TIER_METAL } from '@/ui/fx';
import { useAchievements } from './api';
import { badgeIcon, badgeView, TIER_LABEL } from './view';
import { tierName } from '@lb/engine';

/** Home nudge: the visible achievement closest to its next tier ("3 more workouts to Silver"). */
export function NextAchievementCard() {
  const { c, spacing, radius } = useTheme();
  const { data } = useAchievements();
  const next = data?.progress
    .filter((p) => p.next != null && !achievementById.get(p.id)?.hidden)
    .sort((a, b) => b.ratio - a.ratio)[0];
  if (!next) return null;
  const v = badgeView(next);
  const def = v.def;
  const nextTier = tierName(def, v.nextIndex ?? 0);
  const left = Math.max(0, (next.next ?? 0) - next.value);
  return (
    <PressableScale haptic="tap" onPress={() => router.push(`/achievements/${next.id}`)} accessibilityRole="button"
      accessibilityLabel={`Next achievement: ${def.name}, ${TIER_LABEL[nextTier]}. ${v.goal}. ${left} to go`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: radius.lg, borderWidth: 1,
        borderColor: `${TIER_METAL[nextTier].stops[1]}55`, backgroundColor: c.surface }}>
      <AchievementBadge tier={v.tier} icon={badgeIcon(def)} size={56} ratio={next.earned < 0 ? next.ratio : 0} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="micro" color={TIER_METAL[nextTier].light}>{`NEXT: ${TIER_LABEL[nextTier].toUpperCase()} · ${def.name.toUpperCase()}`}</Text>
        <Text variant="callout" numberOfLines={1}>{v.goal}</Text>
        <Bar ratio={next.ratio} height={4} />
        <Text variant="caption" muted>{`${left.toLocaleString('en-US')} to go`}</Text>
      </View>
      <Icon name="chevron-forward" size={16} color={c.textMuted} />
    </PressableScale>
  );
}
