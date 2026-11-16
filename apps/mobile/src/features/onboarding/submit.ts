import { assessmentNorms } from '@lb/content';
import { OnboardingInput, type MeResponse } from '@lb/contracts';
import { displayStat, initialStats, levelFromXp } from '@lb/engine';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { progressionKeys, useLocalHunter } from '@/features/progression';
import { useSession } from '@/features/session';
import { api, unwrap } from '@/lib/api';
import { scheduleDailyQuestReminder } from '@/lib/notifications';
import { birthDateFromAge, type Draft } from './store';

export function toInput(d: Draft): OnboardingInput {
  return OnboardingInput.parse({
    ...d,
    birthDate: birthDateFromAge(d.ageYears ?? 24),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
  });
}

/** Same math the server runs — used for the reveal screen and for demo mode. */
export function previewMe(input: OnboardingInput): MeResponse {
  const start = initialStats({ sex: input.sex, experience: input.experience, assessment: input.assessment, norms: assessmentNorms });
  const s = start.stats;
  return {
    id: 'local',
    onboarded: true,
    hunterName: input.hunterName,
    heroId: input.heroId,
    heroClass: input.heroClass,
    profile: {
      goal: input.goal, experience: input.experience, location: input.location, equipment: input.equipment,
      injuries: input.injuries, daysPerWeek: input.daysPerWeek, sessionMinutes: input.sessionMinutes, sex: input.sex,
      heightCm: input.heightCm, weightKg: input.weightKg, timezone: input.timezone,
    },
    state: {
      level: levelFromXp(start.xp), xp: start.xp, rank: 'E', apUnspent: 0, streak: 0, shields: 2,
      stats: { STR: displayStat(s.STR), AGI: displayStat(s.AGI), END: displayStat(s.END), VIT: displayStat(s.VIT), SPI: displayStat(s.SPI) },
    },
  };
}

export function useCompleteOnboarding() {
  const status = useSession((s) => s.status);
  const setLocal = useLocalHunter((s) => s.setMe);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: OnboardingInput): Promise<MeResponse> => {
      const me = status === 'demo' ? previewMe(input) : await unwrap<MeResponse>(await api.me.onboarding.$post({ json: input }));
      if (input.notificationsOptIn) await scheduleDailyQuestReminder(input.questTime, input.hunterName);
      return me;
    },
    onSuccess: (me) => {
      if (status === 'demo') setLocal(me);
      else qc.setQueryData(progressionKeys.me(), me);
    },
  });
}
