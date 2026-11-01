import { create } from 'zustand';

export type SwitchStep = 'sync' | 'agent' | 'import';
export type StepMark = 'wait' | 'run' | 'ok' | 'fail';
export type StepMarks = Partial<Record<SwitchStep, StepMark>>;

interface KimiSwitch {
  marks: StepMarks | null;
  error: string | null;
  notice: string | null;
  withImport: boolean;
  patch: (next: Partial<Omit<KimiSwitch, 'patch'>>) => void;
}

export const useKimiSwitch = create<KimiSwitch>((set) => ({
  marks: null,
  error: null,
  notice: null,
  withImport: false,
  patch: (next) => set(next),
}));

export function isRunning(marks: StepMarks | null): boolean {
  return marks ? Object.values(marks).includes('run') : false;
}
