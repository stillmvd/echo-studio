import { describe, expect, it } from 'vitest';
import {
  cardGlow,
  clipBox,
  devLook,
  FLAT_VIEWBOX,
  isFlat,
  LIVE_COLOR,
  type LiveLook,
  SOLID_SCALE,
  sessionLook,
  sweepDelay,
  underCover,
} from './live-status';
import type { DevServer } from './types';

const box = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
});

const server = (over: Partial<DevServer>): DevServer => ({
  projectPath: 'C:/p',
  command: 'pnpm dev',
  state: 'running',
  ports: [],
  startedAt: 0,
  exitCode: null,
  log: '',
  pids: [],
  errors: null,
  restarted: false,
  ...over,
});

describe('sessionLook', () => {
  it('maps every status and phase', () => {
    expect(sessionLook({ status: 'working', phase: null })).toBe('thinking');
    expect(sessionLook({ status: 'working', phase: 'thinking' })).toBe('thinking');
    expect(sessionLook({ status: 'working', phase: 'tool' })).toBe('tool');
    expect(sessionLook({ status: 'working', phase: 'agents' })).toBe('agents');
    expect(sessionLook({ status: 'waiting', phase: null })).toBe('waiting');
    expect(sessionLook({ status: 'done', phase: 'tool' })).toBe('done');
    expect(sessionLook({ status: 'error', phase: null })).toBe('error');
    expect(sessionLook({ status: 'idle', phase: null })).toBe('idle');
    expect(sessionLook({ status: 'new', phase: null })).toBe('idle');
    expect(sessionLook({ status: 'exited', phase: null })).toBe('still');
  });
});

describe('devLook', () => {
  it('maps every dev health', () => {
    expect(devLook(undefined)).toBe('still');
    expect(devLook(server({ state: 'stopped' }))).toBe('still');
    expect(devLook(server({ state: 'starting' }))).toBe('dev_slow');
    expect(devLook(server({ state: 'running' }))).toBe('dev_run');
    expect(devLook(server({ errors: { count: 2, at: null } }))).toBe('dev_err');
    expect(devLook(server({ state: 'error' }))).toBe('dev_down');
  });
});

describe('shapes', () => {
  it('every look has a colour and exactly one size fit', () => {
    for (const look of Object.keys(LIVE_COLOR) as LiveLook[]) {
      const flat = isFlat(look);
      expect(flat ? FLAT_VIEWBOX[look] : SOLID_SCALE[look], look).toBeTruthy();
      expect(look in SOLID_SCALE, look).toBe(!flat);
    }
  });
});

describe('cardGlow', () => {
  it('one colour is one centred spot', () => {
    expect(cardGlow(['#111', '#111'])).toBe(
      'radial-gradient(60% 70% at 50% 60%, #111, transparent 75%)',
    );
  });

  it('every distinct colour gets its own spot', () => {
    const glow = cardGlow(['#111', '#222', '#111', '#333']);
    expect(glow.match(/radial-gradient/g)).toHaveLength(3);
    expect(glow).toContain('at 20% 30%, #111');
    expect(glow).toContain('at 75% 20%, #333');
  });
});

describe('sweepDelay', () => {
  it('is stable per key and stays within one sweep', () => {
    expect(sweepDelay('a1b2')).toBe(sweepDelay('a1b2'));
    for (const key of ['', 'x', 'dev:C:/p', '18fdae3e-8436-4800-9cf3-c6e51a210694']) {
      expect(Number(sweepDelay(key))).toBeGreaterThanOrEqual(0);
      expect(Number(sweepDelay(key))).toBeLessThan(5);
    }
  });
});

describe('clipBox', () => {
  it('intersects the slot with every clip', () => {
    expect(
      clipBox(box(10, 10, 30, 30), [box(0, 15, 100, 100), box(0, 0, 25, 100)], 800, 600),
    ).toEqual(box(10, 15, 25, 30));
  });

  it('cuts at the window edge', () => {
    expect(clipBox(box(-5, 590, 15, 610), [], 800, 600)).toEqual(box(0, 590, 15, 600));
  });

  it('returns null when nothing is left', () => {
    expect(clipBox(box(10, 10, 30, 30), [box(40, 0, 100, 100)], 800, 600)).toBeNull();
    expect(clipBox(box(10, 10, 30, 30), [box(0, 30, 100, 100)], 800, 600)).toBeNull();
  });
});

describe('underCover', () => {
  it('detects overlap with any cover', () => {
    expect(underCover(box(10, 10, 30, 30), [])).toBe(false);
    expect(underCover(box(10, 10, 30, 30), [box(30, 0, 50, 50)])).toBe(false);
    expect(underCover(box(10, 10, 30, 30), [box(100, 0, 200, 50), box(29, 29, 40, 40)])).toBe(true);
  });
});
