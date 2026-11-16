import { OnboardingInput } from '@lb/contracts';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { STEPS, toInput, useOnboarding } from '@/features/onboarding';
import { Reveal } from '@/features/onboarding/Reveal';
import { useTheme } from '@/theme';
import { Bar, Button, Icon, PressableScale, Text } from '@/ui';
import { ScreenBackground } from '@/ui/fx';

const TOTAL = STEPS.length + 1; // + reveal

export default function AwakeningScreen() {
  const { c, spacing } = useTheme();
  const step = useOnboarding((s) => s.step);
  const draft = useOnboarding((s) => s.draft);
  const go = useOnboarding((s) => s.go);
  const setAssessment = useOnboarding((s) => s.setAssessment);
  const reset = useOnboarding((s) => s.reset);

  const isReveal = step >= STEPS.length;
  const def = STEPS[Math.min(step, STEPS.length - 1)]!;
  const canContinue = def.valid(draft);
  const next = () => go(Math.min(step + 1, STEPS.length));
  const back = () => go(Math.max(0, step - 1));

  const revealInput = useMemo(() => {
    if (!isReveal) return null;
    const parsed = OnboardingInput.safeParse(safeInput(draft));
    return parsed.success ? parsed.data : null;
  }, [isReveal, draft]);

  const finish = () => {
    reset();
    router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenBackground />
      <SafeAreaView style={{ flex: 1 }}>
        {!def.fullBleed || isReveal ? (
          <View style={{ paddingHorizontal: spacing[4], paddingTop: spacing[2], gap: spacing[2] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <PressableScale haptic="tap" onPress={back} accessibilityRole="button" accessibilityLabel="Back" style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: spacing[1] }}>
                <Icon name="chevron-back" size={20} color={c.textDim} />
                <Text variant="callout" dim>Back</Text>
              </PressableScale>
              <Text variant="caption" muted>{`${step + 1} of ${TOTAL}`}</Text>
            </View>
            <Bar ratio={(step + 1) / TOTAL} height={4} />
          </View>
        ) : null}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, padding: spacing[4], gap: spacing[5], maxWidth: 560, width: '100%', alignSelf: 'center' }}>
            <Animated.View key={step} entering={FadeInRight.springify().damping(20)} exiting={FadeOutLeft.duration(160)} style={{ flexGrow: 1, gap: spacing[5] }}>
              {isReveal ? (
                revealInput ? (
                  <Reveal input={revealInput} onDone={finish} />
                ) : (
                  <View style={{ gap: spacing[3] }}>
                    <Text color={c.danger}>Some answers are missing. Go back and complete each step.</Text>
                    <Button label="Back" variant="ghost" onPress={back} />
                  </View>
                )
              ) : (
                <>
                  {!def.fullBleed ? (
                    <View style={{ gap: spacing[1] }}>
                      <Text variant="label" color={c.accentGlow}>{def.kicker}</Text>
                      <Text variant="title">{def.title}</Text>
                    </View>
                  ) : null}
                  <def.Component next={next} />
                </>
              )}
            </Animated.View>
          </ScrollView>
          {!def.fullBleed && !isReveal && def.id !== 'notifications' ? (
            <View style={{ padding: spacing[4], gap: spacing[2], maxWidth: 560, width: '100%', alignSelf: 'center' }}>
              <Button label="Continue" onPress={next} disabled={!canContinue} />
              {def.skippable ? (
                <Button
                  variant="ghost"
                  label="Skip for now"
                  onPress={() => {
                    setAssessment(null);
                    next();
                  }}
                />
              ) : null}
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function safeInput(d: Parameters<typeof toInput>[0]) {
  try {
    return toInput(d);
  } catch {
    return d;
  }
}
