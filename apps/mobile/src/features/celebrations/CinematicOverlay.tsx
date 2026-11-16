import { rankColor } from '@lb/tokens';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { Text } from '@/ui';
import { ParticleBurst } from '@/ui/fx';
import { CountUp, GlitchText, TypewriterText } from '@/ui/motion';
import { useCelebrations, type Celebration } from './store';

function copyFor(c: Celebration): { kicker: string; headline: string; line: string; color?: string } {
  switch (c.type) {
    case 'levelUp':
      return { kicker: '[ SYSTEM ]', headline: 'LEVEL UP', line: `Ability Points +${c.ap}. Your limits have been rewritten.` };
    case 'rankUp':
      return { kicker: '[ PROMOTION ]', headline: `${c.to}-RANK`, line: `You have surpassed ${c.from}-Rank.`, color: rankColor[c.to] };
    case 'pr':
      return { kicker: '[ LIMIT BROKEN ]', headline: 'NEW RECORD', line: `Estimated max: ${Math.round(c.e1rmKg)} kg` };
    case 'title':
      return { kicker: '[ TITLE ACQUIRED ]', headline: c.titleId.toUpperCase(), line: 'A new title echoes through the System.' };
  }
}

/** Mounted once in the root layout; plays the head of the celebration queue. */
export function CinematicOverlay() {
  const current = useCelebrations((s) => s.queue[0]);
  const dismiss = useCelebrations((s) => s.dismiss);
  const { width, height } = useWindowDimensions();
  const { c, spacing } = useTheme();
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    if (!current) return;
    haptics.levelUp();
    setBurst((b) => b + 1);
  }, [current]);

  if (!current) return null;
  const copy = copyFor(current);
  const color = copy.color ?? c.accentGlow;

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(260)}
      style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,4,10,0.88)', zIndex: 100 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue"
        onPress={dismiss}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing[6] }}>
        <ParticleBurst width={width} height={height} color={color} trigger={burst} />
        <Animated.View entering={ZoomIn.springify().damping(12).stiffness(140)} style={{ alignItems: 'center', gap: spacing[3] }}>
          <Text variant="label" color={c.textDim}>{copy.kicker}</Text>
          <GlitchText variant="display" color={color} repeatEveryMs={2600} style={{ textAlign: 'center', textShadowColor: color, textShadowRadius: 24 }}>
            {copy.headline}
          </GlitchText>
          {current.type === 'levelUp' ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing[3] }}>
              <Text variant="title" dim>{current.from}</Text>
              <Text variant="heading" color={c.textMuted}>→</Text>
              <CountUp variant="display" value={current.to} duration={700} delay={250} style={{ fontSize: 64, lineHeight: 70 }} color={color} />
            </View>
          ) : null}
          <TypewriterText variant="body" dim text={copy.line} delayMs={500} style={{ textAlign: 'center' }} />
        </Animated.View>
        <Animated.View entering={FadeIn.delay(1400)} style={{ position: 'absolute', bottom: spacing[16] }}>
          <Text variant="micro" color={c.textMuted}>TAP TO CONTINUE</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}
