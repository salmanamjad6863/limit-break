import { z } from 'zod';

export const Uuid = z.uuid();
/** Game-day date, YYYY-MM-DD */
export const IsoDate = z.iso.date();
export const IsoDateTime = z.iso.datetime({ offset: true });

export const Sex = z.enum(['male', 'female', 'unspecified']);
export const Goal = z.enum(['cut', 'maintain', 'recomp', 'bulk']);
export const Experience = z.enum(['beginner', 'novice', 'intermediate', 'advanced', 'pro']);
export const TrainingLocation = z.enum(['HOME', 'GYM', 'HYBRID']);
export const HeroClass = z.enum(['HYBRID', 'FIGHTER', 'ASSASSIN', 'JUGGERNAUT', 'RANGER', 'MONK']);
export const Rank = z.enum(['E', 'D', 'C', 'B', 'A', 'S']);
export const Lifestyle = z.enum(['sedentary', 'light', 'active', 'veryActive']);
export const FatPreference = z.enum(['lower', 'balanced', 'higher']);
export const NutritionMode = z.enum(['full', 'proteinOnly', 'off']);
