import { describe, expect, it } from 'vitest';
import { defaultWeekdays, reminderSlots, scheduleToday, validateWeekdays, weekCells } from '../src';

// 2026-11-16 is a Monday
const MON = '2026-11-16', TUE = '2026-11-17', WED = '2026-11-18', THU = '2026-11-19', SAT = '2026-11-21';

describe('validateWeekdays', () => {
  it('accepts a classic Mon/Wed/Fri full-body week', () => {
    expect(validateWeekdays([1, 3, 5], [3], false)).toEqual([]);
  });
  it('flags unsupported counts, long streaks and no rest', () => {
    expect(validateWeekdays([1, 2, 3, 4], [3], false)).toEqual(['countNotSupported', 'tooManyInARow']);
    expect(validateWeekdays([1, 2, 3], [3], false)).toEqual(['tooManyInARow']); // 3 full-body days in a row
    expect(validateWeekdays([1, 2, 3], [3], true)).toEqual([]); // a split can do 3 in a row
    expect(validateWeekdays([0, 1, 2, 3, 4, 5, 6], [6], true)).toContain('noRestDay');
    expect(validateWeekdays([6, 0, 1], [3], false)).toEqual(['tooManyInARow']); // wraps Sun → Mon
  });
});

describe('scheduleToday', () => {
  const wd = defaultWeekdays(3); // Mon, Wed, Fri
  it('a scheduled day is a training day', () => {
    expect(scheduleToday(wd, WED, [{ date: MON, kind: 'program' }])).toMatchObject({ scheduled: true, missedThisWeek: 0, canTrainInstead: false });
  });
  it('a missed Monday can be made up on Tuesday (rest day), not after a hard day yesterday', () => {
    expect(scheduleToday(wd, TUE, [])).toMatchObject({ scheduled: false, missedThisWeek: 1, canTrainInstead: true });
    expect(scheduleToday(wd, THU, [{ date: WED, kind: 'program' }])).toMatchObject({ missedThisWeek: 1, canTrainInstead: false }); // 48 h rule
  });
  it('never more than 2 make-ups in a week', () => {
    const done = [{ date: TUE, kind: 'program' as const }, { date: THU, kind: 'program' as const }];
    expect(scheduleToday([1, 3, 5, 6], SAT, done)).toMatchObject({ makeupsThisWeek: 2, canTrainInstead: false });
  });
  it('quick sessions and manual logs do not count as program workouts', () => {
    expect(scheduleToday(wd, TUE, [{ date: MON, kind: 'quick' }, { date: MON, kind: 'manual' }]).missedThisWeek).toBe(1);
  });
});

describe('weekCells', () => {
  it('shows done/missed in the past and continues the rotation (missed days never skip a workout)', () => {
    const cells = weekCells([1, 3, 5], WED, [{ date: MON, kind: 'program', name: 'Full Body A' }], ['Full Body A', 'Full Body B', 'Full Body C'], 1);
    expect(cells[0]).toMatchObject({ date: MON, doneName: 'Full Body A', missed: false });
    expect(cells[2]).toMatchObject({ date: WED, isToday: true, plannedName: 'Full Body B' });
    expect(cells[4]).toMatchObject({ plannedName: 'Full Body C' });
    expect(cells[1]).toMatchObject({ scheduled: false, missed: false });
    const missed = weekCells([1, 3, 5], WED, [], ['A', 'B', 'C'], 0);
    expect(missed[0]!.missed).toBe(true);
    expect(missed[2]!.plannedName).toBe('A'); // the missed workout runs next
  });
});

describe('reminderSlots', () => {
  it('fires 30 minutes before the workout, rolling back a day past midnight', () => {
    expect(reminderSlots([1, 3], '18:00')).toEqual([{ weekday: 1, hour: 17, minute: 30 }, { weekday: 3, hour: 17, minute: 30 }]);
    expect(reminderSlots([1], '00:15')).toEqual([{ weekday: 0, hour: 23, minute: 45 }]);
  });
});
