import { describe, expect, it } from 'vitest';
import { dayLabel, formatDuration, splitTitle } from './sessions';

describe('formatDuration', () => {
  it('formats ranges', () => {
    expect(formatDuration(0)).toBe('<1s');
    expect(formatDuration(10_448)).toBe('10s');
    expect(formatDuration(347_379)).toBe('5m 47s');
    expect(formatDuration(3_991_602)).toBe('1h 6m');
  });
});

describe('dayLabel', () => {
  const now = new Date(2026, 8, 25, 12, 0);

  it('marks today and yesterday', () => {
    expect(dayLabel(new Date(2026, 8, 25, 8, 21).toISOString(), now)).toMatchObject({
      lead: 'Today',
      date: '25 Sep',
    });
    expect(dayLabel(new Date(2026, 8, 24, 23, 59).toISOString(), now).lead).toBe('Yesterday');
  });

  it('adds the year for other years and handles missing dates', () => {
    expect(dayLabel(new Date(2025, 11, 31, 10, 0).toISOString(), now)).toMatchObject({
      lead: null,
      date: '31 Dec 2025',
    });
    expect(dayLabel(null, now)).toEqual({ key: 'none', lead: null, date: 'No activity' });
  });

  it('groups by local day', () => {
    const a = dayLabel(new Date(2026, 8, 23, 0, 5).toISOString(), now);
    const b = dayLabel(new Date(2026, 8, 23, 23, 55).toISOString(), now);
    expect(a.key).toBe(b.key);
  });
});

describe('splitTitle', () => {
  it('bolds the last word', () => {
    expect(splitTitle('Status Command Buttons')).toEqual(['Status Command ', 'Buttons']);
    expect(splitTitle('Waypoint')).toEqual(['', 'Waypoint']);
  });
});
