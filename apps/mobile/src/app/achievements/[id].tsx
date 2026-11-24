import { achievementById } from '@lb/content';
import { describeTier, tierName, tierXp } from '@lb/engine';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { badgeIcon, badgeView, CATEGORY_LABEL, TIER_LABEL, useAchievements } from '@/features/achievements';
import { useTheme } from '@/theme';
import { Bar, Card, Icon, Page, Pill, ScreenHeader, Text } from '@/ui';
import { AchievementBadge, TIER_METAL } from '@/ui/fx';

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** One achievement: the medal, where you are, and its tier ladder with titles and XP. */
export default function AchievementDetail() {
  const { c, spacing, radius } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useAchievements();
  const def = achievementById.get(id ?? '');
  const p = data?.progress.find((x) => x.id === id);
  if (!def || !p) return <Page header={<ScreenHeader title="Achievement" icon="close" />}><Text dim>Loading…</Text></Page>;
  const v = badgeView(p);

  return (
    <Page header={<ScreenHeader title={CATEGORY_LABEL[def.category]} icon="close" />}>
      <View style={{ alignItems: 'center', gap: spacing[2], paddingVertical: spacing[3] }}>
        <AchievementBadge tier={v.tier} icon={badgeIcon(def)} size={150} ratio={p.earned < 0 ? p.ratio : 0} hidden={v.secret} />
        <Text variant="title" style={{ textAlign: 'center' }}>{v.name}</Text>
        {v.tier ? <Pill icon="medal-outline" label={TIER_LABEL[v.tier]} color={TIER_METAL[v.tier].light} /> : null}
        <Text variant="callout" dim style={{ textAlign: 'center' }}>{v.complete ? `Every tier earned. ${describeTier(def, def.tiers.length - 1)}.` : v.goal}</Text>
        {!v.complete && !v.secret ? (
          <View style={{ width: '80%', gap: 4 }}>
            <Bar ratio={p.ratio} height={6} />
            <Text variant="caption" muted style={{ textAlign: 'center' }}>{v.progressText}</Text>
          </View>
        ) : null}
      </View>

      {v.secret ? (
        <Card><Text variant="callout" dim>Hidden achievements reveal themselves when you earn them. Try training at unusual times, or never giving up.</Text></Card>
      ) : (
        <Card padded={false}>
          {def.tiers.map((t, i) => {
            const got = i <= p.earned;
            const tier = tierName(def, i);
            const at = p.unlockedAt[String(i)];
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], paddingHorizontal: spacing[4], borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
                <AchievementBadge tier={got ? tier : null} icon={badgeIcon(def)} size={44} dim={got && i < p.earned} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="callout" color={got ? c.text : c.textDim}>{describeTier(def, i)}</Text>
                  <Text variant="caption" muted>
                    {[TIER_LABEL[tier], `+${tierXp(def, i)} XP`, t.title ? `Title: ${t.title}` : null, got && at ? when(at) : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Icon name={got ? 'checkmark-circle' : 'lock-closed-outline'} size={18} color={got ? c.success : c.textMuted} />
              </View>
            );
          })}
        </Card>
      )}
      <View style={{ height: spacing[2], borderRadius: radius.sm }} />
    </Page>
  );
}
