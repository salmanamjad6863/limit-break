import { features } from '@lb/content';
import { Linking, Platform } from 'react-native';
import { useFeature } from '@/features/paywall';
import { useTheme } from '@/theme';
import { Button, Card, Page, ScreenHeader, SectionHeader, Text } from '@/ui';

const FREE = (Object.entries(features) as [string, 'free' | 'premium'][])
  .filter(([, tier]) => tier === 'free')
  .map(([k]) => k);
const PREMIUM = (Object.entries(features) as [string, 'free' | 'premium'][])
  .filter(([, tier]) => tier === 'premium')
  .map(([k]) => k);

const LABELS: Record<string, string> = {
  dailyQuests: 'Daily, Side and Penalty Quests',
  logger: 'Unlimited workout logging',
  barcode: 'Barcode food logging',
  rankTrials: 'Ranks and Rank Trials',
  guilds: 'Friends, guilds, raids',
  starterPrograms: 'Starter programs',
  allPrograms: 'All programs and auto-progression',
  adaptiveTdee: 'Adaptive TDEE and weekly macros',
  aiPhotoLog: 'AI photo / voice food log',
  shadowBossAnalytics: 'Shadow-Self and muscle volume',
  premiumSeasonTrack: 'Season track, exclusive frames',
  extraShields: '+2 Streak Shields / month',
};

function manageUrl() {
  if (Platform.OS === 'ios') return 'https://apps.apple.com/account/subscriptions';
  if (Platform.OS === 'android') return 'https://play.google.com/store/account/subscriptions';
  return null;
}

/** Plan card. Paywall stays off; Restore / Manage exist so this looks like a real product. */
export default function SubscriptionSettings() {
  const { c, spacing } = useTheme();
  const paywall = useFeature('allPrograms');
  const manage = manageUrl();

  return (
    <Page header={<ScreenHeader title="Your plan" />}>
      <Card tint={c.accent}>
        <Text variant="label" color={c.accentGlow}>Current</Text>
        <Text variant="title">Free</Text>
        <Text variant="callout" dim>
          The full core loop is open. Awakened (premium) is not for sale yet — when it is, this screen is where you manage it.
        </Text>
      </Card>

      <SectionHeader title="Included now" />
      <Card>
        {FREE.map((k) => (
          <Text key={k} variant="callout">{LABELS[k] ?? k}</Text>
        ))}
      </Card>

      <SectionHeader title="Awakened (later)" />
      <Card>
        {PREMIUM.map((k) => (
          <Text key={k} variant="callout" dim>{LABELS[k] ?? k}</Text>
        ))}
        <Text variant="caption" muted>Looks, XP and rank are never sold.</Text>
      </Card>

      <Button
        variant="secondary"
        size="md"
        icon="refresh-outline"
        label="Restore purchases"
        onPress={() => {}}
        disabled
      />
      <Text variant="caption" muted>Nothing to restore until subscriptions launch.</Text>
      {manage ? (
        <Button
          variant="ghost"
          size="md"
          icon="open-outline"
          label="Manage subscriptions on this store"
          onPress={() => void Linking.openURL(manage)}
        />
      ) : null}
      <Text variant="caption" muted style={{ marginTop: spacing[2] }}>
        {paywall.enabled ? 'Premium gates are currently unlocked for everyone.' : 'Premium gates follow your entitlement.'}
      </Text>
    </Page>
  );
}
