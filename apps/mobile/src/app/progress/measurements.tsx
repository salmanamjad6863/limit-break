import { useState } from 'react';
import { View } from 'react-native';
import { useGameDate } from '@/features/nutrition';
import { useMeasurements, useUpsertMeasurement } from '@/features/depth';
import { useTheme } from '@/theme';
import { Button, Card, Page, ScreenHeader, SectionHeader, Text } from '@/ui';
import { TextField } from '@/ui/form';

function parseCm(s: string) {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

/** Private tape measurements (SYSTEMS.md §6.2). Weight stays on the nutrition weigh-in screen. */
export default function MeasurementsScreen() {
  const { c, spacing } = useTheme();
  const today = useGameDate();
  const { data, isLoading } = useMeasurements();
  const save = useUpsertMeasurement();
  const [waist, setWaist] = useState('');
  const [chest, setChest] = useState('');
  const [arm, setArm] = useState('');
  const [hip, setHip] = useState('');

  const waistCm = parseCm(waist);
  const chestCm = parseCm(chest);
  const armCm = parseCm(arm);
  const hipCm = parseCm(hip);
  const valid =
    (waistCm != null && waistCm >= 30 && waistCm <= 250) ||
    (chestCm != null && chestCm >= 40 && chestCm <= 250) ||
    (armCm != null && armCm >= 10 && armCm <= 80) ||
    (hipCm != null && hipCm >= 40 && hipCm <= 250);

  const rows = [...(data?.measurements ?? [])].reverse().slice(0, 20);

  return (
    <Page header={<ScreenHeader title="Measurements" />}>
      <Card>
        <Text variant="callout" dim>Same spot, same tension, same time of day. These never leave your private vault.</Text>
        <TextField label="Waist (cm)" placeholder="e.g. 82" value={waist} onChangeText={setWaist} keyboardType="decimal-pad" />
        <TextField label="Chest (cm)" placeholder="optional" value={chest} onChangeText={setChest} keyboardType="decimal-pad" />
        <TextField label="Arm (cm)" placeholder="optional" value={arm} onChangeText={setArm} keyboardType="decimal-pad" />
        <TextField label="Hip (cm)" placeholder="optional" value={hip} onChangeText={setHip} keyboardType="decimal-pad" />
        <Button
          size="md"
          icon="checkmark"
          label="Save today’s tape"
          disabled={!valid}
          loading={save.isPending}
          onPress={() =>
            save.mutate(
              {
                localDate: today,
                ...(waistCm != null && waistCm >= 30 && waistCm <= 250 ? { waistCm } : {}),
                ...(chestCm != null && chestCm >= 40 && chestCm <= 250 ? { chestCm } : {}),
                ...(armCm != null && armCm >= 10 && armCm <= 80 ? { armCm } : {}),
                ...(hipCm != null && hipCm >= 40 && hipCm <= 250 ? { hipCm } : {}),
              },
              { onSuccess: () => { setWaist(''); setChest(''); setArm(''); setHip(''); } },
            )
          }
        />
        {save.isError ? <Text variant="caption" color={c.warning}>Couldn’t save. Check the numbers and try again.</Text> : null}
      </Card>

      {isLoading ? <Text dim>Loading…</Text> : null}
      {rows.length ? <SectionHeader title="History" /> : null}
      {rows.length ? (
        <Card padded={false}>
          {rows.map((m, i) => (
            <View key={m.id} style={{ paddingVertical: spacing[3], paddingHorizontal: spacing[4], borderTopWidth: i ? 1 : 0, borderColor: c.border, gap: 2 }}>
              <Text variant="callout">{new Date(`${m.localDate}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
              <Text variant="caption" muted>
                {[
                  m.waistCm != null ? `Waist ${m.waistCm}` : null,
                  m.chestCm != null ? `Chest ${m.chestCm}` : null,
                  m.armCm != null ? `Arm ${m.armCm}` : null,
                  m.hipCm != null ? `Hip ${m.hipCm}` : null,
                  m.weightKg != null ? `Weight ${m.weightKg}` : null,
                ].filter(Boolean).join(' · ') || '—'}
              </Text>
            </View>
          ))}
        </Card>
      ) : !isLoading ? (
        <Text variant="caption" muted>No measurements yet.</Text>
      ) : null}
    </Page>
  );
}
