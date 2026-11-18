import type { CommunityMeResponse, TrustLevel } from '@lb/contracts';

const DAY = 86_400_000;

export interface TrustInput {
  isGuest: boolean;
  isModerator: boolean;
  createdAt: Date;
  birthDate: Date | null;
  level: number;
  workouts: number;
  /** upheld reports against this hunter in the last 30 days */
  upheldReports: number;
  handle: string | null;
  isPublic: boolean;
  now?: Date;
}

export const isMinor = (birthDate: Date | null, now = new Date()) => {
  // unknown age is treated as a minor: the safe default for public features
  if (!birthDate) return true;
  const adult = new Date(birthDate);
  adult.setUTCFullYear(adult.getUTCFullYear() + 18);
  return adult > now;
};

/**
 * Earned access (SYSTEMS.md §5.4):
 * T1 3 days + 3 workouts · T2 14 days + level 10 + clean record · T3 60 days + level 25.
 * An upheld report drops one level for 30 days. Moderators are T3.
 */
export function trustLevel(t: TrustInput): TrustLevel {
  if (t.isModerator) return 3;
  const now = t.now ?? new Date();
  const ageDays = (now.getTime() - t.createdAt.getTime()) / DAY;
  let lvl = 0;
  if (ageDays >= 3 && t.workouts >= 3) lvl = 1;
  if (lvl >= 1 && ageDays >= 14 && t.level >= 10) lvl = 2;
  if (lvl >= 2 && ageDays >= 60 && t.level >= 25) lvl = 3;
  if (t.upheldReports > 0) lvl = Math.max(0, lvl - 1);
  return lvl as TrustLevel;
}

export function permissions(t: TrustInput): Pick<CommunityMeResponse, 'trustLevel' | 'isMinor' | 'isGuest' | 'can' | 'nextUnlock'> {
  const now = t.now ?? new Date();
  const level = trustLevel(t);
  const minor = isMinor(t.birthDate, now);
  const hasHandle = !!t.handle;
  const ageDays = (now.getTime() - t.createdAt.getTime()) / DAY;
  const none = { react: false, follow: false, comment: false, post: false, postPublic: false, appearOnBoards: false };
  if (t.isGuest) {
    return { trustLevel: level, isMinor: minor, isGuest: true, can: none, nextUnlock: 'Save your account to join the community.' };
  }
  if (!hasHandle) {
    return { trustLevel: level, isMinor: minor, isGuest: false, can: none, nextUnlock: 'Pick a hunter handle to join the community.' };
  }
  if (minor) {
    // under 18: reactions and follows only, never public posting or boards (SYSTEMS.md §5.5.3)
    return { trustLevel: level, isMinor: true, isGuest: false, can: { ...none, react: true, follow: true }, nextUnlock: null };
  }
  const can = {
    react: true,
    follow: true,
    comment: level >= 1,
    post: level >= 1,
    postPublic: level >= 2,
    appearOnBoards: ageDays >= 14 && t.isPublic,
  };
  const nextUnlock =
    level === 0 ? 'Train for 3 days and log 3 workouts to comment and post.'
    : level === 1 ? 'Reach level 10 with an account 14 days old to post publicly.'
    : level === 2 ? 'Reach level 25 with an account 60 days old to become a Veteran.'
    : null;
  return { trustLevel: level, isMinor: false, isGuest: false, can, nextUnlock };
}

/** Per-trust daily/hourly caps (SYSTEMS.md §5.5.6). */
export const limits = (level: TrustLevel) => ({
  postsPerDay: level >= 2 ? 5 : 2,
  commentsPerHour: level >= 2 ? 30 : 10,
});
