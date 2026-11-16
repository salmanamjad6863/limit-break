import type { Experience, Goal, HeroClass, Lifestyle, TrainingLocation } from '@lb/contracts';
import type { z } from 'zod';

type E<T extends z.ZodType> = z.infer<T>;

export const GOALS: { value: E<typeof Goal>; title: string; subtitle: string }[] = [
  { value: 'cut', title: 'Burn fat', subtitle: 'Lose fat, keep muscle. A lean, sharp physique.' },
  { value: 'bulk', title: 'Build muscle', subtitle: 'Gain size and strength with a small surplus.' },
  { value: 'recomp', title: 'Recomposition', subtitle: 'Lose fat and gain muscle at the same weight.' },
  { value: 'maintain', title: 'Stay sharp', subtitle: 'Keep your weight, build fitness and habits.' },
];

export const EXPERIENCE: { value: E<typeof Experience>; title: string; subtitle: string }[] = [
  { value: 'beginner', title: 'Beginner', subtitle: 'Under 6 months of training. Push-ups feel hard.' },
  { value: 'novice', title: 'Novice', subtitle: '6–18 months. You know the basics and still progress fast.' },
  { value: 'intermediate', title: 'Intermediate', subtitle: '1.5–4 years. Progress needs planning now.' },
  { value: 'advanced', title: 'Advanced', subtitle: '4+ years of consistent, structured training.' },
];

export const LOCATIONS: { value: E<typeof TrainingLocation>; title: string; subtitle: string }[] = [
  { value: 'HOME', title: 'Home', subtitle: 'Bodyweight and whatever gear you own.' },
  { value: 'GYM', title: 'Gym', subtitle: 'Full equipment: barbells, racks, machines.' },
  { value: 'HYBRID', title: 'Hybrid', subtitle: 'Some days at home, some at the gym.' },
];

export const EQUIPMENT = [
  { value: 'pull_up_bar', label: 'Pull-up bar' },
  { value: 'bands', label: 'Bands' },
  { value: 'dumbbells', label: 'Dumbbells' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'bench', label: 'Bench' },
  { value: 'barbell', label: 'Barbell' },
  { value: 'rack', label: 'Squat rack' },
  { value: 'cable', label: 'Cables' },
  { value: 'machines', label: 'Machines' },
  { value: 'dip_bars', label: 'Dip bars' },
] as const;
export const FULL_GYM = EQUIPMENT.map((e) => e.value) as string[];

export const CLASSES: { value: E<typeof HeroClass>; title: string; subtitle: string }[] = [
  { value: 'FIGHTER', title: 'Fighter', subtitle: 'Strength. Heavy compound lifts, raw power.' },
  { value: 'ASSASSIN', title: 'Assassin', subtitle: 'Calisthenics and agility. Master your bodyweight.' },
  { value: 'JUGGERNAUT', title: 'Juggernaut', subtitle: 'Hypertrophy. Build size and armour.' },
  { value: 'RANGER', title: 'Ranger', subtitle: 'Running and endurance. Never tire.' },
  { value: 'MONK', title: 'Monk', subtitle: 'Mobility, core and control.' },
  { value: 'HYBRID', title: 'Hybrid', subtitle: 'A balanced all-rounder.' },
];

export function recommendedClass(goal?: E<typeof Goal>, location?: E<typeof TrainingLocation>): E<typeof HeroClass> {
  if (goal === 'bulk') return 'JUGGERNAUT';
  if (goal === 'cut') return location === 'GYM' ? 'FIGHTER' : 'ASSASSIN';
  if (goal === 'recomp') return 'FIGHTER';
  return 'HYBRID';
}

export const LIFESTYLES: { value: E<typeof Lifestyle>; title: string; subtitle: string }[] = [
  { value: 'sedentary', title: 'Mostly seated', subtitle: 'Desk job, under ~5,000 steps a day.' },
  { value: 'light', title: 'Lightly active', subtitle: 'Some walking, ~5,000–8,000 steps.' },
  { value: 'active', title: 'Active', subtitle: 'On your feet a lot, ~8,000–12,000 steps.' },
  { value: 'veryActive', title: 'Very active', subtitle: 'Physical job or 12,000+ steps.' },
];

/** Our own plain-language health screen, modelled on standard pre-exercise questionnaires. */
export const HEALTH_QUESTIONS = [
  'Has a doctor ever said you have a heart condition or high blood pressure?',
  'Do you feel pain in your chest at rest, during daily activities or when exercising?',
  'Do you lose balance from dizziness, or have you lost consciousness in the last year?',
  'Do you have a bone, joint or soft-tissue problem that activity could make worse?',
  'Are you taking medication for a chronic condition?',
  'Are you pregnant or have you given birth in the last 6 months?',
  'Has a doctor told you to only do medically supervised activity?',
] as const;

export const INJURIES = [
  { value: 'shoulder', label: 'Shoulder' },
  { value: 'elbow', label: 'Elbow' },
  { value: 'wrist', label: 'Wrist' },
  { value: 'lower_back', label: 'Lower back' },
  { value: 'hip', label: 'Hip' },
  { value: 'knee', label: 'Knee' },
  { value: 'ankle', label: 'Ankle' },
] as const;

export const DEFAULT_RATE: Record<E<typeof Goal>, number> = { cut: -0.005, bulk: 0.001, recomp: 0, maintain: 0 };
