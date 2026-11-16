import { bmr, calorieTarget, macroTargets, tdeePrior } from '@lb/engine';
import { dataColors } from '@lb/tokens';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Appear, Bar, Button, Card, CountUp, Pill, Screen, SectionHeader, Text } from '@/ui';
import { Ring } from '@/ui/fx';

// Demo targets: SYSTEMS.md §2.6 worked example (real profile data arrives with food logging).
const user = { sex: 'male' as const, weightKg: 80, heightCm: 178, ageYears: 25 };
const prior = tdeePrior({ ...user, lifestyle: 'light', weeklySessions: Array.from({ length: 4 }, () => ({ kind: 'strength' as const, minutes: 60 })) });
const target = calorieTarget({ ...user, tdee: prior, bmr: bmr(user), trendWeightKg: 80, goal: 'cut', ratePerWeek: -0.005 });
const m = macroTargets({ kcal: target.kcal, goal: 'cut', weightKg: 80, heightCm: 178 });
const EATEN = { kcal: 1310, protein: 112, carbs: 120, fat: 40 };

export default function NutritionScreen() {
  const { c, spacing } = useTheme();
  const left = Math.round(target.kcal - EATEN.kcal);
  const macros = [
    { label: 'Protein', sub: 'Mana', eaten: EATEN.protein, target: m.proteinG, color: dataColors.protein },
    { label: 'Carbs', eaten: EATEN.carbs, target: m.carbsG, color: dataColors.carbs },
    { label: 'Fat', eaten: EATEN.fat, target: m.fatG, color: dataColors.fat },
  ];
  return (
    <Screen title="Nutrition" subtitle="Adaptive targets from your real weight trend." accent={c.mana} right={<Pill icon="sparkles" label="Demo data" />}>
      <Appear index={1}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[5] }}>
            <Ring ratio={EATEN.kcal / target.kcal} size={128} stroke={12} color={dataColors.calories}>
              <CountUp variant="stat" value={left} />
              <Text variant="caption" muted>kcal left</Text>
            </Ring>
            <View style={{ flex: 1, gap: spacing[2] }}>
              <Row k="Target" v={`${Math.round(target.kcal).toLocaleString()} kcal`} />
              <Row k="Eaten" v={`${EATEN.kcal.toLocaleString()} kcal`} />
              <Row k="Expenditure" v={`${Math.round(prior).toLocaleString()} kcal`} />
              <Row k="Goal" v="−0.5% / week" />
            </View>
          </View>
        </Card>
      </Appear>

      <Appear index={2} style={{ gap: spacing[3] }}>
        <SectionHeader title="Macros" />
        <Card>
          {macros.map((x, i) => (
            <View key={x.label} style={{ gap: spacing[2] }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Text variant="callout">
                  {x.label}
                  {x.sub ? <Text variant="caption" color={x.color}>{`  ${x.sub}`}</Text> : null}
                </Text>
                <Text variant="callout" dim>{`${x.eaten} / ${Math.round(x.target)} g`}</Text>
              </View>
              <Bar ratio={x.eaten / x.target} height={6} color={x.color} delayMs={250 + i * 100} />
            </View>
          ))}
        </Card>
      </Appear>

      <Appear index={3} style={{ gap: spacing[3] }}>
        <SectionHeader title="Log food" />
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <View style={{ flex: 1 }}><Button variant="secondary" size="md" icon="barcode-outline" label="Scan" /></View>
          <View style={{ flex: 1 }}><Button variant="secondary" size="md" icon="camera-outline" label="Photo" /></View>
          <View style={{ flex: 1 }}><Button variant="secondary" size="md" icon="search" label="Search" /></View>
        </View>
      </Appear>
    </Screen>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text variant="caption" muted>{k}</Text>
      <Text variant="caption">{v}</Text>
    </View>
  );
}
