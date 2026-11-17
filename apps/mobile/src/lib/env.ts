/** Public runtime config. Only EXPO_PUBLIC_* values are inlined into the bundle. */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '',
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787',
  /** CDN / Supabase Storage base for exercise demo media (VISUALS.md §3.5, §3.9). Empty = fallbacks only. */
  mediaBaseUrl: process.env.EXPO_PUBLIC_MEDIA_BASE_URL ?? '',
  /** crash reporting (Sentry). Empty = off */
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  /** product analytics (PostHog, EU cloud by default). Empty = off */
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
  appVersion: '1.0.0',
  /** public legal pages (required at sign-up by the stores) */
  privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL ?? '',
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL ?? '',
};

/** Without Supabase config the app runs in local demo mode (no sign-in, no sync). */
export const isBackendConfigured = env.supabaseUrl !== '' && env.supabaseKey !== '';
