/**
 * Quests blocks (docs/plans/HOME_QUESTS_REDESIGN.md §4): streak hero with this week's dots,
 * side-quest tiles, and a plain-language weekly boss.
 */
import type { BossResponse, StreakDto } from '@lb/contracts';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Bar, Button, CountUp, Icon, type IconName, PressableScale, Text } from '@/ui';

const FLAME = '#FF9F43';
const DAY = 86_400_000;
const LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Days this week covered by the current streak. The streak runs back from today (if today's quest is
 * cleared) or from yesterday, so the dots are exactly the streak's days that fall in this week.
 */
function weekDots(dateIso: string, current: number, clearedToday: boolean): ('done' | 'today' | 'missed' | 'future')[] {
  const t = Date.parse(`${dateIso}T00:00:00Z`);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
  const end = clearedToday ? t : t - DAY; // last streak day
  const start = end - (current - 1) * DAY;
  return LABELS.map((_, i) => {
    const d = t + (i - dow) * DAY;
    if (d > t) return 'future';
    if (current > 0 && d >= start && d <= end) return 'done';
    if (d === t) return 'today';
    return 'missed';
  });
}

export function StreakHero({ streak, date, clearedToday, nextMilestone, penalty }: {
  streak: StreakDto; date: string; clearedToday: boolean; nextMilestone: number | undefined; penalty: boolean;
}) {
  const { c, radius, spacing } = useTheme();
  const color = penalty ? c.danger : FLAME;
  const dots = weekDots(date, streak.current, clearedToday);
  const prevMilestone = 0;
  const ratio = nextMilestone ? (streak.current - prevMilestone) / (nextMilestone - prevMilestone) : 1;
  return (
    <View style={{ borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: `${color}55` }}
      accessibilityLabel={`${streak.current} day streak. Best ${streak.longest}. ${streak.shields} shields.`}>
      <LinearGradient colors={[`${color}55`, `${color}14`, c.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: spacing[4], gap: spacing[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}26` }}>
            <Icon name="flame" size={38} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <CountUp variant="stat" value={streak.current} style={{ fontSize: 44, lineHeight: 48 }} />
              <Text variant="heading" dim>{streak.current === 1 ? 'day' : 'days'}</Text>
            </View>
            <Text variant="caption" dim>
              {penalty ? 'At risk: clear the Penalty Zone today' : streak.current === 0 ? 'Clear today’s quest to start your streak' : `Best ${streak.longest} · keep it alive today`}
            </Text>
          </View>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {Array.from({ length: Math.max(streak.shields, 2) }, (_, i) => (
                <Icon key={i} name={i < streak.shields ? 'shield' : 'shield-outline'} size={16} color={i < streak.shields ? c.mana : c.textMuted} />
              ))}
            </View>
            <Text variant="micro" muted>{`${streak.shields} shield${streak.shields === 1 ? '' : 's'}`}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {dots.map((d, i) => (
            <View key={i} style={{ alignItems: 'center', gap: 6 }}>
              <View style={{
                width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                backgroundColor: d === 'done' ? color : d === 'today' ? `${color}22` : 'rgba(255,255,255,0.05)',
                borderWidth: d === 'today' ? 1.5 : 0, borderColor: color,
              }}>
                {/* only streak days are marked: past days off the streak stay neutral, never "failed" */}
                {d === 'done' ? <Icon name="flame" size={16} color="#1A0F05" /> : null}
              </View>
              <Text variant="micro" color={d === 'today' ? color : c.textMuted}>{LABELS[i]}</Text>
            </View>
          ))}
        </View>

        {nextMilestone ? (
          <View style={{ gap: 6 }}>
            <Bar ratio={ratio} height={6} color={color} />
            <Text variant="caption" muted>{`${nextMilestone - streak.current} more ${nextMilestone - streak.current === 1 ? 'day' : 'days'} to the ${nextMilestone}-day title`}</Text>
          </View>
        ) : <Text variant="caption" color={color}>Legendary streak</Text>}
      </LinearGradient>
    </View>
  );
}

/* ---------------- side quests ---------------- */

export function SideTile({ icon, color, title, status, selected, onPress, action }: {
  icon: IconName; color: string; title: string; status: string;
  selected?: boolean; onPress?: () => void; action?: { label: string; disabled?: boolean; onPress: () => void } | 'done';
}) {
  const { c, radius, spacing } = useTheme();
  const done = action === 'done';
  const body = (
    <View style={{
      flex: 1, minHeight: 128, padding: spacing[3], gap: spacing[2], borderRadius: radius.lg, borderWidth: selected ? 1.5 : 1,
      borderColor: selected ? c.accent : done ? `${c.success}55` : c.border, backgroundColor: selected ? `${c.accent}1A` : done ? `${c.success}10` : c.surface,
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}22` }}>
          <Icon name={icon} size={18} color={color} />
        </View>
        {selected !== undefined ? <Icon name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={selected ? c.accent : c.textMuted} /> : null}
        {done ? <Icon name="checkmark-circle" size={20} color={c.success} /> : null}
      </View>
      <Text variant="callout" numberOfLines={2} color={done ? c.textDim : c.text} style={{ fontFamily: 'Inter_600SemiBold', flex: 1 }}>{title}</Text>
      <Text variant="micro" muted numberOfLines={1}>{status}</Text>
      {action && action !== 'done' ? (
        <PressableScale haptic="press" onPress={action.onPress} disabled={action.disabled} accessibilityRole="button" accessibilityLabel={`${action.label}: ${title}`}
          style={{ height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: action.disabled ? c.surfaceRaised : c.accent, opacity: action.disabled ? 0.6 : 1 }}>
          <Text variant="caption" color={action.disabled ? c.textMuted : '#FFFFFF'} style={{ fontFamily: 'Inter_600SemiBold' }}>{action.label}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
  return onPress ? (
    <PressableScale haptic="tap" onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: !!selected }} accessibilityLabel={title} style={{ flex: 1 }}>
      {body}
    </PressableScale>
  ) : body;
}

/** Two-column grid of tiles. */
export function TileGrid({ children }: { children: React.ReactNode[] }) {
  const { spacing } = useTheme();
  const rows: React.ReactNode[][] = [];
  children.forEach((ch, i) => (i % 2 ? rows[rows.length - 1]!.push(ch) : rows.push([ch])));
  return (
    <View style={{ gap: spacing[3] }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: spacing[3] }}>
          {r}
          {r.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

/* ---------------- weekly boss ---------------- */

const OBJECTIVES = [
  { key: 'hardSets', label: 'Hard sets', icon: 'barbell-outline', unit: '' },
  { key: 'volumeKg', label: 'Volume lifted', icon: 'trending-up-outline', unit: ' kg' },
  { key: 'cardioMin', label: 'Cardio', icon: 'heart-outline', unit: ' min' },
  { key: 'questDays', label: 'Quest days', icon: 'flag-outline', unit: '' },
] as const;

export function BossCard({ boss, onClaim, claiming }: { boss: BossResponse; onClaim: () => void; claiming?: boolean }) {
  const { c, radius, spacing } = useTheme();
  const color = '#A893FF';
  const damage = Math.max(0, Math.min(100, 100 - boss.hpPct));
  return (
    <View style={{ borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: `${color}44` }}>
      <LinearGradient colors={[`${color}33`, c.surface]} style={{ padding: spacing[4], gap: spacing[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <View style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}26` }}>
            <Icon name={boss.won ? 'trophy' : 'skull'} size={24} color={boss.won ? c.success : color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="heading">{boss.prophecy ? "The Shadow's Prophecy" : 'Your Shadow-Self'}</Text>
            <Text variant="caption" dim>{boss.prophecy ? 'Beat the plan the System set for your first weeks.' : 'You, four weeks ago. Out-train your past self.'}</Text>
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="label" color={boss.won ? c.success : color}>{boss.won ? 'Defeated' : 'Boss HP'}</Text>
            <Text variant="callout" style={{ fontFamily: 'Inter_600SemiBold' }}>{boss.won ? '0%' : `${Math.round(boss.hpPct)}%`}</Text>
          </View>
          <Bar ratio={boss.won ? 0 : boss.hpPct / 100} height={12} color={boss.won ? c.success : color} />
          <Text variant="caption" muted>
            {boss.won ? 'Victory this week.' : `${Math.round(damage)}% damage dealt. Train, lift, do cardio and clear quests to hit harder.`}
          </Text>
        </View>
        <View style={{ gap: spacing[2] }}>
          {OBJECTIVES.map((o) => {
            const now = boss.current[o.key];
            const past = boss.past?.[o.key];
            const beat = past != null && now >= past && past > 0;
            return (
              <View key={o.key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                <Icon name={o.icon} size={16} color={c.textDim} />
                <Text variant="callout" style={{ flex: 1 }}>{o.label}</Text>
                <Text variant="callout" style={{ fontFamily: 'Inter_600SemiBold' }}>{`${Math.round(now).toLocaleString()}${o.unit}`}</Text>
                {past != null ? (
                  <Text variant="caption" color={beat ? c.success : c.textMuted} style={{ minWidth: 64, textAlign: 'right' }}>
                    {beat ? 'beaten' : `of ${Math.round(past).toLocaleString()}`}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
        {boss.won && !boss.claimed ? <Button label="Claim victory · +150 XP" icon="trophy" loading={claiming} onPress={onClaim} /> : null}
        {boss.claimed ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="trophy" size={14} color={c.success} />
            <Text variant="caption" color={c.success}>Victory claimed this week</Text>
          </View>
        ) : null}
      </LinearGradient>
    </View>
  );
}
