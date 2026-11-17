import type { FoodDto, Meal } from '@lb/contracts';
import { create } from 'zustand';

/** The food being portioned (passed between the add/scan/create screens and the portion sheet). */
export interface FoodDraft {
  food: FoodDto | null;
  meal: Meal;
  date: string;
  /** editing an existing log */
  logId: string | null;
  grams: number | null;
  servingLabel: string | null;
}

export const useFoodDraft = create<FoodDraft & { set: (p: Partial<FoodDraft>) => void }>()((set) => ({
  food: null, meal: 'breakfast', date: '', logId: null, grams: null, servingLabel: null, set: (p) => set(p),
}));

export const MEALS: { id: Meal; label: string; icon: 'sunny-outline' | 'restaurant-outline' | 'moon-outline' | 'cafe-outline' }[] = [
  { id: 'breakfast', label: 'Breakfast', icon: 'sunny-outline' },
  { id: 'lunch', label: 'Lunch', icon: 'restaurant-outline' },
  { id: 'dinner', label: 'Dinner', icon: 'moon-outline' },
  { id: 'snack', label: 'Snacks', icon: 'cafe-outline' },
];

/** Meal that fits the time of day (for "Add food" defaults). */
export function mealForNow(d = new Date()): Meal {
  const h = d.getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
}
