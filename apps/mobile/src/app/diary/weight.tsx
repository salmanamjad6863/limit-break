import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { useNutritionActions, useNutritionSummary, useGameDate } from '@/features/nutrition';
import { useTheme } from '@/theme';
import { Button, Card, Icon, Page, PressableScale, ScreenHeader, SectionHeader, Text } from '@/ui';
import { TextField } from '@/ui/form';

/** Weigh-ins and the smoothed trend that drives adaptive targets (SYSTEMS.md §1.4, §2.3). */
export default function Weight() {
  const { c, spacing } = useTheme();
  const today = useGameDate();
  const { data } = useNutritionSummary();
  const { addWeighIn, deleteWeighIn } = useNutritionActions();
  const [kg, setKg] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const value = Number(kg.replace(',', '.'));
  const valid = value >= 30 && value <= 300;
  const points = data?.weighIns ?? [];

  return (
    <Page accent={c.mana} header={<ScreenHeader title="Weight trend" />}>
      <Card>
        <TextField label="Today’s weight (kg)" placeholder={points.length ? points.at(-1)!.kg.toFixed(1) : 'e.g. 78.4'} value={kg} onChangeText={setKg} keyboardType="decimal-pad" />
        <Button size="md" icon={saved ? 'checkmark-circle' : 'checkmark'} label={saved ? 'Saved' : 'Save weigh-in'}
          disabled={!valid || saved} loading={addWeighIn.isPending}
          onPress={() => addWeighIn.mutate({ weightKg: Math.round(value * 10) / 10, localDate: today }, {
            onSuccess: () => {
              setKg('');
              setSaved(true);
              setTimeout(() => setSaved(false), 1200);
            },
          })} />
        <Text variant="caption" muted>Same time each morning, after the bathroom, before food. Daily ups and downs are water; the trend line is what counts.</Text>
        {addWeighIn.isError ? <Text variant="caption" color={c.warning}>Couldn’t save the weigh-in. Try again.</Text> : null}
      </Card>
      {points.length >= 2 ? <TrendChart points={points} /> : null}
      {data && points.length ? (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Stat label="Trend" value={`${data.plan.trendKg.toFixed(1)} kg`} />
            <Stat label={data.checkIn.observedKgPerWeek == null ? 'Rate: 5+ weigh-ins' : 'Rate / week'} value={data.checkIn.observedKgPerWeek == null ? '—' : `${data.checkIn.observedKgPerWeek >= 0 ? '+' : '−'}${Math.abs(data.checkIn.observedKgPerWeek).toFixed(2)} kg`} />
            <Stat label="Plan / week" value={`${data.checkIn.goalKgPerWeek >= 0 ? '+' : '−'}${Math.abs(data.checkIn.goalKgPerWeek).toFixed(2)} kg`} />
          </View>
        </Card>
      ) : null}
      {points.length ? <SectionHeader title="History" /> : null}
      {points.length ? (
        <Card padded={false}>
          {[...points].reverse().slice(0, 30).map((p, i) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], paddingHorizontal: spacing[4], borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
              <Text variant="callout" style={{ flex: 1 }}>{new Date(`${p.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
              <Text variant="callout">{`${p.kg.toFixed(1)} kg`}</Text>
              <Text variant="caption" muted style={{ width: 70, textAlign: 'right' }}>{`trend ${p.trend.toFixed(1)}`}</Text>
              <PressableScale haptic="tap"
                onPress={() => (confirmDelete === p.id ? (deleteWeighIn.mutate(p.id), setConfirmDelete(null)) : setConfirmDelete(p.id))}
                accessibilityRole="button" accessibilityLabel={confirmDelete === p.id ? `Confirm delete weigh-in ${p.date}` : `Delete weigh-in ${p.date}`}
                style={{ paddingHorizontal: 8, height: 28, borderRadius: 14, justifyContent: 'center', backgroundColor: confirmDelete === p.id ? `${c.danger}22` : 'transparent' }}>
                {confirmDelete === p.id ? <Text variant="caption" color={c.danger}>Delete?</Text> : <Icon name="trash-outline" size={16} color={c.textMuted} />}
              </PressableScale>
            </View>
          ))}
        </Card>
      ) : null}
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1, gap: 2 }}>
      <Text variant="headline" numberOfLines={1}>{value}</Text>
      <Text variant="caption" muted>{label}</Text>
    </View>
  );
}

function TrendChart({ points }: { points: { date: string; kg: number; trend: number }[] }) {
  const { c, radius } = useTheme();
  const [w, setW] = useState(0);
  const h = 170;
  const pad = 14;
  const { trend, dots } = useMemo(() => {
    const vals = points.flatMap((p) => [p.kg, p.trend]);
    const lo = Math.min(...vals) - 0.3;
    const hi = Math.max(...vals) + 0.3;
    const x = (i: number) => pad + (i / Math.max(1, points.length - 1)) * Math.max(1, w - pad * 2);
    const y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (h - pad * 2);
    const b = Skia.PathBuilder.Make();
    points.forEach((p, i) => (i ? b.lineTo(x(i), y(p.trend)) : b.moveTo(x(i), y(p.trend))));
    return { trend: b.detach(), dots: points.map((p, i) => ({ cx: x(i), cy: y(p.kg) })) };
  }, [points, w]);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: h, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}
      accessibilityRole="image" accessibilityLabel={`Weight trend from ${points[0]!.trend.toFixed(1)} to ${points.at(-1)!.trend.toFixed(1)} kilograms`}>
      {w ? (
        <Canvas style={{ width: w, height: h }} __destroyWebGLContextAfterRender={Platform.OS === 'web'}>
          {dots.map((d, i) => <Circle key={i} cx={d.cx} cy={d.cy} r={3} color={`${c.textMuted}`} />)}
          <Path path={trend} style="stroke" strokeWidth={3} color={c.mana} strokeCap="round" strokeJoin="round" />
        </Canvas>
      ) : null}
    </View>
  );
}
