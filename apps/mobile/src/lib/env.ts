/** Public runtime config. Only EXPO_PUBLIC_* values are inlined into the bundle. */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '',
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787',
};

/** Without Supabase config the app runs in local demo mode (no sign-in, no sync). */
export const isBackendConfigured = env.supabaseUrl !== '' && env.supabaseKey !== '';
