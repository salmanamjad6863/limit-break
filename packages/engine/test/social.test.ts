import { describe, expect, it } from 'vitest';
import {
  duelScore, duelWinner, earnsRaidLoot, expectedWeeklyXp, leaguePlaces, nextLeagueTier, pairKey, raidBossHp, raidCleared, raidContribution, DUEL, LEAGUE, RAID,
} from '../src/social';

describe('expectedWeeklyXp / raid', () => {
  it('floors new members at 800', () => {
    expect(expectedWeeklyXp([])).toBe(RAID.minExpectedWeeklyXp);
    expect(expectedWeeklyXp([100, 200])).toBe(RAID.minExpectedWeeklyXp);
  });
  it('uses the mean of up to 4 weeks', () => {
    expect(expectedWeeklyXp([1000, 1200, 800, 1000])).toBe(1000);
  });
  it('sets boss HP at 0.8 × Σ E_i and clears at full damage', () => {
    const hp = raidBossHp([1000, 1000, 1000]);
    expect(hp).toBe(2400);
    expect(raidCleared(2399, hp)).toBe(false);
    expect(raidCleared(2400, hp)).toBe(true);
  });
  it('gives loot at ≥ 25% contribution', () => {
    expect(raidContribution(250, 1000)).toBe(0.25);
    expect(earnsRaidLoot(0.25)).toBe(true);
    expect(earnsRaidLoot(0.24)).toBe(false);
  });
  it('clears a guild hitting exactly 80% of expected XP (SYSTEMS §8 fixture)', () => {
    const members = [1000, 1000, 1000, 1000, 1000];
    const hp = raidBossHp(members);
    const damage = Math.round(0.8 * members.reduce((s, e) => s + e, 0));
    expect(damage).toBe(hp);
    expect(raidCleared(damage, hp)).toBe(true);
  });
});

describe('duels', () => {
  it('scores effort vs own baseline so a beginner can win', () => {
    expect(duelScore(400, 200)).toBe(2);
    expect(duelScore(900, 1000)).toBe(0.9);
    expect(duelWinner({ weekXp: 400, baseline: 200 }, { weekXp: 900, baseline: 1000 })).toBe('challenger');
  });
  it('floors baseline', () => {
    expect(duelScore(100, 0)).toBe(100 / DUEL.minBaselineWeeklyXp);
  });
});

describe('leagues', () => {
  it('assigns competition places and promotes / demotes', () => {
    const places = leaguePlaces([
      { userId: 'a', xp: 100 },
      { userId: 'b', xp: 90 },
      { userId: 'c', xp: 90 },
      { userId: 'd', xp: 10 },
    ]);
    expect(places.map((p) => p.place)).toEqual([1, 2, 2, 4]);
    expect(nextLeagueTier('Bronze', 1)).toBe('Silver');
    expect(nextLeagueTier('Mythic', 1)).toBe('Mythic');
    expect(nextLeagueTier('Silver', 30)).toBe('Bronze');
    expect(nextLeagueTier('Bronze', 30)).toBe('Bronze');
    expect(LEAGUE.size).toBe(30);
  });
});

describe('pairKey', () => {
  it('orders ids so friendships are unique', () => {
    expect(pairKey('b', 'a')).toEqual(['a', 'b']);
    expect(pairKey('a', 'b')).toEqual(['a', 'b']);
  });
});
