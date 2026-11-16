import { heroes } from '@lb/content';
import type { OnboardingInput } from '@lb/contracts';
import { statColors } from '@lb/tokens';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { Appear, Button, CountUp, GlitchText, StatRow, SystemWindow, Text, TypewriterText } from '@/ui';
import { HeroEmblem, ParticleBurst, RankBadge } from '@/ui/fx';
import { CLASSES } from './options';
import { previewMe, useCompleteOnboarding } from './submit';

const STAT_KEYS = ['STR', 'AGI', 'END', 'VIT', 'SPI'] as const;

/** Step 14: the Status Window reveal — peak emotion, then the user enters the System. */
export function Reveal({ input, onDone }: { input: OnboardingInput; onDone: () => void }) {
  const { c, spacing } = useTheme();
  const me = useMemo(() => previewMe(input), [input]);
  const hero = heroes.find((h) => h.id === input.heroId) ?? heroes[0]!;
  const cls = CLASSES.find((x) => x.value === input.heroClass);
  const complete = useCompleteOnboarding();
  useEffect(() => {
    haptics.levelUp();
  }, []);
  const burst = 1;
  const s = me.state!;

  return (
    <View style={{ gap: spacing[5] }}>
      <Appear index={0} style={{ alignItems: 'center', gap: spacing[2] }}>
        <View style={{ width: 260, height: 260, alignItems: 'center', justifyContent: 'center' }}>
          <ParticleBurst width={260} height={260} color={hero.accent} trigger={burst} />
          <HeroEmblem size={240} color={hero.accent} initial={input.hunterName.charAt(0).toUpperCase()} />
        </View>
        <TypewriterText variant="label" color={c.accentGlow} text="Awakening complete" />
        <GlitchText variant="title" repeatEveryMs={4000}>{input.hunterName}</GlitchText>
        <Text variant="callout" color={hero.accent}>{`${cls?.title ?? ''} · ${hero.epithet}`}</Text>
      </Appear>

      <Appear index={2}>
        <SystemWindow title="Status Window" accent={hero.accent} typeDelayMs={400}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text variant="micro" dim>LEVEL</Text>
              <CountUp variant="stat" value={s.level} style={{ fontSize: 44, lineHeight: 48 }} />
            </View>
            <View style={{ alignItems: 'center' }}>
              <RankBadge rank="E" size={88} />
              <Text variant="micro" dim>RANK</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="micro" dim>XP</Text>
              <CountUp variant="stat" value={s.xp} color={c.accentGlow} />
            </View>
          </View>
          {STAT_KEYS.map((k, i) => (
            <StatRow key={k} label={k} value={s.stats[k]} color={statColors[k][0]} delayMs={600 + i * 120} />
          ))}
          <Text variant="caption" muted>
            {input.assessment ? 'STR and END were measured by your assessment.' : 'STR and END are estimated. Take a Rank Trial to measure them.'}
            {' AGI, VIT and SPI grow with real data.'}
          </Text>
        </SystemWindow>
      </Appear>

      <Appear index={4} style={{ gap: spacing[2] }}>
        {complete.error ? (
          <Text color={c.danger}>The System could not save your awakening. Check your connection and try again.</Text>
        ) : null}
        <Button
          label={complete.isPending ? 'Synchronizing…' : 'Enter the System'}
          disabled={complete.isPending}
          onPress={() => complete.mutate(input, { onSuccess: onDone })}
        />
      </Appear>
    </View>
  );
}
