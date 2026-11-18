import { heroes } from '@lb/content';
import { bmr, calorieTarget, macroTargets, tdeePrior } from '@lb/engine';
import { useState, type ComponentType } from 'react';
import { Linking, View } from 'react-native';
import { CONSENT_VERSION } from '@lb/contracts';
import { router } from 'expo-router';
import { useSession } from '@/features/session/store';
import { env } from '@/lib/env';
import { requestNotificationPermission } from '@/lib/notifications';
import { useTheme } from '@/theme';
import { Appear, Button, GlitchText, Icon, PressableScale, SystemWindow, Text, TypewriterText } from '@/ui';
import { Chips, OptionCard, Segmented, Stepper, TestTimer, TextField } from '@/ui/form';
import { HeroEmblem } from '@/ui/fx';
import {
  CLASSES, DEFAULT_RATE, EQUIPMENT, EXPERIENCE, FULL_GYM, GOALS, HEALTH_QUESTIONS, INJURIES,
  LIFESTYLES, LOCATIONS, recommendedClass,
} from './options';
import { useOnboarding, type Draft } from './store';

export interface StepDef {
  id: string;
  kicker: string;
  title: string;
  /** Can the user continue? */
  valid: (d: Draft) => boolean;
  /** Full-bleed steps hide the header/progress and render their own CTA. */
  fullBleed?: boolean;
  /** Optional steps show a Skip button. */
  skippable?: boolean;
  onSkip?: () => void;
  Component: ComponentType<{ next: () => void }>;
}

const useDraft = () => useOnboarding((s) => s.draft);
const useSet = () => useOnboarding((s) => s.set);

/* ---------- 1. Cold open ---------- */
function ColdOpen({ next }: { next: () => void }) {
  const { c, spacing } = useTheme();
  const isGuest = useSession((s) => s.isGuest);
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: spacing[6] }}>
      <Appear index={0}>
        <TypewriterText variant="label" color={c.accentGlow} text="System message" />
      </Appear>
      <Appear index={2}>
        <GlitchText variant="display" repeatEveryMs={3200}>You have been chosen.</GlitchText>
      </Appear>
      <Appear index={4}>
        <TypewriterText
          variant="body"
          dim
          delayMs={900}
          text="The System has detected untapped potential. Training will be required. Growth is guaranteed only to those who endure."
        />
      </Appear>
      <Appear index={7}>
        <TypewriterText variant="heading" color={c.accentGlow} delayMs={3400} text="Do you accept?" />
      </Appear>
      <Appear index={9} style={{ gap: spacing[3] }}>
        <Button label="Accept" onPress={next} />
        <Text variant="caption" muted style={{ textAlign: 'center' }}>
          There is no decline button.
        </Text>
        {isGuest ? (
          <Button variant="ghost" label="I already have an account" onPress={() => router.push('/sign-in?mode=signin')} />
        ) : null}
      </Appear>
    </View>
  );
}

/* ---------- 2. Identity ---------- */
function Identity() {
  const { spacing } = useTheme();
  const d = useDraft();
  const set = useSet();
  return (
    <View style={{ gap: spacing[5] }}>
      <TextField
        label="Hunter name"
        value={d.hunterName ?? ''}
        onChangeText={(t) => set({ hunterName: t })}
        placeholder="Your name"
        maxLength={20}
        autoCapitalize="words"
        autoCorrect={false}
      />
      <Text variant="label" dim>Choose your hero</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3], justifyContent: 'space-between' }}>
        {heroes.map((h) => {
          const on = d.heroId === h.id;
          return (
            <PressableScale
              key={h.id}
              haptic="tap"
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${h.name}, ${h.epithet}`}
              onPress={() => set({ heroId: h.id, heroClass: d.heroClass ?? h.heroClass })}
              style={{
                width: '47%', alignItems: 'center', paddingVertical: spacing[3], borderRadius: 16,
                borderWidth: 1.5, borderColor: on ? h.accent : 'rgba(255,255,255,0.07)', backgroundColor: on ? `${h.accent}14` : '#121219',
              }}>
              <HeroEmblem size={96} color={h.accent} initial={h.name.charAt(0)} />
              <Text variant="heading" style={{ marginTop: spacing[1] }}>{h.name}</Text>
              <Text variant="caption" color={h.accent}>{h.epithet}</Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

/* ---------- 3–4. Single-choice lists ---------- */
function choiceStep<K extends keyof Draft>(key: K, options: { value: string; title: string; subtitle: string }[]) {
  return function Choice() {
    const { spacing } = useTheme();
    const d = useDraft();
    const set = useSet();
    return (
      <View style={{ gap: spacing[3] }}>
        {options.map((o, i) => (
          <Appear key={o.value} index={i}>
            <OptionCard
              title={o.title}
              subtitle={o.subtitle}
              selected={d[key] === o.value}
              onPress={() => set({ [key]: o.value } as Draft)}
            />
          </Appear>
        ))}
      </View>
    );
  };
}

/* ---------- 5. Location + equipment ---------- */
function Location() {
  const { spacing } = useTheme();
  const d = useDraft();
  const set = useSet();
  const toggle = (v: string) =>
    set({ equipment: d.equipment?.includes(v) ? d.equipment.filter((x) => x !== v) : [...(d.equipment ?? []), v] });
  return (
    <View style={{ gap: spacing[3] }}>
      {LOCATIONS.map((o) => (
        <OptionCard
          key={o.value}
          title={o.title}
          subtitle={o.subtitle}
          selected={d.location === o.value}
          onPress={() => set({ location: o.value, equipment: o.value === 'GYM' ? FULL_GYM : d.equipment })}
        />
      ))}
      {d.location ? (
        <Appear style={{ gap: spacing[3], marginTop: spacing[2] }}>
          <Text variant="label" dim>Your equipment</Text>
          <Chips options={EQUIPMENT} value={d.equipment ?? []} onToggle={toggle} />
          <Text variant="caption" muted>Nothing selected means bodyweight only. That is enough to start.</Text>
        </Appear>
      ) : null}
    </View>
  );
}

/* ---------- 6. Schedule ---------- */
function Schedule() {
  const { spacing } = useTheme();
  const d = useDraft();
  const set = useSet();
  const [h, m] = (d.questTime ?? '07:00').split(':').map(Number) as [number, number];
  const minutesOfDay = h * 60 + m;
  const fmt = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  return (
    <View style={{ gap: spacing[3] }}>
      <Stepper label="Training days per week" value={d.daysPerWeek ?? 4} min={2} max={6} onChange={(v) => set({ daysPerWeek: v })} unit="DAYS" />
      <Text variant="label" dim>Session length</Text>
      <Segmented
        options={[15, 30, 45, 60, 75].map((v) => ({ value: String(v), label: `${v}m` }))}
        value={String(d.sessionMinutes ?? 45)}
        onChange={(v) => set({ sessionMinutes: Number(v) as Draft['sessionMinutes'] })}
      />
      <Stepper
        label="Daily Quest arrives at"
        value={minutesOfDay}
        min={5 * 60}
        max={22 * 60}
        step={15}
        format={fmt}
        onChange={(v) => set({ questTime: fmt(v) })}
      />
    </View>
  );
}

/* ---------- 7. Class ---------- */
function ClassPick() {
  const { spacing } = useTheme();
  const d = useDraft();
  const set = useSet();
  const rec = recommendedClass(d.goal, d.location);
  return (
    <View style={{ gap: spacing[3] }}>
      {CLASSES.map((o, i) => (
        <Appear key={o.value} index={i}>
          <OptionCard
            title={o.title}
            subtitle={o.subtitle}
            badge={o.value === rec ? 'RECOMMENDED' : undefined}
            selected={d.heroClass === o.value}
            onPress={() => set({ heroClass: o.value })}
          />
        </Appear>
      ))}
    </View>
  );
}

/* ---------- 8. Body ---------- */
function Body() {
  const { c, spacing } = useTheme();
  const d = useDraft();
  const set = useSet();
  const units = useOnboarding((s) => s.units);
  const setUnits = useOnboarding((s) => s.setUnits);
  const imperial = units === 'imperial';
  const heightIn = Math.round((d.heightCm ?? 175) / 2.54);
  const weightLb = Math.round((d.weightKg ?? 75) / 0.45359237);
  return (
    <View style={{ gap: spacing[3] }}>
      <Segmented
        options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'unspecified', label: 'Other' }]}
        value={d.sex}
        onChange={(v) => set({ sex: v })}
      />
      <Text variant="caption" muted>Used only for calorie math and fitness norms.</Text>
      <Segmented
        options={[{ value: 'metric', label: 'Metric' }, { value: 'imperial', label: 'Imperial' }]}
        value={units}
        onChange={(v) => setUnits(v)}
      />
      <Stepper label="Age" value={d.ageYears ?? 24} min={13} max={90} onChange={(v) => set({ ageYears: v })} unit="YRS" />
      {imperial ? (
        <Stepper
          label="Height"
          value={heightIn}
          min={48}
          max={90}
          onChange={(v) => set({ heightCm: Math.round(v * 2.54) })}
          format={(v) => `${Math.floor(v / 12)}′${v % 12}″`}
        />
      ) : (
        <Stepper label="Height" value={Math.round(d.heightCm ?? 175)} min={120} max={230} onChange={(v) => set({ heightCm: v })} unit="CM" />
      )}
      {imperial ? (
        <Stepper label="Weight" value={weightLb} min={66} max={660} onChange={(v) => set({ weightKg: Math.round(v * 0.45359237 * 10) / 10 })} unit="LB" />
      ) : (
        <Stepper label="Weight" value={Math.round(d.weightKg ?? 75)} min={30} max={300} onChange={(v) => set({ weightKg: v })} unit="KG" />
      )}
      <Stepper
        label="Body fat (optional)"
        value={d.bodyFatPct ?? 0}
        min={0}
        max={60}
        onChange={(v) => set({ bodyFatPct: v === 0 ? null : Math.max(3, v) })}
        format={(v) => (v === 0 ? '—' : `${v}`)}
        unit={d.bodyFatPct ? '%' : undefined}
      />
      {d.ageYears != null && d.ageYears < 18 ? (
        <Text variant="caption" color={c.mana}>Under 18: targets stay at maintenance or growth, never a deficit.</Text>
      ) : null}
    </View>
  );
}

/* ---------- Consent (GDPR Art. 9 explicit consent for health data) ---------- */
function Consent() {
  const d = useDraft();
  const set = useSet();
  const on = d.consentVersion === CONSENT_VERSION;
  return <ConsentTerms checked={on} onToggle={() => set({ consentVersion: on ? undefined : CONSENT_VERSION })} />;
}

/** The consent text + checkbox, shared by onboarding and the re-consent screen after a policy change. */
export function ConsentTerms({ checked: on, onToggle }: { checked: boolean; onToggle: () => void }) {
  const { c, spacing } = useTheme();
  const link = (label: string, url: string) =>
    url ? (
      <PressableScale haptic="tap" onPress={() => Linking.openURL(url)} accessibilityRole="link" accessibilityLabel={label}>
        <Text variant="callout" color={c.accentGlow}>{label}</Text>
      </PressableScale>
    ) : null;
  return (
    <View style={{ gap: spacing[3] }}>
      <Text dim>The System uses details about your body and health so your plan is safe and accurate. That’s sensitive data, so here’s the deal:</Text>
      {[
        'It’s used only to build your training and nutrition plan.',
        'It’s never sold and never used for ads.',
        'Export or delete everything any time in your profile.',
      ].map((t) => (
        <View key={t} style={{ flexDirection: 'row', gap: spacing[2] }}>
          <Icon name="shield-checkmark-outline" size={18} color={c.success} />
          <Text variant="callout" style={{ flex: 1 }}>{t}</Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: spacing[4] }}>
        {link('Privacy Policy', env.privacyUrl)}
        {link('Terms of Use', env.termsUrl)}
      </View>
      <PressableScale haptic="tap" onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
        style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'center', padding: spacing[3], borderRadius: 12, borderWidth: 1.5, borderColor: on ? c.accent : c.border, backgroundColor: on ? `${c.accent}1A` : c.surface }}>
        <Icon name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? c.accentGlow : c.textMuted} />
        <Text variant="callout" style={{ flex: 1 }}>I agree to the Terms and Privacy Policy, and consent to LIMITBREAK processing my health and fitness data to provide the app.</Text>
      </PressableScale>
    </View>
  );
}

/* ---------- 10. Health screen ---------- */
function Health() {
  const { c, spacing } = useTheme();
  const d = useDraft();
  const set = useSet();
  const [answers, setAnswers] = useState<boolean[]>(() => HEALTH_QUESTIONS.map(() => false));
  const toggle = (i: number) => {
    const next = answers.map((a, j) => (j === i ? !a : a));
    setAnswers(next);
    set({ parqAnyYes: next.some(Boolean) });
  };
  const toggleInjury = (v: string) =>
    set({ injuries: d.injuries?.includes(v) ? d.injuries.filter((x) => x !== v) : [...(d.injuries ?? []), v] });
  return (
    <View style={{ gap: spacing[3] }}>
      <Text dim>Tap any statement that applies to you.</Text>
      {HEALTH_QUESTIONS.map((q, i) => (
        <PressableScale
          key={q}
          haptic="tap"
          onPress={() => toggle(i)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: answers[i] }}
          style={{
            flexDirection: 'row', gap: spacing[3], alignItems: 'center', padding: spacing[3], borderRadius: 12,
            borderWidth: 1, borderColor: answers[i] ? c.danger : c.border, backgroundColor: answers[i] ? `${c.danger}1A` : c.surface,
          }}>
          <Icon name={answers[i] ? 'checkbox' : 'square-outline'} size={20} color={answers[i] ? c.danger : c.textMuted} />
          <Text variant="callout" style={{ flex: 1 }}>{q}</Text>
        </PressableScale>
      ))}
      {d.parqAnyYes ? (
        <SystemWindow title="Caution" accent={c.danger} glow={false}>
          <Text>Please check with a doctor before starting a new training program. The System will keep intensity conservative.</Text>
        </SystemWindow>
      ) : null}
      <Text variant="label" dim style={{ marginTop: spacing[2] }}>Any injuries to protect?</Text>
      <Chips options={INJURIES} value={d.injuries ?? []} onToggle={toggleInjury} accent={c.danger} />
    </View>
  );
}

/* ---------- 11. Awakening Assessment ---------- */
function Assessment() {
  const { c, spacing } = useTheme();
  const d = useDraft();
  const setAssessment = useOnboarding((s) => s.setAssessment);
  const a = d.assessment ?? { pushups: 0, plankSec: 0, squats60: 0 };
  return (
    <View style={{ gap: spacing[4] }}>
      <Text dim>Three quick tests set your starting True Stats. Rest a minute between each. Good form only.</Text>
      <SystemWindow title="Test 1 · Max push-ups" accent={c.danger} glow={false}>
        <Stepper label="Clean reps" value={a.pushups} min={0} max={150} onChange={(v) => setAssessment({ pushups: v })} />
      </SystemWindow>
      <SystemWindow title="Test 2 · Plank hold" accent={c.mana} glow={false}>
        <TestTimer mode="stopwatch" onResult={(s) => setAssessment({ plankSec: s })} />
        <Stepper label="Seconds held" value={a.plankSec} min={0} max={600} step={5} onChange={(v) => setAssessment({ plankSec: v })} />
      </SystemWindow>
      <SystemWindow title="Test 3 · Squats in 60 s" accent={c.success} glow={false}>
        <TestTimer mode="countdown" />
        <Stepper label="Reps" value={a.squats60} min={0} max={120} onChange={(v) => setAssessment({ squats60: v })} />
      </SystemWindow>
      <Text variant="caption" color={c.accentGlow}>Completing the assessment grants +200 XP.</Text>
    </View>
  );
}

/* ---------- 12. Nutrition ---------- */
function Nutrition() {
  const { c, spacing } = useTheme();
  const d = useDraft();
  const set = useSet();
  const user = { sex: d.sex ?? 'unspecified', weightKg: d.weightKg ?? 75, heightCm: d.heightCm ?? 175, ageYears: d.ageYears ?? 24, bodyFatPct: d.bodyFatPct };
  const goal = d.goal ?? 'maintain';
  const prior = tdeePrior({
    ...user,
    lifestyle: d.lifestyle ?? 'light',
    weeklySessions: Array.from({ length: d.daysPerWeek ?? 4 }, () => ({ kind: 'strength' as const, minutes: d.sessionMinutes ?? 45 })),
  });
  const target = calorieTarget({ ...user, tdee: prior, bmr: bmr(user), trendWeightKg: user.weightKg, goal, ratePerWeek: DEFAULT_RATE[goal] });
  const m = macroTargets({ kcal: target.kcal, goal, weightKg: user.weightKg, heightCm: user.heightCm, bodyFatPct: d.bodyFatPct, fatPreference: d.fatPreference });
  const mode = d.nutritionMode ?? 'full';
  return (
    <View style={{ gap: spacing[3] }}>
      <Segmented
        options={[{ value: 'full', label: 'Full macros' }, { value: 'proteinOnly', label: 'Protein' }, { value: 'off', label: 'Off' }]}
        value={mode}
        onChange={(v) => set({ nutritionMode: v })}
      />
      {mode === 'off' ? (
        <Text dim>Nutrition tracking is off. You can turn it on any time in Settings.</Text>
      ) : (
        <SystemWindow title="Your Mana requirements" accent={c.mana}>
          {mode === 'full' ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing[2] }}>
              <Text variant="stat">{Math.round(target.kcal).toLocaleString()}</Text>
              <Text variant="caption" muted>kcal / day</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {[
              { k: 'PROTEIN', v: m.proteinG, col: '#7DD3FC', show: true },
              { k: 'CARBS', v: m.carbsG, col: '#6EE7B7', show: mode === 'full' },
              { k: 'FAT', v: m.fatG, col: '#FDBA74', show: mode === 'full' },
            ]
              .filter((x) => x.show)
              .map((x) => (
                <View key={x.k}>
                  <Text variant="caption" muted>{x.k}</Text>
                  <Text variant="heading" color={x.col}>{`${Math.round(x.v)} g`}</Text>
                </View>
              ))}
          </View>
          <Text variant="caption" muted>
            Starting estimate. It recalibrates from your real weight trend after about two weeks of logging.
          </Text>
        </SystemWindow>
      )}
      {mode === 'full' ? (
        <>
          <Text variant="label" dim>Fat preference</Text>
          <Segmented
            options={[{ value: 'lower', label: 'Lower' }, { value: 'balanced', label: 'Balanced' }, { value: 'higher', label: 'Higher' }]}
            value={d.fatPreference}
            onChange={(v) => set({ fatPreference: v })}
          />
        </>
      ) : null}
    </View>
  );
}

/* ---------- 13. Notifications primer ---------- */
function NotificationsPrimer({ next }: { next: () => void }) {
  const { c, spacing } = useTheme();
  const d = useDraft();
  const set = useSet();
  const enable = async () => {
    const granted = await requestNotificationPermission();
    set({ notificationsOptIn: granted });
    next();
  };
  return (
    <View style={{ gap: spacing[5] }}>
      <SystemWindow title="Incoming transmission" accent={c.danger}>
        <TypewriterText
          variant="heading"
          text={`[SYSTEM] Daily Quest has arrived, ${d.hunterName || 'Hunter'}. Failure to complete will result in an appropriate penalty.`}
        />
        <Text variant="caption" muted>{`Delivered daily at ${d.questTime ?? '07:00'}`}</Text>
      </SystemWindow>
      <Text dim>
        The System delivers your Daily Quest, warns you before a streak breaks, and nothing else. No spam. Every type can be
        turned off.
      </Text>
      <Button label="Enable notifications" onPress={enable} />
      <Button
        variant="ghost"
        label="Not now"
        onPress={() => {
          set({ notificationsOptIn: false });
          next();
        }}
      />
    </View>
  );
}

export const STEPS: StepDef[] = [
  { id: 'cold-open', kicker: 'SYSTEM', title: '', fullBleed: true, valid: () => true, Component: ColdOpen },
  { id: 'identity', kicker: 'IDENTITY', title: 'Who are you, Hunter?', valid: (d) => (d.hunterName?.trim().length ?? 0) >= 2 && !!d.heroId, Component: Identity },
  { id: 'goal', kicker: 'OBJECTIVE', title: 'What do you seek?', valid: (d) => !!d.goal, Component: choiceStep('goal', GOALS) },
  { id: 'experience', kicker: 'EXPERIENCE', title: 'How long have you trained?', valid: (d) => !!d.experience, Component: choiceStep('experience', EXPERIENCE) },
  { id: 'location', kicker: 'BATTLEGROUND', title: 'Where will you train?', valid: (d) => !!d.location, Component: Location },
  { id: 'schedule', kicker: 'SCHEDULE', title: 'When can you train?', valid: () => true, Component: Schedule },
  { id: 'class', kicker: 'CLASS', title: 'Choose your path', valid: (d) => !!d.heroClass, Component: ClassPick },
  { id: 'consent', kicker: 'YOUR DATA', title: 'Your data stays yours', valid: (d) => d.consentVersion === CONSENT_VERSION, Component: Consent },
  { id: 'body', kicker: 'VITALS', title: 'Your body, measured', valid: (d) => !!d.sex, Component: Body },
  { id: 'lifestyle', kicker: 'DAILY MOVEMENT', title: 'Outside training, how active are you?', valid: (d) => !!d.lifestyle, Component: choiceStep('lifestyle', LIFESTYLES) },
  { id: 'health', kicker: 'SAFETY CHECK', title: 'Before we begin', valid: () => true, Component: Health },
  {
    id: 'assessment', kicker: 'AWAKENING ASSESSMENT', title: 'Show the System what you have',
    valid: (d) => !!d.assessment && (d.assessment.pushups > 0 || d.assessment.plankSec > 0 || d.assessment.squats60 > 0),
    skippable: true, Component: Assessment,
  },
  { id: 'nutrition', kicker: 'MANA', title: 'Fuel for growth', valid: () => true, Component: Nutrition },
  { id: 'notifications', kicker: 'TRANSMISSIONS', title: 'Let the System reach you', fullBleed: false, valid: () => true, Component: NotificationsPrimer },
];
