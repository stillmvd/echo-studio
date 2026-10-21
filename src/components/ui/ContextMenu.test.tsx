// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu, type MenuItem } from './ContextMenu';

interface FakeAnimation {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  finish: () => void;
  cancel: () => void;
  finished: Promise<void>;
}

let animations: FakeAnimation[] = [];
let reduce = false;

beforeEach(() => {
  animations = [];
  reduce = false;
  window.matchMedia = ((q: string) => ({ matches: reduce && q.includes('reduce') })) as never;
  Element.prototype.animate = ((keyframes, options) => {
    let finish = () => {};
    let cancel = () => {};
    const finished = new Promise<void>((resolve, reject) => {
      finish = resolve;
      cancel = () => reject(new Error('cancel'));
    });
    finished.catch(() => {});
    const a = { keyframes, options, finish, cancel, finished } as FakeAnimation;
    animations.push(a);
    return a as unknown as Animation;
  }) as Element['animate'];
  Element.prototype.getAnimations = () => [];
});

afterEach(cleanup);

function setup(items: MenuItem[], onClose = vi.fn()) {
  const source = document.createElement('button');
  document.body.append(source);
  source.focus();
  render(<ContextMenu x={40} y={50} items={items} onClose={onClose} />);
  return { source, onClose };
}

const keydown = (key: string) =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key });

describe('ContextMenu', () => {
  it('animates in from the click point and focuses the first item', () => {
    setup([{ label: 'Open', onSelect: () => {} }]);
    const menu = screen.getByRole('menu');
    expect(menu.style.left).toBe('40px');
    expect(menu.style.transformOrigin).toBe('0px 0px');
    expect(animations[0]?.options.duration).toBe(200);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Open' }));
  });

  it('walks enabled items with arrows, Home and End', () => {
    setup([
      { label: 'A', onSelect: () => {} },
      { label: 'B', disabled: true, onSelect: () => {} },
      'separator',
      { label: 'C', onSelect: () => {} },
    ]);
    keydown('ArrowDown');
    expect(document.activeElement?.textContent).toBe('C');
    keydown('ArrowDown');
    expect(document.activeElement?.textContent).toBe('A');
    keydown('End');
    expect(document.activeElement?.textContent).toBe('C');
    keydown('Home');
    expect(document.activeElement?.textContent).toBe('A');
  });

  it('closes after the exit animation, not at once, and returns focus', async () => {
    const onSelect = vi.fn();
    const { source, onClose } = setup([{ label: 'Copy', onSelect }]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy' }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(source);
    const exit = animations.at(-1);
    expect(exit?.options).toMatchObject({ duration: 150, fill: 'forwards' });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => exit?.finish());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on Escape, Tab, a click outside, blur and resize', async () => {
    for (const trigger of [
      () => keydown('Escape'),
      () => keydown('Tab'),
      () => fireEvent.pointerDown(document.body),
      () => fireEvent.blur(window),
      () => fireEvent(window, new Event('resize')),
    ]) {
      const { onClose } = setup([{ label: 'X', onSelect: () => {} }]);
      trigger();
      await act(async () => animations.at(-1)?.finish());
      expect(onClose).toHaveBeenCalledOnce();
      cleanup();
    }
  });

  it('a click inside does not close', () => {
    const { onClose } = setup([{ label: 'X', onSelect: () => {} }]);
    fireEvent.pointerDown(screen.getByRole('menu'));
    expect(animations).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes at once without animation when motion is reduced', () => {
    reduce = true;
    const { onClose } = setup([{ label: 'X', onSelect: () => {} }]);
    expect(animations).toHaveLength(0);
    keydown('Escape');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('opens a submenu with ArrowRight, leaves it with ArrowLeft, disabled items do nothing', () => {
    const move = vi.fn();
    setup([
      {
        label: 'Move to cell…',
        items: [
          { label: 'Cell 1', disabled: true, onSelect: move },
          { label: 'Cell 2', onSelect: move },
        ],
      },
    ]);
    const parent = screen.getByRole('menuitem', { name: 'Move to cell…' });
    keydown('ArrowRight');
    expect(parent.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('menu')).toHaveLength(2);
    expect(document.activeElement?.textContent).toBe('Cell 2');
    keydown('ArrowLeft');
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(document.activeElement).toBe(parent);
    keydown('Enter');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cell 1' }));
    expect(move).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cell 2' }));
    expect(move).toHaveBeenCalledOnce();
  });

  it('shows the key hint on the right', () => {
    setup([{ label: 'Copy id', hint: 'Ctrl C', onSelect: () => {} }]);
    expect(screen.getByRole('menuitem').textContent).toBe('Copy idCtrl C');
  });
});
