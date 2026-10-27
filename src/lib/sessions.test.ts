import { describe, expect, it } from 'vitest';
import { dayLabel, formatDuration, splitTitle } from './sessions';

describe('formatDuration', () => {
  it('formats ranges', () => {
    expect(formatDuration(0)).toBe('<1с');
    expect(formatDuration(10_448)).toBe('10с');
    expect(formatDuration(347_379)).toBe('5м 47с');
    expect(formatDuration(3_991_602)).toBe('1ч 6м');
  });
});

describe('dayLabel', () => {
  const now = new Date(2026, 8, 25, 12, 0);

  it('marks today and yesterday', () => {
    expect(dayLabel(new Date(2026, 8, 25, 8, 21).toISOString(), now)).toMatchObject({
      lead: 'Сегодня',
      date: '25 сент',
    });
    expect(dayLabel(new Date(2026, 8, 24, 23, 59).toISOString(), now).lead).toBe('Вчера');
  });

  it('adds the year for other years and handles missing dates', () => {
    expect(dayLabel(new Date(2025, 11, 31, 10, 0).toISOString(), now)).toMatchObject({
      lead: null,
      date: '31 дек 2025',
    });
    expect(dayLabel(null, now)).toEqual({ key: 'none', lead: null, date: 'Без даты' });
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
