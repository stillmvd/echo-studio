// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '@/state/toast-store';
import { ConfirmDialog } from './ConfirmDialog';

let shakes = 0;

beforeEach(() => {
  shakes = 0;
  useToastStore.setState({ toasts: [] });
  window.matchMedia = (() => ({ matches: false })) as never;
  Element.prototype.animate = (() => {
    shakes++;
    return {} as Animation;
  }) as never;
});

afterEach(cleanup);

function dialog(onConfirm: () => Promise<void>) {
  render(
    <ConfirmDialog
      open
      title="Завершить сессию?"
      confirmLabel="Завершить"
      doneToast="Сессия завершена"
      failToast="Сессия не завершилась"
      onConfirm={onConfirm}
      onCancel={() => {}}
    />,
  );
  return screen.getByRole('button', { name: 'Завершить' });
}

describe('ConfirmDialog', () => {
  it('shows progress until the action ends, then a done toast', async () => {
    let finish = () => {};
    const button = dialog(() => new Promise<void>((r) => (finish = r)));
    fireEvent.click(button);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button', { name: 'Отмена' }).hasAttribute('disabled')).toBe(true);
    await act(async () => finish());
    expect(button.getAttribute('aria-busy')).toBe('false');
    expect(useToastStore.getState().toasts.map((t) => t.text)).toEqual(['Сессия завершена']);
    expect(shakes).toBe(0);
  });

  it('shakes, keeps the dialog and raises a fail toast on error', async () => {
    const button = dialog(vi.fn().mockRejectedValue('no session 1234abcd'));
    await act(async () => fireEvent.click(button));
    expect(shakes).toBe(1);
    expect(screen.getByRole('alert').textContent).toBe('no session 1234abcd');
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(useToastStore.getState().toasts).toMatchObject([
      { text: 'Сессия не завершилась: no session 1234abcd', tone: 'fail' },
    ]);
  });
});
