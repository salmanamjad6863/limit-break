import { assessmentNorms, exercises } from '@lb/content';
import type { ProgressionResponse } from '@lb/contracts';
import { computeTrueStats, gameDate, trialStatus, type Rank } from '@lb/engine';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSession } from '@/features/session';
import { api, unwrap } from '@/lib/api';
import { useTraining } from '@/features/training/store';
import { useTrainingProfile } from '@/features/training/profile';
import { useMe } from './api';
import { hunterAge } from './localHunter';
import { progressionKeys } from './keys';
import { useProgress } from './progressStore';

const DAY = 86_400_000;

/** Calisthenics chains: chain id = first exercise id. */
export const CHAINS = exercises.filter((e) => e.progression).map((e) => e.progression!.split('>'));

/** Highest chain levels reached from a list of exercise ids performed for ≥ 5 clean reps. */
export function chainLevelsFrom(exerciseIds: Iterable<string>): Record<string, number> {
  const done = new Set(exerciseIds);
  const out: Record<string, number> = {};
  for (const chain of CHAINS) {
    const lvl = chain.reduce((l, id, i) => (done.has(id) ? i + 1 : l), 0);
    if (lvl > 0) out[chain[0]!] = lvl;
  }
  return out;
}

/**
 * Progression for the Hunter Profile / Home. Signed in: the server's answer.
 * Demo: the same engine functions over on-device data.
 */
export function useProgression(): { data: ProgressionResponse | undefined; isLoading: boolean } {
  const status = useSession((s) => s.status);
  const { data: me } = useMe();
  const profile = useTrainingProfile();
  const tests = useProgress((s) => s.tests);
  const attempts = useProgress((s) => s.attempts);
  const calLevels = useProgress((s) => s.calLevels);
  const history = useTraining((s) => s.history);
  const bestE1rm = useTraining((s) => s.bestE1rm);
  const xpByDate = useTraining((s) => s.xpByDate);

  const remote = useQuery({
    queryKey: [...progressionKeys.all, 'detail'],
    enabled: status === 'signedIn',
    queryFn: async () => unwrap<ProgressionResponse>(await api.progression.$get()),
  });

  const local = useMemo<ProgressionResponse | undefined>(() => {
    if (status !== 'demo' || !me?.state) return undefined;
    const now = Date.now();
    const recent = history.filter((h) => now - Date.parse(`${h.date}T12:00:00`) <= 28 * DAY);
    const program = recent.filter((h) => h.kind === 'program');
    const last = Math.max(0, ...history.map((h) => Date.parse(`${h.date}T12:00:00`)), ...attempts.map((a) => Date.parse(a.at)));
    const age = hunterAge(me); // nutrition birth date, same rule as the server
    const b = computeTrueStats(
      {
        sex: profile.sex, ageYears: age, bodyweightKg: profile.weightKg, experience: profile.experience, tests, bestE1rm,
        calisthenicsLevels: Object.values(calLevels), weeklyHardSets4w: recent.reduce((s, h) => s + h.workingSets, 0) / 4,
        sessionsDone28: program.length, sessionsPlanned28: program.length || history.length ? profile.daysPerWeek * 4 : 0,
        weeksSinceData: last ? Math.max(0, (now - last) / (7 * DAY)) : 0,
      },
      assessmentNorms,
    );
    const today = gameDate(new Date(), profile.timezone || 'UTC');
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(`${today}T12:00:00`);
      d.setDate(d.getDate() - (13 - i));
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { date: iso, xp: xpByDate[iso] ?? 0 };
    });
    const prMap = new Map<string, { exerciseId: string; e1rmKg: number; at: string }>();
    for (const h of history) for (const p of h.prs) if ((prMap.get(p.exerciseId)?.e1rmKg ?? 0) < p.e1rmKg) prMap.set(p.exerciseId, { ...p, at: h.date });
    return {
      stats: b.stats, sources: b.sources, details: b.details,
      trial: trialStatus({ rank: me.state.rank as Rank, level: me.state.level, attempts: attempts.map((a) => ({ target: a.target, at: a.at, passed: a.passed })) }),
      attempts: attempts.slice(0, 5).map(({ id, target, at, passed, composite }) => ({
        id, target, at, passed, composite, reviewNote: null,
        verification: passed && (target === 'A' || target === 'S') ? ('required' as const) : ('none' as const),
      })),
      xpByDay: days,
      prs: [...prMap.values()].sort((a, b2) => b2.e1rmKg - a.e1rmKg).slice(0, 10),
    };
  }, [status, me, profile, tests, attempts, calLevels, history, bestE1rm, xpByDate]);

  return status === 'demo' ? { data: local, isLoading: false } : { data: remote.data, isLoading: remote.isLoading };
}
