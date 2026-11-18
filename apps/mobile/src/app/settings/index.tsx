import { heroes } from '@lb/content';
import { router } from 'expo-router';
import { Linking, Platform } from 'react-native';
import { AccountSection } from '@/features/account/AccountSection';
import { useMe } from '@/features/progression';
import { useSession } from '@/features/session';
import { useToday, useTrainingProfile } from '@/features/training';
import { env } from '@/lib/env';
import { useTheme } from '@/theme';
import { Card, Page, ScreenHeader, SectionHeader, SettingsRow, Text } from '@/ui';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

function formatDays(days: number[]) {
  return ORDER.filter((d) => days.includes(d)).map((d) => DAY[d]).join(' · ') || 'Not set';
}

/** One hub for identity, training, nutrition, notifications, plan, and account. */
export default function SettingsHome() {
  const { c } = useTheme();
  const { data: me } = useMe();
  const session = useSession();
  const today = useToday();
  const profile = useTrainingProfile();
  const hero = heroes.find((h) => h.id === me?.heroId) ?? heroes[0];
  const days = today.weekdays?.length ? formatDays(today.weekdays) : formatDays(profile.weekdays ?? []);
  const time = profile.workoutTime ? `Reminders ${profile.workoutTime}` : 'No workout reminder';
  const quest = me?.notificationsOptIn === false ? 'Daily Quest off' : me?.questTime ? `Daily Quest ${me.questTime}` : 'Daily Quest';
  const plan = 'Free';
  const accountValue = session.status === 'signedIn' && session.isGuest
    ? 'Guest — save your progress'
    : session.email ?? (session.status === 'demo' ? 'Demo on this device' : null);

  return (
    <Page header={<ScreenHeader title="Settings" />}>
      <Text variant="callout" dim>Change your hunter, training days, reminders and account from here.</Text>

      <SectionHeader title="Hunter" />
      <Card padded={false}>
        <SettingsRow
          icon="person-outline"
          label="Name & sigil"
          value={me?.hunterName ? `${me.hunterName} · ${hero?.epithet ?? ''}` : 'Set your hunter'}
          onPress={() => router.push('/settings/identity')}
        />
        <SettingsRow
          icon="at-outline"
          label="Community handle"
          value="How you appear on the feed"
          onPress={() => router.push('/community/handle')}
        />
        <SettingsRow
          icon="id-card-outline"
          label="Hunter profile"
          value="Rank, stats, records"
          onPress={() => router.push('/profile')}
          last
        />
      </Card>

      <SectionHeader title="Training" />
      <Card padded={false}>
        <SettingsRow
          icon="calendar-outline"
          label="Days, time & gym"
          value={`${days} · ${time}`}
          onPress={() => router.push('/training-settings')}
        />
        <SettingsRow
          icon="barbell-outline"
          label="Program"
          value={today.program.name}
          onPress={() => router.push('/programs')}
        />
        <SettingsRow
          icon="body-outline"
          label="Private progress"
          value="Measurements, photos, debrief"
          onPress={() => router.push('/progress')}
          last
        />
      </Card>

      <SectionHeader title="Nutrition" />
      <Card padded={false}>
        <SettingsRow
          icon="nutrition-outline"
          label="Goals & macros"
          value={me?.nutrition?.goal ? me.nutrition.goal.replace(/^\w/, (x) => x.toUpperCase()) : 'Open diary settings'}
          onPress={() => router.push('/diary/settings')}
          last
        />
      </Card>

      <SectionHeader title="Notifications" />
      <Card padded={false}>
        <SettingsRow
          icon="notifications-outline"
          label="Reminders"
          value={quest}
          onPress={() => router.push('/settings/notifications')}
          last
        />
      </Card>

      <SectionHeader title="Subscription" />
      <Card padded={false}>
        <SettingsRow
          icon="diamond-outline"
          label="Your plan"
          value={plan}
          onPress={() => router.push('/settings/subscription')}
          last
        />
      </Card>

      <SectionHeader title="Privacy & account" />
      <AccountSection />
      {accountValue ? <Text variant="caption" muted>{accountValue}</Text> : null}

      <SectionHeader title="About" />
      <Card padded={false}>
        {env.privacyUrl ? (
          <SettingsRow icon="document-text-outline" label="Privacy Policy" onPress={() => void Linking.openURL(env.privacyUrl)} />
        ) : null}
        {env.termsUrl ? (
          <SettingsRow icon="reader-outline" label="Terms of Use" onPress={() => void Linking.openURL(env.termsUrl)} />
        ) : null}
        <SettingsRow
          icon="information-circle-outline"
          label="Version"
          value={`${env.appVersion}${Platform.OS === 'ios' ? ' · iOS' : Platform.OS === 'android' ? ' · Android' : ''}`}
          last
        />
      </Card>
      <Text variant="caption" muted color={c.textMuted}>LIMITBREAK. Looks never buy power.</Text>
    </Page>
  );
}
