/** Ready-made challenges to start from; every field stays editable in the builder. */
import type { ChallengeTask } from '@lb/engine';

export interface ChallengePreset {
  id: string;
  name: string;
  blurb: string;
  days: number;
  tasks: ChallengeTask[];
}

export const CHALLENGE_PRESETS: ChallengePreset[] = [
  {
    id: 'pushup-ladder', name: '60-day push-up ladder', blurb: '15 push-ups, one more every other day (44 by day 60).', days: 60,
    tasks: [{ id: 't1', kind: 'exercise', exerciseId: 'push-up', title: '', target: 15, unit: 'reps', addPerStep: 1, stepDays: 2 }],
  },
  {
    id: 'plank-30', name: '30-day plank', blurb: '30 seconds, 5 seconds longer every other day.', days: 30,
    tasks: [{ id: 't1', kind: 'exercise', exerciseId: 'plank', title: '', target: 30, unit: 'sec', addPerStep: 5, stepDays: 2 }],
  },
  {
    id: 'squat-30', name: '30-day squat', blurb: '30 bodyweight squats, two more every other day.', days: 30,
    tasks: [{ id: 't1', kind: 'exercise', exerciseId: 'bodyweight-squat', title: '', target: 30, unit: 'reps', addPerStep: 2, stepDays: 2 }],
  },
  {
    id: 'soft-75', name: '75-day discipline', blurb: 'A workout, water, reading and no alcohol, every day.', days: 75,
    tasks: [
      { id: 't1', kind: 'habit', title: '45-minute workout' },
      { id: 't2', kind: 'habit', title: 'Drink 3 L of water' },
      { id: 't3', kind: 'habit', title: 'Read 10 pages' },
      { id: 't4', kind: 'habit', title: 'No alcohol' },
    ],
  },
  {
    id: 'steps-30', name: '30 days of 10k steps', blurb: 'Walk 10,000 steps every day.', days: 30,
    tasks: [{ id: 't1', kind: 'habit', title: 'Walk 10,000 steps' }],
  },
  {
    id: 'mobility-21', name: '21-day mobility', blurb: 'A deep squat hold and 10 minutes of stretching.', days: 21,
    tasks: [
      { id: 't1', kind: 'exercise', exerciseId: 'deep-squat-hold', title: '', target: 60, unit: 'sec' },
      { id: 't2', kind: 'habit', title: '10 minutes of mobility' },
    ],
  },
];

export interface HabitIdea {
  title: string;
  /** Ionicons name, drawn large on the card */
  icon: string;
  /** scene colours: top-left, bottom-right */
  colors: readonly [string, string];
  difficulty: 1 | 2 | 3;
  category: 'Body' | 'Mind' | 'Fuel' | 'Routine';
}

/** The habit library in the challenge builder (cards with difficulty, grouped by category). */
export const HABIT_LIBRARY: HabitIdea[] = [
  { title: 'Workout for 15 minutes', icon: 'barbell', colors: ['#7C2D12', '#1C1917'], difficulty: 2, category: 'Body' },
  { title: '45-minute workout', icon: 'fitness', colors: ['#991B1B', '#1F1416'], difficulty: 3, category: 'Body' },
  { title: 'Run 2 km', icon: 'walk', colors: ['#9A3412', '#27140B'], difficulty: 2, category: 'Body' },
  { title: 'Walk 10,000 steps', icon: 'footsteps', colors: ['#3F6212', '#141A0B'], difficulty: 2, category: 'Body' },
  { title: '50 push-ups', icon: 'body', colors: ['#B45309', '#22160A'], difficulty: 3, category: 'Body' },
  { title: 'Stretch 10 minutes', icon: 'accessibility', colors: ['#0F766E', '#0A1918'], difficulty: 1, category: 'Body' },
  { title: 'Cold shower', icon: 'snow', colors: ['#0369A1', '#0A1622'], difficulty: 3, category: 'Body' },
  { title: 'Take the stairs', icon: 'trending-up', colors: ['#4D7C0F', '#131A0A'], difficulty: 1, category: 'Body' },
  { title: 'Drink 2 L of water', icon: 'water', colors: ['#0E7490', '#0A1A1F'], difficulty: 1, category: 'Fuel' },
  { title: 'Drink 3 L of water', icon: 'water', colors: ['#1D4ED8', '#0B1226'], difficulty: 2, category: 'Fuel' },
  { title: 'No sugar', icon: 'ice-cream', colors: ['#BE185D', '#1F0E17'], difficulty: 3, category: 'Fuel' },
  { title: 'No junk food', icon: 'fast-food', colors: ['#C2410C', '#20130B'], difficulty: 2, category: 'Fuel' },
  { title: 'Hit your protein target', icon: 'egg', colors: ['#A16207', '#1E170A'], difficulty: 2, category: 'Fuel' },
  { title: 'Eat a vegetable with every meal', icon: 'leaf', colors: ['#15803D', '#0B1A10'], difficulty: 2, category: 'Fuel' },
  { title: 'No alcohol', icon: 'wine', colors: ['#7E22CE', '#170C22'], difficulty: 2, category: 'Fuel' },
  { title: 'Read 10 pages', icon: 'book', colors: ['#6D28D9', '#140D24'], difficulty: 1, category: 'Mind' },
  { title: 'Meditate 10 minutes', icon: 'flower', colors: ['#4338CA', '#0F0E26'], difficulty: 1, category: 'Mind' },
  { title: 'Journal for 5 minutes', icon: 'create', colors: ['#7C3AED', '#150E24'], difficulty: 1, category: 'Mind' },
  { title: 'Learn something new', icon: 'bulb', colors: ['#CA8A04', '#1E180A'], difficulty: 2, category: 'Mind' },
  { title: 'No social media before noon', icon: 'phone-portrait', colors: ['#334155', '#0E1117'], difficulty: 3, category: 'Mind' },
  { title: 'Wake up at 6 AM', icon: 'alarm', colors: ['#EA580C', '#2A1608'], difficulty: 3, category: 'Routine' },
  { title: 'Sleep 8 hours', icon: 'moon', colors: ['#1E3A8A', '#0A0F22'], difficulty: 2, category: 'Routine' },
  { title: 'In bed by 11 PM', icon: 'bed', colors: ['#312E81', '#0C0B1E'], difficulty: 2, category: 'Routine' },
  { title: 'Make your bed', icon: 'sunny', colors: ['#D97706', '#24170A'], difficulty: 1, category: 'Routine' },
];
export const HABIT_IDEAS = HABIT_LIBRARY.map((h) => h.title);
/** The card look for a habit title (library ones get their own scene; custom ones a calm default). */
export const habitLook = (title: string): Pick<HabitIdea, 'icon' | 'colors'> =>
  HABIT_LIBRARY.find((h) => h.title === title) ?? { icon: 'checkmark-done', colors: ['#3B3355', '#121019'] };
