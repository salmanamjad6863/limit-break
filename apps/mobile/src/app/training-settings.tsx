import type { TrainingSettingsInput } from '@lb/contracts';
import { validateWeekdays } from '@lb/engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useGymMode } from '@/features/depth';
import { EQUIPMENT, FULL_GYM, INJURIES } from '@/features/onboarding/options';
import { useToday, useTrainingProfile, useUpdateTraining } from '@/features/training';
import { requestNotificationPermission } from '@/lib/notifications';
import { useTheme } from '@/theme';
import { Button, Card, Page, PressableScale, ScreenHeader, SectionHeader, Text } from '@/ui';
import { Chips, Segmented } from '@/ui/form';

const DAYS = [
  { d: 1, label: 'Mon' }, { d: 2, label: 'Tue' }, { d: 3, label: 'Wed' }, { d: 4, label: 'Thu' }, { d: 5, label: 'Fri' }, { d: 6, label: 'Sat' }, { d: 0, label: 'Sun' },
];
const TIMES = ['06:00', '07:00', '08:00', '12:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
const WARN: Record<string, string> = {
  countNotSupported: 'This program is built for a different number of days. It still works, but consider a program that fits.',
  tooManyInARow: 'Many training days in a row. Leave a rest day between sessions that hit the same muscles.',
  noRestDay: 'No rest day. Recovery is when you get stronger.',
};

/** Every training choice, editable any time (SYSTEMS.md §3.10). Changes apply from the next game day. */
export default function TrainingSettings() {
  const { c, spacing, radius } = useTheme();
  const profile = useTrainingProfile();
  const today = useToday();
  const save = useUpdateTraining();
  const gymMode = useGymMode((x) => x.enabled);
  const setGymMode = useGymMode((x) => x.setEnabled);
  const [s, setS] = useState<TrainingSettingsInput>(() => ({
    experience: profile.experience, location: profile.location, equipment: profile.equipment, injuries: profile.injuries,
    sessionMinutes: ([15, 30, 45, 60, 75, 90].includes(profile.sessionMinutes) ? profile.sessionMinutes : 45) as TrainingSettingsInput['sessionMinutes'],
    weekdays: today.weekdays, workoutTime: profile.workoutTime ?? null,
  }));
  const set = (p: Partial<TrainingSettingsInput>) => setS((x) => ({ ...x, ...p }));
  const toggleDay = (d: number) => set({ weekdays: s.weekdays.includes(d) ? s.weekdays.filter((x) => x !== d) : [...s.weekdays, d] });
  const toggle = (k: 'equipment' | 'injuries', v: string) => set({ [k]: s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v] });
  const split = !today.program.days.every((d) => d.focus === 'full');
  const warnings = validateWeekdays(s.weekdays, today.program.daysPerWeek, split);
  const valid = s.weekdays.length >= 2 && s.weekdays.length <= 6;

  const chip = (label: string, on: boolean, onPress: () => void, a11y = label) => (
    <PressableScale key={label} haptic="tap" onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={a11y}
      style={{ paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.pill, borderWidth: 1.5, borderColor: on ? c.accent : c.border, backgroundColor: on ? `${c.accent}1F` : c.surfaceRaised }}>
      <Text variant="callout" color={on ? c.text : c.textDim}>{label}</Text>
    </PressableScale>
  );

  return (
    <Page header={<ScreenHeader title="Training settings" />}
      footer={<Button label="Save" icon="checkmark" disabled={!valid} loading={save.isPending}
        onPress={async () => {
          if (s.workoutTime) await requestNotificationPermission().catch(() => false);
          save.mutate({ input: s, nextWorkout: today.workout.name }, { onSuccess: () => router.back() });
        }} />}>
      <SectionHeader title="Training days" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {DAYS.map(({ d, label }) => chip(label, s.weekdays.includes(d), () => toggleDay(d), `Train on ${label}`))}
      </View>
      <Text variant="caption" muted>{`${s.weekdays.length} day${s.weekdays.length === 1 ? '' : 's'} a week · ${today.program.name} is built for ${today.program.daysPerWeek.join(' or ')}. Missed a day? The workout moves to your next day, so nothing is skipped.`}</Text>
      {!valid ? <Text variant="caption" color={c.warning}>Pick 2 to 6 days.</Text> : null}
      {valid && warnings.length ? (
        <Card tint={c.warning}>
          {warnings.map((w) => <Text key={w} variant="callout">{WARN[w]}</Text>)}
        </Card>
      ) : null}

      <SectionHeader title="Usual training time" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {chip('No reminder', s.workoutTime == null, () => set({ workoutTime: null }))}
        {TIMES.map((t) => chip(t, s.workoutTime === t, () => set({ workoutTime: t }), `Train at ${t}`))}
      </View>
      <Text variant="caption" muted>A reminder arrives 30 minutes before, on training days only.</Text>

      <SectionHeader title="Session length" />
      <Segmented options={[15, 30, 45, 60, 75, 90].map((m) => ({ value: String(m), label: `${m}′` }))} value={String(s.sessionMinutes)}
        onChange={(v) => set({ sessionMinutes: Number(v) as TrainingSettingsInput['sessionMinutes'] })} />
      <Text variant="caption" muted>Workouts fit this time: accessories pair into supersets first, main lifts are protected.</Text>

      <SectionHeader title="Where you train" />
      <Segmented options={[{ value: 'HOME', label: 'Home' }, { value: 'GYM', label: 'Gym' }, { value: 'HYBRID', label: 'Both' }]} value={s.location}
        onChange={(location) => set({ location, ...(location === 'GYM' ? { equipment: FULL_GYM } : {}) })} />
      <Chips options={EQUIPMENT} value={s.equipment} onToggle={(v) => toggle('equipment', v)} />

      <SectionHeader title="Level" />
      <Segmented options={[{ value: 'beginner', label: 'Begin.' }, { value: 'novice', label: 'Novice' }, { value: 'intermediate', label: 'Inter.' }, { value: 'advanced', label: 'Adv.' }, { value: 'pro', label: 'Pro' }]}
        value={s.experience} onChange={(experience) => set({ experience })} />
      <Text variant="caption" muted>Sets, reps and effort adapt to your level. Change it any time; the System suggests moving up when you’re ready.</Text>

      <SectionHeader title="Training profile" />
      <Segmented options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]}
        value={s.sex ?? (profile.sex === 'unspecified' ? undefined : profile.sex)} onChange={(sex) => set({ sex })} />
      <Text variant="caption" muted>Used for starting weights and strength levels. Every program is open to everyone.</Text>

      <SectionHeader title="Injuries to work around" />
      <Chips options={INJURIES} value={s.injuries} onToggle={(v) => toggle('injuries', v)} accent={c.danger} />
      <Text variant="caption" muted>Exercises that load these areas are swapped for safe alternatives.</Text>

      <SectionHeader title="Gym Mode" />
      <Card>
        <Text variant="callout">Bigger set controls and keep the screen awake during a live workout. Saved on this device.</Text>
        <Segmented
          options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]}
          value={gymMode ? 'on' : 'off'}
          onChange={(v) => setGymMode(v === 'on')}
        />
      </Card>

      <Button variant="ghost" size="md" icon="swap-horizontal" label={`Program: ${today.program.name} (change)`} onPress={() => router.push('/programs')} />
    </Page>
  );
}
