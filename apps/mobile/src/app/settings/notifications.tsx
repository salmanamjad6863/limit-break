import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useUpdateNotifications, workoutRemindersOn } from '@/features/settings/api';
import { useMe } from '@/features/progression';
import { useToday, useTrainingProfile } from '@/features/training';
import { requestNotificationPermission } from '@/lib/notifications';
import { useTheme } from '@/theme';
import { Button, Card, Page, PressableScale, ScreenHeader, SectionHeader, Text } from '@/ui';

const TIMES = ['06:00', '07:00', '08:00', '12:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

/** Daily Quest + workout reminder toggles. */
export default function NotificationSettings() {
  const { c, spacing, radius } = useTheme();
  const { data: me } = useMe();
  const today = useToday();
  const profile = useTrainingProfile();
  const save = useUpdateNotifications();
  const [questOn, setQuestOn] = useState(me?.notificationsOptIn !== false);
  const [questTime, setQuestTime] = useState(me?.questTime ?? '07:00');
  const [workoutOn, setWorkoutOn] = useState(workoutRemindersOn() && !!profile.workoutTime);

  const chip = (label: string, on: boolean, onPress: () => void) => (
    <PressableScale
      key={label}
      haptic="tap"
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={{
        paddingHorizontal: spacing[3],
        paddingVertical: spacing[2],
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: on ? c.accent : c.border,
        backgroundColor: on ? `${c.accent}1F` : c.surfaceRaised,
      }}
    >
      <Text variant="callout" color={on ? c.text : c.textDim}>{label}</Text>
    </PressableScale>
  );

  return (
    <Page
      header={<ScreenHeader title="Notifications" />}
      footer={
        <Button
          label="Save"
          icon="checkmark"
          loading={save.isPending}
          onPress={async () => {
            if (questOn || workoutOn) await requestNotificationPermission().catch(() => false);
            save.mutate(
              {
                notificationsOptIn: questOn,
                questTime,
                workoutReminders: workoutOn,
                weekdays: today.weekdays,
                workoutTime: profile.workoutTime ?? null,
                workoutName: today.workout.name,
              },
              { onSuccess: () => router.back() },
            );
          }}
        />
      }
    >
      <Text variant="callout" dim>Turn types on or off. Workout reminders use the time from Training settings.</Text>
      {save.isError ? <Text variant="caption" color={c.warning}>Couldn’t save. Check your connection and try again.</Text> : null}

      <SectionHeader title="Daily Quest" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {chip('On', questOn, () => setQuestOn(true))}
        {chip('Off', !questOn, () => setQuestOn(false))}
      </View>
      {questOn ? (
        <>
          <Text variant="caption" muted>Arrives at this time every day.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {TIMES.map((t) => chip(t, questTime === t, () => setQuestTime(t)))}
          </View>
        </>
      ) : null}

      <SectionHeader title="Workout" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {chip('On', workoutOn, () => setWorkoutOn(true))}
        {chip('Off', !workoutOn, () => setWorkoutOn(false))}
      </View>
      {workoutOn && !profile.workoutTime ? (
        <Card tint={c.warning}>
          <Text variant="callout">Pick a usual training time first.</Text>
          <Button size="md" variant="secondary" label="Training settings" onPress={() => router.push('/training-settings')} />
        </Card>
      ) : (
        <Text variant="caption" muted>
          {profile.workoutTime
            ? `30 minutes before ${profile.workoutTime} on your training days.`
            : 'No training time set — reminders stay off until you pick one.'}
        </Text>
      )}
    </Page>
  );
}
