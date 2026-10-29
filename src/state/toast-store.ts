import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  tone: 'done' | 'fail';
  out?: boolean;
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, tone: Toast['tone']) => void;
  dismiss: (id: number) => void;
  remove: (id: number) => void;
}

const LIMIT = 3;
let seq = 0;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (text, tone) =>
    set((s) => {
      const live = s.toasts.filter((t) => !t.out);
      const drop = new Set(live.slice(0, Math.max(0, live.length + 1 - LIMIT)).map((t) => t.id));
      return {
        toasts: [
          ...s.toasts.map((t) => (drop.has(t.id) ? { ...t, out: true } : t)),
          { id: ++seq, text, tone },
        ],
      };
    }),
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, out: true } : t)) })),
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (text: string, tone: Toast['tone'] = 'done') =>
  useToastStore.getState().push(text, tone);
