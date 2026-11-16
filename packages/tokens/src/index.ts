/**
 * Design tokens — ARCHITECTURE.md §5 / PLAN.md "Design principles".
 * Direction: a premium fitness app first, anime second. Calm neutral surfaces, ONE accent
 * (violet), data colours for metrics, and anime flair reserved for key moments
 * (hero sigil, rank badge, System messages, level-ups).
 */
export const palette = {
  void: '#07070B',
  base: '#0B0B11',
  panel: '#121219',
  panelRaised: '#1A1A23',
  hairline: 'rgba(255,255,255,0.07)',
  hairlineStrong: 'rgba(255,255,255,0.12)',
  text: '#F4F3F8',
  textDim: '#A9A7B8',
  textMuted: '#6D6B7D',
  violet: '#7C5CFF',
  violetSoft: '#A893FF',
  crimson: '#FF4D6D',
  ember: '#FF9F43',
  gold: '#F5C451',
  cyan: '#38C6F4',
  green: '#3DDC97',
} as const;

/** Rank accent colours: rank badge, aura, level-up only. */
export const rankColor = {
  E: '#A1A1AA',
  D: '#3DDC97',
  C: '#38C6F4',
  B: '#7C5CFF',
  A: '#FF4D6D',
  S: '#F5C451',
} as const;

export const colors = {
  dark: {
    background: palette.void,
    surface: palette.panel,
    surfaceRaised: palette.panelRaised,
    border: palette.hairline,
    borderStrong: palette.hairlineStrong,
    text: palette.text,
    textDim: palette.textDim,
    textMuted: palette.textMuted,
    accent: palette.violet,
    accentGlow: palette.violetSoft,
    danger: palette.crimson,
    success: palette.green,
    warning: palette.ember,
    mana: palette.cyan,
    hp: palette.crimson,
    xp: palette.violetSoft,
    track: 'rgba(255,255,255,0.06)',
  },
  light: {
    background: '#F6F5FA',
    surface: '#FFFFFF',
    surfaceRaised: '#FFFFFF',
    border: 'rgba(15,10,40,0.08)',
    borderStrong: 'rgba(15,10,40,0.14)',
    text: '#14121C',
    textDim: '#4F4C60',
    textMuted: '#85839A',
    accent: '#6A48F5',
    accentGlow: '#7C5CFF',
    danger: '#E11D48',
    success: '#059669',
    warning: '#EA7A12',
    mana: '#0284C7',
    hp: '#E11D48',
    xp: '#6A48F5',
    track: 'rgba(15,10,40,0.06)',
  },
} as const;
export type ThemeName = keyof typeof colors;
export type ThemeColors = { [K in keyof (typeof colors)['dark']]: string };

/** Data colours for metrics — used for bars, rings and charts, never for chrome. */
export const dataColors = {
  workout: palette.violet,
  quest: palette.crimson,
  protein: palette.cyan,
  carbs: palette.green,
  fat: palette.ember,
  calories: palette.crimson,
} as const;

/** True Stat colours (flat — gradients only on hero moments). */
export const statColors = {
  STR: ['#FF4D6D', '#FF7A90'],
  AGI: ['#38C6F4', '#7DD8F7'],
  END: ['#FF9F43', '#FFBE7D'],
  VIT: ['#3DDC97', '#7BE8B8'],
  SPI: ['#7C5CFF', '#A893FF'],
} as const satisfies Record<string, readonly [string, string]>;

export const spacing = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;
export const radius = { sm: 8, md: 12, lg: 20, xl: 28, pill: 999 } as const;

/** Font keys map to fonts loaded in apps/mobile (Google Fonts). */
export const fonts = {
  /** Brand/hero moments only: logo, rank letters, cinematic headlines */
  display: 'DelaGothicOne_400Regular',
  /** Big numbers (stats, kcal, timers) — tabular, technical */
  numeric: 'Rajdhani_700Bold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const typeScale = {
  display: { size: 34, line: 40, font: fonts.display, tracking: 0 },
  title: { size: 28, line: 34, font: fonts.bold, tracking: -0.6 },
  headline: { size: 20, line: 26, font: fonts.semibold, tracking: -0.3 },
  heading: { size: 17, line: 22, font: fonts.semibold, tracking: -0.2 },
  body: { size: 15, line: 22, font: fonts.regular, tracking: 0 },
  callout: { size: 14, line: 20, font: fonts.medium, tracking: 0 },
  caption: { size: 13, line: 18, font: fonts.regular, tracking: 0 },
  label: { size: 12, line: 16, font: fonts.semibold, tracking: 0.6 },
  stat: { size: 34, line: 38, font: fonts.numeric, tracking: 0 },
  micro: { size: 11, line: 14, font: fonts.medium, tracking: 0.3 },
} as const;
export type TypeVariant = keyof typeof typeScale;

export const motion = {
  spring: {
    snappy: { damping: 18, stiffness: 260, mass: 0.8 },
    smooth: { damping: 22, stiffness: 160, mass: 1 },
    heavy: { damping: 14, stiffness: 90, mass: 1.4 },
  },
  duration: { instant: 120, fast: 200, base: 320, slow: 600, cinematic: 1400 },
  stagger: { list: 40, hud: 60 },
} as const;
