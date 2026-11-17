import { assessmentNorms } from '@lb/content';
import type { FitnessTests, TrialAttemptResponse } from '@lb/contracts';
import {
  apBetween, applyDailyCap, evaluateTrial, gameDate, levelFromXp, RANK_REQUIREMENTS, scoreTrialEvents, trialStatus, XP,
  type HeroClass, type Rank,
} from '@lb/engine';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCelebrations } from '@/features/celebrations';
import { useSession } from '@/features/session';
import { useTraining } from '@/features/training/store';
import { useTrainingProfile } from '@/features/training/profile';
import { api, ApiError, unwrap } from '@/lib/api';
import { newId } from '@/lib/id';
import { useMe } from './api';
import { progressionKeys } from './keys';
import { useLocalHunter } from './localHunter';
import { useProgress } from './progressStore';
import { track } from '@/lib/analytics';

/** Submits a Rank Trial. Signed in: server-scored. Demo: same engine on-device. */
export function useAttemptTrial() {
  const status = useSession((s) => s.status);
  const { data: me } = useMe();
  const profile = useTrainingProfile();
  const setLocal = useLocalHunter((s) => s.setMe);
  const enqueue = useCelebrations((s) => s.enqueue);
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ setting, results }: { setting: 'HOME' | 'GYM'; results: FitnessTests }): Promise<TrialAttemptResponse> => {
      const id = newId();
      let res: TrialAttemptResponse;
      if (status === 'signedIn') {
        res = await unwrap<TrialAttemptResponse>(await api.progression.trials.$post({ json: { id, setting, results } }));
        qc.invalidateQueries({ queryKey: progressionKeys.all });
      } else {
        if (!me?.state) throw new ApiError(400, 'not onboarded');
        const p = useProgress.getState();
        const st = trialStatus({ rank: me.state.rank as Rank, level: me.state.level, attempts: p.attempts.map((a) => ({ target: a.target, at: a.at, passed: a.passed })) });
        if (!st.eligible || !st.target) throw new ApiError(409, st.reason);
        const events = scoreTrialEvents(
          { sex: profile.sex, ageYears: 28, bodyweightKg: profile.weightKg, setting, results, bestE1rm: useTraining.getState().bestE1rm },
          assessmentNorms,
        );
        const target = st.target;
        const ev = evaluateTrial({ target, level: me.state.level, heroClass: (me.heroClass ?? 'HYBRID') as HeroClass, events });
        const rewards: unknown[] = [];
        if (ev.passed) {
          const date = gameDate(new Date(), profile.timezone || 'UTC');
          const t = useTraining.getState();
          const cap = applyDailyCap(t.xpByDate[date] ?? 0, XP.rankTrialPass);
          const xp = me.state.xp + cap.granted;
          const from = levelFromXp(me.state.xp);
          const to = levelFromXp(xp);
          t.addXp(date, cap.granted);
          rewards.push({ type: 'rankUp', from: me.state.rank, to: target }, { type: 'xp', amount: cap.granted, reason: 'rankTrial' });
          if (to > from) rewards.push({ type: 'levelUp', from, to, ap: apBetween(from, to) });
          setLocal({ ...me, state: { ...me.state, rank: target, xp, level: to, apUnspent: me.state.apUnspent + apBetween(from, to) } });
        }
        const req = RANK_REQUIREMENTS[target];
        res = {
          attemptId: id, target, passed: ev.passed, composite: Math.round(ev.composite * 10) / 10,
          required: { composite: req.composite, minEvent: req.minEvent }, events, reasons: ev.reasons,
          retryAt: ev.passed ? null : new Date(Date.now() + 7 * 86_400_000).toISOString(), rewards, duplicate: false,
        };
        p.addAttempt({ id, target, at: new Date().toISOString(), passed: ev.passed, composite: res.composite, setting });
      }
      useProgress.getState().mergeTests(results);
      enqueue(res.rewards as never);
      track({ event: 'trial_attempted', target_rank: res.target, passed: res.passed });
      return res;
    },
  });
}
