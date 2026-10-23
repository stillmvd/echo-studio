import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  tone: 'done' | 'fail';
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, tone: Toast['tone']) => void;
  dismiss: (id: number) => void;
}

const LIMIT = 3;
let seq = 0;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (text, tone) =>
    set((s) => ({ toasts: [...s.toasts, { id: ++seq, text, tone }].slice(-LIMIT) })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (text: string, tone: Toast['tone'] = 'done') =>
  useToastStore.getState().push(text, tone);
