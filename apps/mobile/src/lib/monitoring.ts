/**
 * Crash reporting (Sentry). Off unless EXPO_PUBLIC_SENTRY_DSN is set. Privacy:
 * no default PII, user identified only by an opaque id, emails/IPs stripped, health data never attached.
 */
import { Platform } from 'react-native';
import { env } from './env';

type SentryModule = {
  init: (o: Record<string, unknown>) => void;
  captureException: (e: unknown, ctx?: Record<string, unknown>) => void;
  setUser: (u: { id: string } | null) => void;
  wrap: <T>(c: T) => T;
};
let sentry: SentryModule | null = null;
let started = false;

/** Strips anything personal before an event leaves the device. */
export function scrub<T extends { user?: Record<string, unknown> | null; request?: { cookies?: unknown; headers?: Record<string, unknown> } }>(event: T): T {
  if (event.user) event.user = event.user.id ? { id: event.user.id } : null;
  if (event.request) {
    delete event.request.cookies;
    if (event.request.headers) delete event.request.headers.Authorization;
  }
  return event;
}

export function startMonitoring() {
  if (started || !env.sentryDsn) return;
  started = true;
  try {
    sentry = require('@sentry/react-native') as SentryModule; // eslint-disable-line @typescript-eslint/no-require-imports
    sentry.init({
      dsn: env.sentryDsn,
      sendDefaultPii: false,
      tracesSampleRate: 0.1,
      enableNative: Platform.OS !== 'web',
      release: `limitbreak@${env.appVersion}`,
      beforeSend: scrub,
    });
  } catch {
    sentry = null; // a build without the native module simply runs without crash reports
  }
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (__DEV__) console.warn('[reportError]', error, context);
  try {
    sentry?.captureException(error, context ? { extra: context } : undefined);
  } catch {
    /* never let reporting crash the app */
  }
}

/** Opaque id only (Supabase user uuid); never email or name. */
export function identifyForCrashes(userId: string | null) {
  try {
    sentry?.setUser(userId ? { id: userId } : null);
  } catch {
    /* noop */
  }
}
