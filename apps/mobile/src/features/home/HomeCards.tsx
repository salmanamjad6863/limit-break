/**
 * Home dashboard blocks (docs/plans/HOME_QUESTS_REDESIGN.md §3): one "Up next" hero, a Today checklist,
 * a compact hunter card, a stats chart and a boss teaser. Details live in Train and Quests.
 */
type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
import { rankColor, statColors } from '@lb/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { Bar, Button, CountUp, Icon, type IconName, PressableScale, Text } from '@/ui';
import { HeroEmblem, RankBadge, Ring } from '@/ui/fx';

/* ---------------- Up next ---------------- */

export function UpNextCard({ color, eyebrow, title, meta, body, art, action, secondary, icon }: {
  color: string;
  eyebrow: string;
  title: string;
  meta?: { icon: IconName; text: string }[];
  body?: string;
  art?: ReactNode;
  icon?: IconName;
  action: { label: string; icon?: IconName; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
}) {
  const { c, radius, spacing } = useTheme();
  return (
    <View style={{ borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: `${color}55` }}>
      <LinearGradient colors={[`${color}4D`, `${color}12`, c.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: spacing[4], gap: spacing[3] }}>
        {icon ? (
          <View pointerEvents="none" style={{ position: 'absolute', right: -16, top: -12, opacity: 0.12 }}>
            <Icon name={icon} size={140} color={color} />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text variant="label" color={color}>{eyebrow}</Text>
            <Text variant="title" numberOfLines={2}>{title}</Text>
            {meta?.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing[3], rowGap: 4 }}>
                {meta.map((m) => (
                  <View key={m.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name={m.icon} size={14} color={c.textDim} />
                    <Text variant="caption" dim>{m.text}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {body ? <Text variant="callout" dim>{body}</Text> : null}
          </View>
          {art}
        </View>
        <Button label={action.label} icon={action.icon} onPress={action.onPress} />
        {secondary ? (
          <PressableScale haptic="tap" onPress={secondary.onPress} accessibilityRole="button" accessibilityLabel={secondary.label} style={{ alignSelf: 'center', paddingVertical: 4 }}>
            <Text variant="callout" color={c.accentGlow}>{secondary.label}</Text>
          </PressableScale>
        ) : null}
      </LinearGradient>
    </View>
  );
}

/* ---------------- Today checklist ---------------- */

export interface TodayItem {
  key: string;
  icon: IconName;
  color: string;
  title: string;
  detail: string;
  ratio: number;
  done: boolean;
  onPress: () => void;
}

export function TodayList({ items }: { items: TodayItem[] }) {
  const { c, radius, spacing } = useTheme();
  const doneCount = items.filter((i) => i.done).length;
  return (
    <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing[4], paddingTop: spacing[3] }}>
        <Text variant="label" muted>Today</Text>
        <Text variant="caption" color={doneCount === items.length ? c.success : c.textMuted}>{`${doneCount} of ${items.length} done`}</Text>
      </View>
      {items.map((it, i) => (
        <PressableScale key={it.key} haptic="tap" onPress={it.onPress} accessibilityRole="button" accessibilityLabel={`${it.title}: ${it.detail}${it.done ? ', done' : ''}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3], borderTopWidth: i ? 1 : 0, borderColor: c.border }}>
            <Ring ratio={it.done ? 1 : it.ratio} size={42} stroke={4} color={it.done ? c.success : it.color} delayMs={150 + i * 100}>
              <Icon name={it.done ? 'checkmark' : it.icon} size={17} color={it.done ? c.success : it.color} />
            </Ring>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="callout" style={{ fontFamily: 'Inter_600SemiBold' }}>{it.title}</Text>
              <Text variant="caption" muted numberOfLines={1}>{it.detail}</Text>
            </View>
            <Icon name="chevron-forward" size={16} color={c.textMuted} />
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

/* ---------------- Hunter card ---------------- */

export function HunterCard({ name, epithet, accent, level, power, rank, xpInto, xpNeeded, ratio, trialHint, onPress }: {
  name: string; epithet: string; accent: string; level: number; power: number; rank: Rank;
  xpInto: number; xpNeeded: number; ratio: number; trialHint: { rank: Rank; text: string } | null; onPress: () => void;
}) {
  const { c, radius, spacing } = useTheme();
  return (
    <PressableScale haptic="tap" scaleTo={0.98} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Hunter profile: level ${level}, ${rank}-Rank`}>
      <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: spacing[4], gap: spacing[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <HeroEmblem size={68} color={accent} initial={name.charAt(0).toUpperCase()} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label" color={accent} numberOfLines={1}>{epithet}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing[2] }}>
              <Text variant="heading">Level</Text>
              <CountUp variant="stat" value={level} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="flash" size={13} color={c.accentGlow} />
              <CountUp variant="caption" value={power} duration={1200} color={c.text} />
              <Text variant="caption" muted>power</Text>
            </View>
          </View>
          <View style={{ alignItems: 'center' }}>
            <RankBadge rank={rank} size={52} />
            <Text variant="micro" color={rankColor[rank]}>{`${rank}-Rank`}</Text>
          </View>
        </View>
        <Bar ratio={ratio} height={6} color={c.accent} delayMs={250} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption" muted>{`${xpInto.toLocaleString()} / ${xpNeeded.toLocaleString()} XP`}</Text>
          <Text variant="caption" dim>{`${(xpNeeded - xpInto).toLocaleString()} XP to level ${level + 1}`}</Text>
        </View>
        {trialHint ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="shield-checkmark" size={14} color={rankColor[trialHint.rank]} />
            <Text variant="caption" color={rankColor[trialHint.rank]}>{trialHint.text}</Text>
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}

/* ---------------- True Stats chart ---------------- */

const STAT_NAME = { STR: 'Strength', AGI: 'Agility', END: 'Endurance', VIT: 'Vitality', SPI: 'Spirit' } as const;
export type StatKey = keyof typeof STAT_NAME;

export function StatsChart({ stats }: { stats: Record<StatKey, number> }) {
  const { c, radius, spacing } = useTheme();
  const keys = Object.keys(STAT_NAME) as StatKey[];
  const max = Math.max(500, ...keys.map((k) => stats[k]));
  const H = 96;
  return (
    <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: spacing[4], gap: spacing[3] }}
      accessibilityLabel={`True stats: ${keys.map((k) => `${STAT_NAME[k]} ${stats[k]}`).join(', ')}`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing[2] }}>
        {keys.map((k) => {
          const color = statColors[k][0];
          return (
            <View key={k} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              <Text variant="callout" style={{ fontFamily: 'Inter_600SemiBold' }}>{stats[k]}</Text>
              <View style={{ width: '100%', maxWidth: 34, height: H, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'flex-end', overflow: 'hidden' }}>
                <LinearGradient colors={[color, `${color}66`]} style={{ height: Math.max(6, (stats[k] / max) * H), borderRadius: 10 }} />
              </View>
              <Text variant="micro" muted>{k}</Text>
            </View>
          );
        })}
      </View>
      <Text variant="caption" muted>{"From real tests and training data. They can't be bought."}</Text>
    </View>
  );
}

/* ---------------- boss teaser ---------------- */

export function BossTeaser({ hpPct, won, prophecy, onPress }: { hpPct: number; won: boolean; prophecy: boolean; onPress: () => void }) {
  const { c, radius, spacing } = useTheme();
  const boss = '#A893FF';
  return (
    <PressableScale haptic="tap" onPress={onPress} accessibilityRole="button" accessibilityLabel={`Weekly boss, ${won ? 'defeated' : `${Math.round(hpPct)}% HP left`}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], borderRadius: radius.lg, borderWidth: 1, borderColor: `${boss}44`, backgroundColor: c.surface, padding: spacing[4] }}>
        <View style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: `${boss}22` }}>
          <Icon name={won ? 'trophy' : 'skull'} size={20} color={won ? c.success : boss} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="callout" style={{ fontFamily: 'Inter_600SemiBold' }}>{prophecy ? "The Shadow's Prophecy" : 'Your Shadow-Self'}</Text>
            <Text variant="caption" color={won ? c.success : c.textDim}>{won ? 'Defeated' : `${Math.round(hpPct)}% HP`}</Text>
          </View>
          <Bar ratio={won ? 1 : hpPct / 100} height={6} color={won ? c.success : boss} />
        </View>
        <Icon name="chevron-forward" size={16} color={c.textMuted} />
      </View>
    </PressableScale>
  );
}
