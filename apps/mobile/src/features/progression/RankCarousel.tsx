import { RANK_REQUIREMENTS, RANKS, type Rank } from '@lb/engine';
import { rankColor } from '@lb/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, View } from 'react-native';
import { useTheme } from '@/theme';
import { Bar, Icon, Pill, Text } from '@/ui';
import { RankBadge } from '@/ui/fx';

const EPITHET: Record<Rank, string> = { E: 'Awakened', D: 'Hunter', C: 'Veteran', B: 'Elite', A: 'Vanguard', S: 'Sovereign' };
const CARD = 196;
const GAP = 12;

/**
 * Rank mastery carousel: one card per rank, opening on yours. Past ranks are checked, the next one
 * shows the level bar toward its trial, later ones are locked previews of what's ahead.
 */
export function RankCarousel({ rank, level, next }: { rank: Rank; level: number; next: Rank | null }) {
  const { c, spacing, radius } = useTheme();
  const at = RANKS.indexOf(rank);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={CARD + GAP} decelerationRate="fast"
      contentOffset={{ x: Math.max(0, at * (CARD + GAP) - 40), y: 0 }} contentContainerStyle={{ gap: GAP, paddingRight: spacing[4] }}>
      {RANKS.map((r, i) => {
        const req = r === 'E' ? null : RANK_REQUIREMENTS[r];
        const current = r === rank;
        const reached = i <= at;
        const isNext = r === next;
        const color = rankColor[r];
        return (
          <View key={r} accessibilityLabel={`${r}-Rank, ${EPITHET[r]}. ${current ? 'Your rank' : reached ? 'Reached' : isNext ? 'Next' : 'Locked'}`}
            style={{ width: CARD, borderRadius: radius.lg, overflow: 'hidden', borderWidth: current ? 1.5 : 1, borderColor: current ? color : c.border, opacity: reached || isNext ? 1 : 0.6 }}>
            <LinearGradient colors={[`${color}${reached || isNext ? '40' : '18'}`, c.surface]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.75 }} style={{ position: 'absolute', inset: 0 }} />
            <View style={{ alignItems: 'center', gap: spacing[2], padding: spacing[4] }}>
              <View style={{ alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'flex-end', height: 22 }}>
                {current ? <Pill label="You" color={color} /> : reached ? <Icon name="checkmark-circle" size={18} color={c.success} />
                  : isNext ? <Pill label="Next" color={c.accentGlow} /> : <Icon name="lock-closed" size={16} color={c.textMuted} />}
              </View>
              <RankBadge rank={r} size={84} />
              <Text variant="headline">{`${r}-Rank`}</Text>
              <Text variant="caption" color={color}>{EPITHET[r]}</Text>
              <View style={{ alignSelf: 'stretch', gap: 4, minHeight: 58, justifyContent: 'flex-end' }}>
                {req ? (
                  <>
                    <Text variant="micro" muted style={{ textAlign: 'center' }}>{`Level ${req.level} · trial ${req.composite}+`}</Text>
                    {isNext ? (
                      <>
                        <Bar ratio={Math.min(1, level / req.level)} height={5} color={color} />
                        <Text variant="micro" muted style={{ textAlign: 'center' }}>{level >= req.level ? 'Trial unlocked' : `Level ${level} / ${req.level}`}</Text>
                      </>
                    ) : null}
                  </>
                ) : (
                  <Text variant="micro" muted style={{ textAlign: 'center' }}>Every hunter starts here</Text>
                )}
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
