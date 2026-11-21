/**
 * Train tab building blocks (docs/plans/TRAIN_REDESIGN.md §3.1): program hero, week strip,
 * mode bar, exercise rows and poster cards. Media is a placeholder poster (muscle map) until a
 * licensed clip provider is plugged into ExerciseMedia; layouts already use 1:1 thumbs and posters.
 */
import type { ProgramTemplate, QuickSession } from '@lb/content';
import type { Experience, PlannedExercise, WorkoutMode } from '@lb/engine';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { ExerciseMedia, MuscleMap } from '@/features/visuals';
import { useTheme } from '@/theme';
import { Icon, type IconName, PressableScale, Text } from '@/ui';
import { Ring } from '@/ui/fx';
import { exerciseById, exerciseName, muscleLabel, workoutTypes } from './catalog';
import { range } from './format';
import type { Today } from './today';

export const LEVEL_LABEL: Record<Experience, string> = {
  beginner: 'Beginner', novice: 'Novice', intermediate: 'Intermediate', advanced: 'Advanced', pro: 'Pro',
};
const LEVEL_STEP: Record<Experience, number> = { beginner: 1, novice: 2, intermediate: 3, advanced: 4, pro: 5 };

const FOCUS_MUSCLES: Record<'upper' | 'lower' | 'full', string[]> = {
  upper: ['chest', 'shoulders', 'upper_back', 'lats', 'biceps', 'triceps'],
  lower: ['quads', 'glutes', 'hamstrings', 'calves'],
  full: ['chest', 'quads', 'glutes', 'lats', 'shoulders'],
};
const FOCUS_LABEL = { upper: 'Upper', lower: 'Lower', full: 'Full' } as const;

/** Unique primary muscles across a workout, most frequent first. */
export function targetMuscles(ids: readonly string[], max = 4): string[] {
  const count = new Map<string, number>();
  for (const id of ids) for (const m of exerciseById.get(id)?.primary ?? []) count.set(m, (count.get(m) ?? 0) + 1);
  // "full_body" lights every region; prefer the specific muscles when there are any
  if (count.size > 1) count.delete('full_body');
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([m]) => m);
}

/** Rough energy estimate: MET × kg × hours (intensity sets the MET). */
export const estimateKcal = (minutes: number, weightKg: number, intensity: WorkoutMode['intensity']) =>
  Math.round((intensity === 'light' ? 3.5 : intensity === 'intense' ? 6.5 : 5) * (weightKg || 70) * (minutes / 60) / 5) * 5;

/* ---------------- program hero ---------------- */

export function ProgramHero({ today, completed, level }: { today: Today; completed: number; level: Experience }) {
  const { c, radius, spacing } = useTheme();
  const p = today.program;
  const type = workoutTypes.find((t) => t.id === p.typeId);
  const color = type?.color ?? c.accent;
  const perBlock = p.days.length * p.blockWeeks;
  const week = (Math.floor(completed / p.days.length) % p.blockWeeks) + 1;
  const ratio = (completed % perBlock) / perBlock;
  return (
    <PressableScale haptic="tap" onPress={() => router.push(`/program/${p.id}`)} accessibilityRole="button"
      accessibilityLabel={`${p.name}, ${LEVEL_LABEL[level]}, week ${week} of ${p.blockWeeks}. Open program`}>
      <View style={{ borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: `${color}55` }}>
        <LinearGradient colors={[`${color}55`, `${color}14`, c.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ padding: spacing[4], gap: spacing[3] }}>
          {/* cover art: oversized type glyph */}
          <View pointerEvents="none" style={{ position: 'absolute', right: -18, top: -14, opacity: 0.13 }}>
            <Icon name={(type?.icon ?? 'barbell') as IconName} size={150} color={color} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text variant="label" color={c.textDim}>Current program</Text>
              <Text variant="title" numberOfLines={2}>{p.name}</Text>
              <View style={{ flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' }}>
                <LevelChip level={level} />
                <Chip icon="calendar-outline" label={`${today.weekdays.length} days / week`} />
              </View>
            </View>
            <Ring ratio={ratio} size={76} stroke={7} color={color}>
              <Text variant="micro" muted>WEEK</Text>
              <Text variant="headline">{`${week}/${p.blockWeeks}`}</Text>
            </Ring>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="caption" dim>{`${completed} ${completed === 1 ? 'session' : 'sessions'} done · Day ${today.dayIndex + 1} of ${p.days.length} next`}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text variant="callout" color={c.accentGlow}>Details</Text>
              <Icon name="chevron-forward" size={14} color={c.accentGlow} />
            </View>
          </View>
        </LinearGradient>
      </View>
    </PressableScale>
  );
}

export function LevelChip({ level }: { level: Experience }) {
  const { c, radius } = useTheme();
  const step = LEVEL_STEP[level];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.28)' }}
      accessibilityLabel={`Level ${LEVEL_LABEL[level]}, ${step} of 5`}>
      <View style={{ flexDirection: 'row', gap: 2, alignItems: 'flex-end' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={{ width: 3, height: 4 + i * 2, borderRadius: 1, backgroundColor: i <= step ? c.accentGlow : 'rgba(255,255,255,0.18)' }} />
        ))}
      </View>
      <Text variant="micro" style={{ fontFamily: 'Inter_600SemiBold' }}>{LEVEL_LABEL[level]}</Text>
    </View>
  );
}

function Chip({ icon, label }: { icon: IconName; label: string }) {
  const { c, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.28)' }}>
      <Icon name={icon} size={12} color={c.textDim} />
      <Text variant="micro" dim>{label}</Text>
    </View>
  );
}

/* ---------------- week strip ---------------- */

export function WeekStrip({ today }: { today: Today }) {
  const { c, radius, spacing } = useTheme();
  // done names can carry a suffix ("Push A · Chest"), so match on the day name prefix
  const focusOf = (name: string | null) => (name ? today.program.days.find((d) => name === d.name || name.startsWith(d.name))?.focus ?? null : null);
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {today.week.map((d) => {
        const name = d.doneName ?? d.plannedName;
        const focus = focusOf(name);
        const done = !!d.doneName;
        // a missed day isn't a failure: the session moves to the next training day
        const moved = d.missed;
        const rest = !name && !moved;
        const border = d.isToday ? c.accent : done ? `${c.success}66` : c.border;
        const status = done ? `done: ${name}` : moved ? 'moved to your next day' : rest ? 'rest' : `${name}`;
        return (
          <View key={d.date} accessibilityLabel={`${d.label}${d.isToday ? ', today' : ''}: ${status}`}
            style={{
              flex: 1, alignItems: 'center', gap: 4, paddingVertical: spacing[2], borderRadius: radius.md, borderWidth: d.isToday ? 1.5 : 1,
              borderColor: border, backgroundColor: d.isToday ? `${c.accent}1F` : done ? `${c.success}12` : c.surface,
            }}>
            <Text variant="micro" color={d.isToday ? c.accentGlow : c.textMuted} style={{ fontFamily: 'Inter_600SemiBold' }}>{d.label.toUpperCase()}</Text>
            <View style={{ height: 26, alignItems: 'center', justifyContent: 'center' }}>
              {focus && !moved ? (
                <View style={{ opacity: d.past && !done ? 0.4 : 1 }}>
                  <MuscleMap primary={FOCUS_MUSCLES[focus]} width={30} showLabels={false} />
                </View>
              ) : (
                <Icon name={done ? 'barbell-outline' : moved ? 'arrow-redo-outline' : 'moon-outline'} size={15} color={done ? c.success : moved ? c.textMuted : `${c.mana}AA`} />
              )}
            </View>
            <View style={{ height: 14, justifyContent: 'center' }}>
              {done ? (
                <Icon name="checkmark-circle" size={14} color={c.success} />
              ) : d.isToday ? (
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accentGlow }} />
              ) : (
                <Text variant="micro" muted>{focus && !moved ? FOCUS_LABEL[focus] : moved ? 'moved' : ''}</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ---------------- mode bar ---------------- */

const INTENSITY_OPTS = [
  { value: 'light', label: 'Light' }, { value: 'standard', label: 'Standard' }, { value: 'intense', label: 'Intense' },
] as const;
const WHERE_OPTS = [{ value: 'home', label: 'Home', icon: 'home-outline' }, { value: 'gym', label: 'Gym', icon: 'barbell-outline' }] as const;
const TIME_OPTS = [20, 30, 45, 60] as const;

/** Change today's workout on the spot: intensity, home/gym, minutes (applies to today only). */
export function ModeBar({ mode, onChange }: { mode: WorkoutMode; onChange: (m: WorkoutMode) => void }) {
  const { c, spacing } = useTheme();
  return (
    <View style={{ gap: spacing[2] }}>
      <ModeRow label="Intensity" icon="speedometer-outline">
        {INTENSITY_OPTS.map((o) => (
          <ModeChip key={o.value} label={o.label} on={mode.intensity === o.value}
            color={o.value === 'light' ? c.mana : o.value === 'intense' ? c.danger : c.accent}
            onPress={() => onChange({ ...mode, intensity: o.value })} />
        ))}
      </ModeRow>
      <ModeRow label="Where" icon="location-outline">
        {WHERE_OPTS.map((o) => (
          // tapping the selected one again goes back to your usual setup
          <ModeChip key={o.value} label={o.label} icon={o.icon} on={mode.where === o.value}
            onPress={() => onChange({ ...mode, where: mode.where === o.value ? null : o.value })} />
        ))}
      </ModeRow>
      <ModeRow label="Time" icon="time-outline">
        {TIME_OPTS.map((m) => (
          <ModeChip key={m} label={`${m}′`} on={mode.minutes === m}
            onPress={() => onChange({ ...mode, minutes: mode.minutes === m ? null : m })} />
        ))}
      </ModeRow>
    </View>
  );
}

function ModeRow({ label, icon, children }: { label: string; icon: IconName; children: React.ReactNode }) {
  const { c, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
      <View style={{ width: 82, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Icon name={icon} size={14} color={c.textMuted} />
        <Text variant="caption" muted>{label}</Text>
      </View>
      <View style={{ flex: 1, flexDirection: 'row', gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel={label}>{children}</View>
    </View>
  );
}

function ModeChip({ label, on, onPress, icon, color }: { label: string; on: boolean; onPress: () => void; icon?: IconName; color?: string }) {
  const { c, radius } = useTheme();
  const tint = color ?? c.accent;
  return (
    <PressableScale haptic="tap" onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label}
      style={{
        flex: 1, minHeight: 34, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill,
        borderWidth: 1, borderColor: on ? tint : c.border, backgroundColor: on ? `${tint}33` : 'rgba(255,255,255,0.03)',
      }}>
      {icon ? <Icon name={icon} size={13} color={on ? c.text : c.textDim} /> : null}
      <Text variant="caption" color={on ? c.text : c.textDim} style={on ? { fontFamily: 'Inter_600SemiBold' } : undefined}>{label}</Text>
    </PressableScale>
  );
}

/* ---------------- exercise rows ---------------- */

export function setsRepsText(e: PlannedExercise): string {
  const working = e.sets.filter((s) => s.kind === 'working');
  const s = working[0] ?? e.sets[0];
  if (!s) return '';
  const target = s.seconds ? `${range(s.seconds)} s` : s.reps ? range(s.reps) : '';
  return `${working.length || e.sets.length} × ${target}`;
}

export function ExerciseRow({ e, index, last }: { e: PlannedExercise; index: number; last: boolean }) {
  const { c, spacing } = useTheme();
  const ex = exerciseById.get(e.exerciseId);
  const muscle = ex?.primary[0];
  const load = e.sets.find((s) => s.kind === 'working')?.loadKg;
  return (
    <PressableScale haptic="tap" onPress={() => router.push(`/exercise/${e.exerciseId}`)} accessibilityRole="button"
      accessibilityLabel={`${index + 1}. ${exerciseName(e.exerciseId)}, ${setsRepsText(e)}${muscle ? `, ${muscleLabel(muscle)}` : ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2] + 2, borderBottomWidth: last ? 0 : 1, borderColor: c.border }}>
        <ExerciseMedia exerciseId={e.exerciseId} variant="thumb" height={56} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {e.supersetGroup ? <Text variant="micro" color={c.warning} style={{ fontFamily: 'Inter_600SemiBold' }}>{e.supersetGroup}</Text> : null}
            <Text variant="callout" numberOfLines={1} style={{ flex: 1, fontFamily: 'Inter_600SemiBold' }}>{exerciseName(e.exerciseId)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Text variant="caption" color={c.accentGlow} style={{ fontFamily: 'Inter_600SemiBold' }}>{setsRepsText(e)}</Text>
            {load ? <Text variant="caption" dim>{`· ${load} kg`}</Text> : null}
            {muscle ? (
              <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)' }}>
                <Text variant="micro" muted>{muscleLabel(muscle)}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Icon name="chevron-forward" size={16} color={c.textMuted} />
      </View>
    </PressableScale>
  );
}

/* ---------------- posters (focused workouts, programs) ---------------- */

export function Shelf({ children }: { children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast"
      style={{ marginHorizontal: -spacing[4] }} contentContainerStyle={{ paddingHorizontal: spacing[4], gap: spacing[3] }}>
      {children}
    </ScrollView>
  );
}

export function SessionPoster({ q }: { q: QuickSession }) {
  const { c, radius, spacing } = useTheme();
  const t = workoutTypes.find((x) => x.id === q.typeId);
  const color = t?.color ?? c.accent;
  const minutes = Math.round(((q.work + q.rest) * q.moves.length * q.rounds) / 60);
  const moves = new Set(q.moves).size;
  return (
    <PressableScale haptic="tap" onPress={() => router.push(`/workout/quick/${q.id}`)} accessibilityRole="button"
      accessibilityLabel={`${q.name}, ${moves} exercises, ${minutes} minutes`}
      style={{ width: 156, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }}>
      <LinearGradient colors={[`${color}4D`, `${color}0D`]} style={{ height: 116, alignItems: 'center', justifyContent: 'center' }}>
        <MuscleMap primary={targetMuscles(q.moves, 5)} width={120} showLabels={false} />
        <View style={{ position: 'absolute', top: 8, left: 8, width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
          <Icon name={(t?.icon ?? 'flash') as IconName} size={14} color={color} />
        </View>
      </LinearGradient>
      <View style={{ padding: spacing[3], gap: 2 }}>
        <Text variant="callout" numberOfLines={1} style={{ fontFamily: 'Inter_600SemiBold' }}>{q.name.replace(/^\d+-Minute /, '')}</Text>
        <Text variant="caption" muted>{`${moves} exercises · ${minutes} min`}</Text>
      </View>
    </PressableScale>
  );
}

const LOC: Record<string, string> = { HOME: 'Home', GYM: 'Gym', HYBRID: 'Home + Gym' };

export function ProgramPoster({ p, active }: { p: ProgramTemplate; active: boolean }) {
  const { c, radius, spacing } = useTheme();
  const t = workoutTypes.find((x) => x.id === p.typeId);
  const color = t?.color ?? c.accent;
  const levels = `${LEVEL_LABEL[p.levels[0]!]}${p.levels.length > 1 ? `–${LEVEL_LABEL[p.levels[p.levels.length - 1]!]}` : ''}`;
  return (
    <PressableScale haptic="tap" onPress={() => router.push(`/program/${p.id}`)} accessibilityRole="button"
      accessibilityLabel={`${p.name}. ${levels}. ${p.locations.map((l) => LOC[l]).join(', ')}${active ? '. Current program' : ''}`}
      style={{ width: 220, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: active ? color : c.border, backgroundColor: c.surface }}>
      <LinearGradient colors={[`${color}4D`, `${color}0A`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 92, padding: spacing[3], justifyContent: 'space-between' }}>
        <View pointerEvents="none" style={{ position: 'absolute', right: -10, bottom: -18, opacity: 0.18 }}>
          <Icon name={(t?.icon ?? 'barbell') as IconName} size={96} color={color} />
        </View>
        {active ? (
          <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: color }}>
            <Text variant="micro" color="#FFFFFF" style={{ fontFamily: 'Inter_600SemiBold' }}>CURRENT</Text>
          </View>
        ) : <View />}
        <Text variant="headline" numberOfLines={1}>{p.name}</Text>
      </LinearGradient>
      <View style={{ padding: spacing[3], gap: 4 }}>
        <Text variant="caption" dim numberOfLines={2} style={{ minHeight: 32 }}>{p.summary}</Text>
        <Text variant="micro" muted>{`${levels} · ${p.daysPerWeek.join('–')} days · ${p.locations.map((l) => LOC[l]).join(' / ')}`}</Text>
      </View>
    </PressableScale>
  );
}
