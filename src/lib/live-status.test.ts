import { describe, expect, it } from 'vitest';
import { devLook, sessionLook } from './live-status';
import type { DevServer } from './types';

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
