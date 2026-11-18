/**
 * Product analytics — privacy first. Off unless EXPO_PUBLIC_POSTHOG_KEY is set AND the user opted in.
 * Anonymous install id only; never email, name, body weight, foods or free text. Properties are coarse
 * (buckets, enums). Tiny client for PostHog's public batch endpoint: no SDK, no native code.
 */
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { env } from './env';
import { zustandStorage } from './storage';

export const useAnalyticsConsent = create<{
  consent: 'unknown' | 'granted' | 'denied';
  installId: string;
  set: (c: 'granted' | 'denied') => void;
}>()(
  persist((set) => ({ consent: 'unknown', installId: randomUUID(), set: (consent) => set({ consent }) }), {
    name: 'lb-analytics', storage: createJSONStorage(() => zustandStorage),
  }),
);

/** The full event taxonomy. Adding an event means adding it here (reviewed for privacy). */
export type AnalyticsEvent =
  | { event: 'app_opened' }
  | { event: 'onboarding_completed'; goal: string; location: string; experience: string }
  | { event: 'workout_finished'; kind: 'program' | 'quick'; minutes_bucket: string; working_sets: number; prs: number }
  | { event: 'workout_edited' | 'workout_deleted' | 'manual_workout_logged' }
  | { event: 'quest_completed'; kind: string }
  | { event: 'food_logged'; source: string; meal: string }
  | { event: 'weigh_in_logged' }
  | { event: 'trial_attempted'; target_rank: string; passed: boolean }
  | { event: 'settings_changed'; area: 'training' | 'nutrition' | 'identity' | 'notifications' }
  | { event: 'follow_along_finished'; kind: 'quest' | 'quick' | 'warmup' | 'cooldown' };

/** Coarse duration buckets (never exact values). */
export const minutesBucket = (m: number) => (m < 15 ? '<15' : m < 30 ? '15-29' : m < 45 ? '30-44' : m < 60 ? '45-59' : m < 90 ? '60-89' : '90+');

const enabled = () => !!env.posthogKey && useAnalyticsConsent.getState().consent === 'granted';
let queue: { event: string; properties: Record<string, unknown>; timestamp: string }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  if (!queue.length || !enabled()) {
    queue = [];
    return;
  }
  const batch = queue.splice(0, queue.length);
  try {
    await fetch(`${env.posthogHost.replace(/\/$/, '')}/batch/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: env.posthogKey, batch }),
    });
  } catch {
    /* analytics never affects the app; dropped events are fine */
  }
}

export function track(e: AnalyticsEvent) {
  if (!enabled()) return;
  const { event, ...props } = e;
  queue.push({
    event,
    timestamp: new Date().toISOString(),
    properties: {
      ...props, distinct_id: useAnalyticsConsent.getState().installId, $process_person_profile: false,
      platform: Platform.OS, app_version: env.appVersion,
    },
  });
  if (queue.length >= 20) void flush();
  else timer ??= setTimeout(() => void flush(), 30_000);
}
