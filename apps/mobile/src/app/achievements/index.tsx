import { achievementById, type AchievementDef } from '@lb/content';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { badgeIcon, badgeView, CATEGORY_LABEL, CATEGORY_SCENE, TIER_LABEL, tierCounts, TierPips, useAchievements } from '@/features/achievements';
import { useTheme } from '@/theme';
import { Appear, Bar, Card, Icon, Page, PressableScale, ScreenHeader, Text } from '@/ui';
import { AchievementBadge, Ring, TIER_METAL } from '@/ui/fx';

type Filter = 'all' | AchievementDef['category'];
const FILTERS: Filter[] = ['all', 'training', 'consistency', 'progression', 'nutrition', 'hidden'];

/** Trophy case: every badge, its tier and progress, plus the title you wear. */
export default function TrophyCase() {
  const { c, spacing, radius } = useTheme();
  const { data } = useAchievements();
  const [filter, setFilter] = useState<Filter>('all');

  if (!data) return <Page header={<ScreenHeader title="Achievements" />}><Text dim>Loading…</Text></Page>;
  const { earned, total } = tierCounts(data.progress);
  const rows = data.progress.filter((p) => filter === 'all' || achievementById.get(p.id)?.category === filter);
  const byTier = (['platinum', 'gold', 'silver', 'bronze'] as const).map((t) => ({
    t, n: data.progress.filter((p) => badgeView(p).tier === t).length,
  }));

  return (
    <Page header={<ScreenHeader title="Achievements" />}>
      {/* summary */}
      <Appear index={0}>
        <Card padded={false}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4], padding: spacing[4] }}>
            <Ring ratio={total ? earned / total : 0} size={86} stroke={8} color={c.accentGlow}>
              <Text variant="headline">{`${Math.round((earned / Math.max(1, total)) * 100)}%`}</Text>
            </Ring>
            <View style={{ flex: 1, gap: spacing[2] }}>
              <Text variant="title">{`${data.progress.filter((p) => p.earned >= 0).length} of ${data.progress.length}`}</Text>
              <Text variant="caption" muted>{`achievements unlocked · ${earned}/${total} tiers`}</Text>
              <View style={{ flexDirection: 'row', gap: spacing[3] }}>
                {byTier.map(({ t, n }) => (
                  <View key={t} accessibilityLabel={`${n} ${TIER_LABEL[t]}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: TIER_METAL[t].stops[1] }} />
                    <Text variant="caption" dim>{n}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
          <PressableScale haptic="tap" onPress={() => router.push('/achievements/titles')} accessibilityRole="button"
            accessibilityLabel={data.equippedTitle ? `Title: ${data.equippedTitle}. Change` : 'Choose a title'}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], borderTopWidth: 1, borderColor: c.border }}>
            <Icon name="ribbon-outline" size={20} color={c.accentGlow} />
            <View style={{ flex: 1 }}>
              <Text variant="caption" muted>Title</Text>
              <Text variant="callout" color={data.equippedTitle ? c.accentGlow : c.textDim}>
                {data.equippedTitle ?? (data.titles.length ? 'Choose a title to wear' : 'Earn gold tiers to unlock titles')}
              </Text>
            </View>
            <Text variant="caption" muted>{`${data.titles.length} earned`}</Text>
            <Icon name="chevron-forward" size={16} color={c.textMuted} />
          </PressableScale>
        </Card>
      </Appear>

      {/* filters */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {FILTERS.map((f) => {
          const on = filter === f;
          return (
            <PressableScale key={f} haptic="tap" onPress={() => setFilter(f)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={{ paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? c.accent : c.border, backgroundColor: on ? `${c.accent}1F` : 'transparent' }}>
              <Text variant="caption" color={on ? c.text : c.textDim}>{f === 'all' ? 'All' : CATEGORY_LABEL[f]}</Text>
            </PressableScale>
          );
        })}
      </View>

      {/* grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing[1] }}>
        {rows.map((p, i) => {
          const v = badgeView(p);
          return (
            <View key={p.id} style={{ width: '33.333%', padding: spacing[1] }}>
              <Appear index={Math.min(i, 12)}>
                <PressableScale haptic="tap" onPress={() => router.push(`/achievements/${p.id}`)} accessibilityRole="button"
                  accessibilityLabel={`${v.name}${v.tier ? `, ${TIER_LABEL[v.tier]}` : ', not earned yet'}. ${v.goal}`}
                  style={{ aspectRatio: 0.78, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1,
                    borderColor: v.tier ? `${TIER_METAL[v.tier].stops[1]}88` : 'rgba(255,255,255,0.06)' }}>
                  {/* scene: category colours, quiet until earned; a hidden one is a dark "?" tile */}
                  <LinearGradient colors={v.secret ? ['#14131A', '#0A0A0E'] : CATEGORY_SCENE[v.def.category]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={{ position: 'absolute', inset: 0, opacity: v.tier || v.secret ? 1 : 0.45 }} />
                  {v.tier ? <View style={{ position: 'absolute', width: '120%', aspectRatio: 1, borderRadius: 999, top: '-55%', left: '-10%', backgroundColor: `${TIER_METAL[v.tier].stops[0]}22` }} /> : null}
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: spacing[2] }}>
                    <AchievementBadge tier={v.tier} icon={badgeIcon(v.def)} size={60} ratio={p.earned < 0 ? p.ratio : 0} hidden={v.secret} />
                    <Text variant="caption" numberOfLines={1} color={v.tier || v.secret ? '#FFFFFF' : c.textDim} style={{ fontFamily: 'Inter_600SemiBold' }}>{v.name}</Text>
                    <TierPips count={v.def.tiers.length} earned={p.earned} />
                    {v.complete ? (
                      <Text variant="micro" color={c.success}>Complete</Text>
                    ) : v.secret ? (
                      <Text variant="micro" muted>Hidden</Text>
                    ) : (
                      <View style={{ width: '100%', gap: 3 }}>
                        <Bar ratio={p.ratio} height={4} />
                        <Text variant="micro" color="rgba(255,255,255,0.7)" numberOfLines={1} style={{ textAlign: 'center' }}>{v.progressText}</Text>
                      </View>
                    )}
                  </View>
                </PressableScale>
              </Appear>
            </View>
          );
        })}
      </View>
    </Page>
  );
}
