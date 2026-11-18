/** Sprint 11 depth APIs: measurements, private photos, meal templates, weekly debrief. */
import type {
  ApplyMealTemplateResponse, AwakeningPairDto, CreateProgressPhotoInput, MeasurementInput, MeasurementsResponse,
  MealTemplateDto, ProgressPhotoDto, ProgressPhotosResponse, SignProgressPhotoResponse, UpsertMealTemplateInput, WeeklyDebriefDto,
} from '@lb/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/session';
import { unwrapCommunity } from '@/features/community/api';
import { api } from '@/lib/api';
import { newId } from '@/lib/id';

export const depthKeys = {
  all: ['depth'] as const,
  measurements: ['depth', 'measurements'] as const,
  photos: ['depth', 'photos'] as const,
  awakening: ['depth', 'awakening'] as const,
  templates: ['depth', 'meal-templates'] as const,
  debrief: ['depth', 'debrief'] as const,
};

const useOn = () => useSession((s) => s.status === 'signedIn');

export function useMeasurements() {
  const on = useOn();
  return useQuery({
    queryKey: depthKeys.measurements, enabled: on, staleTime: 60_000,
    queryFn: async () => unwrapCommunity<MeasurementsResponse>(await api.depth.measurements.$get()),
  });
}

export function useUpsertMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<MeasurementInput, 'id'> & { id?: string }) =>
      unwrapCommunity(await api.depth.measurements.$post({ json: { id: input.id ?? newId(), ...input } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: depthKeys.measurements }),
  });
}

export function useProgressPhotos() {
  const on = useOn();
  return useQuery({
    queryKey: depthKeys.photos, enabled: on, staleTime: 30_000,
    queryFn: async () => unwrapCommunity<ProgressPhotosResponse>(await api.depth.photos.$get({ query: {} })),
  });
}

export function useAwakeningPair() {
  const on = useOn();
  return useQuery({
    queryKey: depthKeys.awakening, enabled: on, staleTime: 30_000,
    queryFn: async () => unwrapCommunity<AwakeningPairDto>(await api.depth.photos.awakening.$get()),
  });
}

export function useCreateProgressPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<CreateProgressPhotoInput, 'id' | 'storageKey'> & { uri: string }) => {
      const id = newId();
      const signed = await unwrapCommunity<SignProgressPhotoResponse>(await api.depth.photos.sign.$post({ json: { id } }));
      const blob = await (await fetch(input.uri)).blob();
      if (blob.size > signed.maxBytes) throw new Error('Photo is too large (max 8 MB).');
      const up = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      if (!up.ok) throw new Error('Upload failed. Try again.');
      const json: CreateProgressPhotoInput = {
        id, localDate: input.localDate, kind: input.kind, storageKey: signed.storageKey,
        width: input.width, height: input.height, note: input.note ?? null, takenAt: input.takenAt,
      };
      return unwrapCommunity<ProgressPhotoDto>(await api.depth.photos.$post({ json }));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: depthKeys.photos });
      void qc.invalidateQueries({ queryKey: depthKeys.awakening });
    },
  });
}

export function useDeleteProgressPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrapCommunity(await api.depth.photos[':id'].$delete({ param: { id } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: depthKeys.photos });
      void qc.invalidateQueries({ queryKey: depthKeys.awakening });
    },
  });
}

export function useMealTemplates() {
  const on = useOn();
  return useQuery({
    queryKey: depthKeys.templates, enabled: on, staleTime: 60_000,
    queryFn: async () => unwrapCommunity<{ templates: MealTemplateDto[] }>(await api.depth['meal-templates'].$get()),
  });
}

export function useUpsertMealTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertMealTemplateInput) =>
      unwrapCommunity<MealTemplateDto>(await api.depth['meal-templates'].$put({ json: input })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: depthKeys.templates }),
  });
}

export function useDeleteMealTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrapCommunity(await api.depth['meal-templates'][':id'].$delete({ param: { id } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: depthKeys.templates }),
  });
}

export function useApplyMealTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: { id: string; toDate: string; applyId?: string }) =>
      unwrapCommunity<ApplyMealTemplateResponse>(await api.depth['meal-templates'][':id'].apply.$post({
        param: { id: i.id },
        json: { toDate: i.toDate, applyId: i.applyId ?? newId() },
      })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['nutrition'] }),
  });
}

export function useWeeklyDebrief(enabled = true) {
  const on = useOn();
  return useQuery({
    queryKey: depthKeys.debrief, enabled: on && enabled, staleTime: 5 * 60_000,
    queryFn: async () => unwrapCommunity<WeeklyDebriefDto>(await api.depth.debrief.$get({ query: {} })),
  });
}

export function useGenerateDebrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrapCommunity<WeeklyDebriefDto>(await api.depth.debrief.generate.$post({ json: {} })),
    onSuccess: (d) => {
      qc.setQueryData(depthKeys.debrief, d);
      void qc.invalidateQueries({ queryKey: depthKeys.debrief });
    },
  });
}
