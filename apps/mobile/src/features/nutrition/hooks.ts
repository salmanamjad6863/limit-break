import { normalizeOffProduct, offProductUrl, OFF_USER_AGENT } from '@lb/content';
import type {
  CopyInput, DayFlagsInput, FoodDto, FoodLogInput, FoodLogPatch, FoodSearchResponse, NutritionDayResponse, NutritionProfile,
  NutritionSettings, NutritionSummaryResponse, WeighInInput,
} from '@lb/contracts';
import { gameDate } from '@lb/engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useLocalHunter, useMe } from '@/features/progression';
import { useSession } from '@/features/session';
import { useTrainingProfile } from '@/features/training/profile';
import { api, ApiError, unwrap } from '@/lib/api';
import { newId } from '@/lib/id';
import { asDto, defaultNutrition, localDay, localSearch, localSummary, useNutritionLocal, type LocalData } from './local';

export const nutritionKeys = {
  all: ['nutrition'] as const,
  day: (date: string) => ['nutrition', 'day', date] as const,
  summary: ['nutrition', 'summary'] as const,
  search: (q: string) => ['nutrition', 'search', q] as const,
};

/** Today's game date in the hunter's timezone (03:00 rollover). */
export function useGameDate(): string {
  const tz = useTrainingProfile().timezone || 'UTC';
  const [today, setToday] = useState(() => gameDate(new Date(), tz));
  useEffect(() => {
    const id = setInterval(() => setToday(gameDate(new Date(), tz)), 60_000);
    return () => clearInterval(id);
  }, [tz]);
  return today;
}

export function useNutritionProfile(): NutritionProfile {
  const { data } = useMe();
  const training = useTrainingProfile();
  return data?.nutrition ?? defaultNutrition(training);
}

function useLocalData(): LocalData {
  const logs = useNutritionLocal((s) => s.logs);
  const foods = useNutritionLocal((s) => s.foods);
  const weighIns = useNutritionLocal((s) => s.weighIns);
  const days = useNutritionLocal((s) => s.days);
  const targets = useNutritionLocal((s) => s.targets);
  return useMemo(() => ({ logs, foods, weighIns, days, targets }), [logs, foods, weighIns, days, targets]);
}

/** Persists a newly started week's target outside render (the planner itself is pure). */
function usePersistTarget(t: { effectiveFrom: string } | null | undefined) {
  useEffect(() => {
    if (!t) return;
    const s = useNutritionLocal.getState();
    if (!s.targets.some((x) => x.effectiveFrom === t.effectiveFrom)) s.set({ targets: [...s.targets, t as never] });
  }, [t?.effectiveFrom]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useNutritionDay(date: string): { data: NutritionDayResponse | undefined; isLoading: boolean } {
  const status = useSession((s) => s.status);
  const n = useNutritionProfile();
  const t = useTrainingProfile();
  const d = useLocalData();
  const today = useGameDate();
  const remote = useQuery({
    queryKey: nutritionKeys.day(date),
    enabled: status === 'signedIn',
    queryFn: async () => unwrap<NutritionDayResponse>(await api.nutrition.day.$get({ query: { date } })),
  });
  const local = useMemo(() => (status === 'demo' ? localDay(n, t, d, date, today) : undefined), [status, n, t, d, date, today]);
  usePersistTarget(local?.storeTarget);
  return status === 'demo' ? { data: local?.response, isLoading: false } : { data: remote.data, isLoading: remote.isLoading };
}

export function useNutritionSummary(): { data: NutritionSummaryResponse | undefined } {
  const status = useSession((s) => s.status);
  const n = useNutritionProfile();
  const t = useTrainingProfile();
  const d = useLocalData();
  const today = useGameDate();
  const remote = useQuery({
    queryKey: nutritionKeys.summary,
    enabled: status === 'signedIn',
    queryFn: async () => unwrap<NutritionSummaryResponse>(await api.nutrition.summary.$get()),
  });
  const local = useMemo(() => (status === 'demo' ? localSummary(n, t, d, today) : undefined), [status, n, t, d, today]);
  usePersistTarget(local?.storeTarget);
  return { data: status === 'demo' ? local?.response : remote.data };
}

export function useFoodSearch(q: string): { foods: FoodDto[]; isLoading: boolean } {
  const status = useSession((s) => s.status);
  const d = useLocalData();
  const today = useGameDate();
  const [debounced, setDebounced] = useState(q);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 180);
    return () => clearTimeout(id);
  }, [q]);
  const remote = useQuery({
    queryKey: nutritionKeys.search(debounced),
    enabled: status === 'signedIn',
    queryFn: async () => (await unwrap<FoodSearchResponse>(await api.nutrition.foods.$get({ query: { q: debounced } }))).foods,
    staleTime: 60_000,
  });
  const local = useMemo(() => (status === 'demo' ? localSearch(q, d, today) : []), [status, q, d, today]);
  return status === 'demo' ? { foods: local, isLoading: false } : { foods: remote.data ?? [], isLoading: remote.isLoading };
}

/** Every nutrition write. Demo mode mutates the on-device store; signed in, the server (then refetch). */
export function useNutritionActions() {
  const status = useSession((s) => s.status);
  const qc = useQueryClient();
  const local = () => useNutritionLocal.getState();
  const demo = status === 'demo';
  const refresh = () => {
    if (!demo) qc.invalidateQueries({ queryKey: nutritionKeys.all });
  };
  const remember = (f: FoodDto) => {
    if (f.source !== 'usda' && f.source !== 'recipe') local().set({ foods: { ...local().foods, [f.id]: f } });
  };

  const addLog = useMutation({
    mutationFn: async (input: Omit<FoodLogInput, 'id' | 'loggedAt'>) => {
      const full: FoodLogInput = { ...input, id: newId(), loggedAt: new Date().toISOString() };
      if (demo) {
        remember(input.food);
        local().set({ logs: [...local().logs, full] });
      } else await unwrap(await api.nutrition.logs.$post({ json: full }));
    },
    onSuccess: refresh,
  });
  const patchLog = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: FoodLogPatch }) => {
      if (demo) local().set({ logs: local().logs.map((l) => (l.id === id ? { ...l, ...patch, servingLabel: patch.servingLabel !== undefined ? patch.servingLabel : l.servingLabel } : l)) });
      else await unwrap(await api.nutrition.logs[':id'].$patch({ param: { id }, json: patch }));
    },
    onSuccess: refresh,
  });
  const deleteLog = useMutation({
    mutationFn: async (id: string) => {
      if (demo) local().set({ logs: local().logs.filter((l) => l.id !== id) });
      else await unwrap(await api.nutrition.logs[':id'].$delete({ param: { id } }));
    },
    onSuccess: refresh,
  });
  const copy = useMutation({
    mutationFn: async (input: CopyInput): Promise<number> => {
      if (demo) {
        const src = local().logs.filter((l) => l.localDate === input.fromDate && (!input.meal || l.meal === input.meal));
        const now = new Date().toISOString();
        local().set({ logs: [...local().logs, ...src.map((l) => ({ ...l, id: newId(), localDate: input.toDate, loggedAt: now }))] });
        return src.length;
      }
      return (await unwrap<{ copied: number }>(await api.nutrition.copy.$post({ json: input }))).copied;
    },
    onSuccess: refresh,
  });
  const setDay = useMutation({
    mutationFn: async (input: DayFlagsInput) => {
      if (demo) {
        const cur = local().days[input.localDate] ?? { waterMl: 0, markedComplete: false };
        local().set({ days: { ...local().days, [input.localDate]: { waterMl: input.waterMl ?? cur.waterMl, markedComplete: input.markedComplete ?? cur.markedComplete } } });
      } else await unwrap(await api.nutrition.day.$post({ json: input }));
    },
    onSuccess: refresh,
  });
  const addWeighIn = useMutation({
    mutationFn: async (input: Omit<WeighInInput, 'id' | 'measuredAt'>) => {
      const full: WeighInInput = { ...input, id: newId(), measuredAt: new Date().toISOString() };
      if (demo) {
        // one weigh-in per day: the newest replaces the old one
        const rest = local().weighIns.filter((w) => w.date !== input.localDate);
        local().set({ weighIns: [...rest, { id: full.id, date: input.localDate, kg: input.weightKg }].sort((a, b) => a.date.localeCompare(b.date)) });
      } else await unwrap(await api.nutrition['weigh-ins'].$post({ json: full }));
    },
    onSuccess: refresh,
  });
  const deleteWeighIn = useMutation({
    mutationFn: async (id: string) => {
      if (demo) local().set({ weighIns: local().weighIns.filter((w) => w.id !== id) });
      else await unwrap(await api.nutrition['weigh-ins'][':id'].$delete({ param: { id } }));
    },
    onSuccess: refresh,
  });
  const updateSettings = useMutation({
    mutationFn: async (s: NutritionSettings) => {
      if (demo) {
        const me = useLocalHunter.getState().me;
        if (me) useLocalHunter.getState().setMe({ ...me, nutrition: { ...(me.nutrition ?? { birthDate: `${new Date().getUTCFullYear() - 25}-01-01` }), ...s } as NutritionProfile });
      } else await unwrap(await api.nutrition.settings.$put({ json: s }));
    },
    onSuccess: () => {
      refresh();
      if (!demo) qc.invalidateQueries({ queryKey: ['progression'] });
    },
  });
  const createFood = useMutation({
    mutationFn: async (f: FoodDto): Promise<FoodDto> => {
      if (demo) {
        remember(f);
        return f;
      }
      return unwrap<FoodDto>(await api.nutrition.foods.$post({ json: f }));
    },
  });
  /** Barcode → food. Demo mode asks Open Food Facts directly (only the barcode is sent). */
  const lookupBarcode = useMutation({
    mutationFn: async (code: string): Promise<FoodDto> => {
      if (!/^\d{6,14}$/.test(code)) throw new ApiError(400, 'That doesn’t look like a barcode.');
      if (demo) {
        const cached = Object.values(local().foods).find((f) => f.barcode === code);
        if (cached) return cached;
        const res = await fetch(offProductUrl(code), { headers: { 'User-Agent': OFF_USER_AGENT } });
        const food = normalizeOffProduct(res.ok ? await res.json() : null);
        if (!food) throw new ApiError(404, 'Product not found, or its label is incomplete. Add it as a custom food.');
        const dto = asDto(food);
        remember(dto);
        return dto;
      }
      return unwrap<FoodDto>(await api.nutrition.foods.barcode[':code'].$get({ param: { code } }));
    },
  });
  return { addLog, patchLog, deleteLog, copy, setDay, addWeighIn, deleteWeighIn, updateSettings, createFood, lookupBarcode };
}
