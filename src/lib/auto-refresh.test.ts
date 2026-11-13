import { describe, expect, it } from 'vitest';
import {
  HOT_COOLDOWN_MS,
  HOT_LOAD,
  isHot,
  QUIET_HOT_MS,
  QUIET_STALE_MS,
  type RefreshInput,
  refreshReason,
  STALE_MS,
} from './auto-refresh';

const calm: RefreshInput = {
  hot: false,
  sinceHotReload: Number.POSITIVE_INFINITY,
  uptime: 1000,
  quietFor: 0,
  active: true,
  busy: false,
};

describe('isHot', () => {
  it('needs five loads in a row above the threshold', () => {
    const high = HOT_LOAD + 1;
    expect(isHot([high, high, high, high])).toBe(false);
    expect(isHot([high, high, high, high, high])).toBe(true);
    expect(isHot([high, high, HOT_LOAD, high, high])).toBe(false);
  });
});

describe('refreshReason', () => {
  it('stays put while the user works', () => {
    expect(refreshReason({ ...calm, hot: true, quietFor: QUIET_HOT_MS - 1 })).toBeNull();
    expect(refreshReason({ ...calm, uptime: STALE_MS, quietFor: QUIET_STALE_MS - 1 })).toBeNull();
  });

  it('reloads a hot page after a short pause or when hidden', () => {
    expect(refreshReason({ ...calm, hot: true, quietFor: QUIET_HOT_MS })).toBe('hot');
    expect(refreshReason({ ...calm, hot: true, active: false })).toBe('hot');
  });

  it('reloads a day-old page only after a long pause or when hidden', () => {
    expect(refreshReason({ ...calm, uptime: STALE_MS, quietFor: QUIET_STALE_MS })).toBe('stale');
    expect(refreshReason({ ...calm, uptime: STALE_MS, active: false })).toBe('stale');
    expect(refreshReason({ ...calm, uptime: STALE_MS - 1, active: false })).toBeNull();
  });

  it('does not loop when the load stays after a reload', () => {
    const again = { ...calm, hot: true, active: false, sinceHotReload: HOT_COOLDOWN_MS - 1 };
    expect(refreshReason(again)).toBeNull();
    expect(refreshReason({ ...again, sinceHotReload: HOT_COOLDOWN_MS })).toBe('hot');
  });

  it('never reloads over unsaved edits or an open dialog', () => {
    expect(refreshReason({ ...calm, hot: true, active: false, busy: true })).toBeNull();
    expect(refreshReason({ ...calm, uptime: STALE_MS, active: false, busy: true })).toBeNull();
  });
});
