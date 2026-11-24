import { achievementById } from '@lb/content';
import { router } from 'expo-router';
import { View } from 'react-native';
import { badgeIcon, TIER_LABEL, useAchievements, useEquipTitle } from '@/features/achievements';
import { tierName } from '@lb/engine';
import { useTheme } from '@/theme';
import { Card, Icon, Page, PressableScale, ScreenHeader, Text } from '@/ui';
import { AchievementBadge } from '@/ui/fx';

/** Wear one earned title: shown under your name on your profile, Hunter License and posts. */
export default function Titles() {
  const { c, spacing, radius } = useTheme();
  const { data } = useAchievements();
  const equip = useEquipTitle();
  if (!data) return <Page header={<ScreenHeader title="Titles" />}><Text dim>Loading…</Text></Page>;
  const pick = (title: string | null) => {
    equip.mutate(title);
    router.back();
  };

  return (
    <Page header={<ScreenHeader title="Titles" />}>
      <Text variant="callout" dim>Your title shows under your name on your profile, your Hunter License and your posts. Earn more from gold and platinum tiers.</Text>
      <Card padded={false}>
        {[{ title: null as string | null, achievementId: '', tier: 0 }, ...data.titles].map((t, i) => {
          const on = data.equippedTitle === t.title;
          const def = t.title ? achievementById.get(t.achievementId) : null;
          return (
            <PressableScale key={t.title ?? 'none'} haptic="tap" onPress={() => pick(t.title)} accessibilityRole="radio" accessibilityState={{ selected: on }}
              accessibilityLabel={t.title ?? 'No title'}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], paddingHorizontal: spacing[4], borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
              {def ? <AchievementBadge tier={tierName(def, t.tier)} icon={badgeIcon(def)} size={40} />
                : <View style={{ width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceRaised }}><Icon name="remove" size={18} /></View>}
              <View style={{ flex: 1 }}>
                <Text variant="callout" color={on ? c.accentGlow : c.text}>{t.title ?? 'No title'}</Text>
                {def ? <Text variant="caption" muted>{`${def.name} · ${TIER_LABEL[tierName(def, t.tier)]}`}</Text> : null}
              </View>
              <Icon name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? c.accentGlow : c.textMuted} />
            </PressableScale>
          );
        })}
      </Card>
      {!data.titles.length ? <Text variant="caption" muted>No titles yet. The first ones come from the Shadow Slayer, Challenger and hidden achievements.</Text> : null}
    </Page>
  );
}
