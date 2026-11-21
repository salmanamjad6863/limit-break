import { exerciseById, exerciseMedia } from '@lb/content';
import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { env } from '@/lib/env';
import { useTheme } from '@/theme';
import { Icon, PressableScale, Pill, Text } from '@/ui';
import { AuraLayer, type AuraState } from './AuraLayer';
import { bundledMedia } from './bundled.generated';
import { bestSide, MuscleMap } from './MuscleMap';
import { hasTrainer, TrainerFigure } from './TrainerFigure';

type Kind = 'loop' | 'side' | 'thumb';

const EQUIP_ICON: Partial<Record<string, React.ComponentProps<typeof Icon>['name']>> = {
  barbell: 'barbell-outline', dumbbell: 'barbell-outline', kettlebell: 'barbell-outline', machine: 'cog-outline', band: 'git-commit-outline', bodyweight: 'body-outline',
};
type Source = number | { uri: string };

/** Bundled Tier-1 file first (offline, no bandwidth), then the CDN (VISUALS.md §3.5). */
function sourceFor(exerciseId: string, kind: Kind): Source | undefined {
  const local = bundledMedia[exerciseId]?.[kind];
  if (local != null) return local;
  const key = exerciseMedia[exerciseId]?.[kind];
  return key && env.mediaBaseUrl ? { uri: `${env.mediaBaseUrl.replace(/\/$/, '')}/${key}` } : undefined;
}

/** True once a recorded demo exists for this exercise (bundled, or media keys + CDN configured). */
/** True when a moving demo exists: a recorded clip, or the animated trainer. */
export const hasDemo = (exerciseId: string) => !!(sourceFor(exerciseId, 'loop') ?? sourceFor(exerciseId, 'thumb')) || hasTrainer(exerciseId);

/**
 * Demo media with a fallback chain (VISUALS.md §3.8): recorded loop → animated 2D trainer → muscle map + cues.
 * Never renders an empty box. Reduce Motion shows the still thumbnail / a still trainer pose.
 */
export function ExerciseMedia({
  exerciseId,
  variant = 'card',
  height,
  mirrored,
  aura,
  playing = true,
}: {
  exerciseId: string;
  variant?: 'card' | 'hero' | 'thumb';
  height?: number;
  /** right-side reps of unilateral moves */
  mirrored?: boolean;
  /** live anime aura behind the trainer (VISUALS.md §3.4); omit for a plain demo */
  aura?: AuraState;
  /** pause the animated trainer (follow-along paused / rest) */
  playing?: boolean;
}) {
  const { c, radius, spacing } = useTheme();
  const reduce = useReducedMotion();
  const [angle, setAngle] = useState<'front' | 'side'>('front');
  const [failed, setFailed] = useState(false);
  const [w, setW] = useState(0);
  const ex = exerciseById.get(exerciseId);
  const h = height ?? (variant === 'hero' ? 260 : variant === 'thumb' ? 56 : 190);
  const thumb = sourceFor(exerciseId, 'thumb');
  const side = sourceFor(exerciseId, 'side');
  const src = failed ? undefined : reduce ? thumb : angle === 'side' && side ? side : (sourceFor(exerciseId, 'loop') ?? thumb);

  if (variant === 'thumb') {
    return (
      <View style={{ width: h, height: h, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: c.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}>
        {thumb && !failed ? (
          <Image source={thumb} style={{ width: h, height: h }} contentFit="cover" onError={() => setFailed(true)} />
        ) : ex ? (
          // placeholder poster until a clip provider is plugged in: the worked side of the body + equipment badge
          <>
            <MuscleMap primary={ex.primary} secondary={ex.secondary} side={bestSide(ex.primary)} width={h * 0.62} showLabels={false} />
            <View style={{ position: 'absolute', right: 3, bottom: 3, width: h * 0.3, height: h * 0.3, borderRadius: h * 0.1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}>
              <Icon name={EQUIP_ICON[ex.loadType] ?? 'body-outline'} size={h * 0.18} color={c.textDim} />
            </View>
          </>
        ) : null}
      </View>
    );
  }

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ height: h, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border }}>
      {src ? (
        <>
        {aura ? <AuraLayer state={aura} /> : null}
        <Image
          source={src}
          style={{ width: '100%', height: '100%', transform: mirrored ? [{ scaleX: -1 }] : undefined }}
          contentFit="contain"
          autoplay
          onError={() => setFailed(true)}
          accessibilityLabel={`${ex?.name ?? exerciseId} demonstration`}
        />
        </>
      ) : ex && hasTrainer(exerciseId) ? (
        <>
          {aura ? <AuraLayer state={aura} /> : null}
          <View style={{ flex: 1 }} accessible accessibilityRole="image" accessibilityLabel={`Animated coach demonstrating ${ex.name}`}>
            <TrainerFigure exerciseId={exerciseId} width={w} height={h} mirrored={mirrored} accent={c.accent} playing={playing} />
          </View>
          {variant === 'hero' ? (
            <View style={{ position: 'absolute', right: spacing[2], top: spacing[2], padding: 4, borderRadius: radius.sm, backgroundColor: 'rgba(7,6,11,0.55)' }}>
              <MuscleMap primary={ex.primary} secondary={ex.secondary} width={64} showLabels={false} />
            </View>
          ) : null}
        </>
      ) : ex ? (
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: variant === 'hero' ? 'flex-start' : 'center', padding: spacing[3], paddingBottom: spacing[8], gap: spacing[3] }}>
          <View>
            {/* until the trainer clip exists, the aura frames the muscle-map body (kept soft so muscles stay readable) */}
            {aura ? <AuraLayer state={aura} intensity={0.7} /> : null}
            <MuscleMap primary={ex.primary} secondary={ex.secondary}
              width={Math.max(80, Math.min(200, (h - 40) * 1.15, w ? (variant === 'hero' ? w * 0.5 : w - 24) : 160))} />
          </View>
          {variant === 'hero' ? (
            <View style={{ flex: 1, gap: spacing[2] }}>
              {ex.cues.slice(0, 3).map((cue, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
                  <Text variant="caption" color={c.accentGlow}>{i + 1}</Text>
                  <Text variant="caption" style={{ flex: 1 }} numberOfLines={3}>{cue}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={{ position: 'absolute', left: spacing[2], bottom: spacing[2], flexDirection: 'row', gap: 6 }}>
        {!src && !hasTrainer(exerciseId) ? <Pill icon="film-outline" label="Demo in production" /> : null}
        {mirrored ? <Pill label="Right side" color={c.mana} /> : null}
      </View>
      {src && side ? (
        <PressableScale haptic="tap" onPress={() => setAngle((a) => (a === 'front' ? 'side' : 'front'))} accessibilityRole="button" accessibilityLabel="Switch camera angle"
          style={{ position: 'absolute', right: spacing[2], top: spacing[2], flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <Icon name="camera-reverse-outline" size={14} color="#FFFFFF" />
          <Text variant="micro" color="#FFFFFF">{angle === 'front' ? 'Side' : 'Front'}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}
