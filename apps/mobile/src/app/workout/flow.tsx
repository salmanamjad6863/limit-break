import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { FollowAlongPlayer, focusOf, guidedFlow, type Focus } from '@/features/follow';
import { useTrainingProfile, useWorkoutSession } from '@/features/training';
import { useTheme } from '@/theme';

/**
 * Guided warm-up (before a session) or cool-down (before the debrief) — VISUALS.md §5.
 * Leaving early is always fine: it just continues to where the hunter was going.
 */
export default function GuidedFlow() {
  const { kind = 'warmup', focus } = useLocalSearchParams<{ kind?: 'warmup' | 'cooldown'; focus?: Focus }>();
  const { c } = useTheme();
  const profile = useTrainingProfile();
  const active = useWorkoutSession((s) => s.active);
  const f: Focus = focus ?? focusOf(active?.exercises.map((e) => e.exerciseId) ?? []);
  const steps = useMemo(() => guidedFlow(kind, f, profile), [kind, f, profile]);
  const next = () => router.replace(kind === 'warmup' ? '/workout/session' : '/workout/debrief');
  const label = { upper: 'upper body', lower: 'lower body', full: 'full body' }[f];

  return (
    <FollowAlongPlayer
      title={kind === 'warmup' ? 'Warm-up' : 'Cool-down'}
      intro={kind === 'warmup'
        ? `A ${label} warm-up: raise your heart rate, then open up the joints you’re about to load.`
        : 'Bring your heart rate down and stretch what you just trained. Breathe slowly.'}
      steps={steps}
      accent={kind === 'warmup' ? c.warning : c.mana}
      doneLabel={kind === 'warmup' ? 'Start workout' : 'See results'}
      onDone={next}
      onExit={next}
    />
  );
}
