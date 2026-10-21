import { describe, expect, it } from 'vitest';
import { menuPlacement, submenuPlacement } from './context-menu';

const vp = { width: 1000, height: 700 };

describe('menuPlacement', () => {
  it('opens down-right from the cursor with the origin at the top-left corner', () => {
    expect(menuPlacement(100, 120, 220, 300, vp)).toEqual({
      left: 100,
      top: 120,
      originX: 0,
      originY: 0,
    });
  });

  it('flips left at the right edge, the origin stays under the cursor', () => {
    const p = menuPlacement(950, 120, 220, 300, vp);
    expect(p.left).toBe(730);
    expect(p.originX).toBe(220);
    expect(p.originY).toBe(0);
  });

  it('flips up at the bottom edge, the origin stays under the cursor', () => {
    const p = menuPlacement(100, 650, 220, 300, vp);
    expect(p.top).toBe(350);
    expect(p.originY).toBe(300);
    expect(p.left + p.originX).toBe(100);
  });

  it('shifts inside the window when neither side fits', () => {
    const p = menuPlacement(300, 200, 220, 680, vp);
    expect(p.top).toBe(12);
    expect(p.top + 680).toBeLessThanOrEqual(vp.height - 8);
    expect(p.originY).toBe(188);
  });

  it('keeps the edge gap when the menu is taller than the window', () => {
    expect(menuPlacement(300, 200, 220, 900, vp).top).toBe(8);
  });
});

describe('submenuPlacement', () => {
  it('opens to the right of the menu, the first item level with its parent', () => {
    expect(submenuPlacement({ left: 100, right: 320 }, 200, 180, 120, vp)).toEqual({
      left: 324,
      top: 194,
      originX: 0,
      originY: 6,
    });
  });

  it('opens to the left when the right side does not fit', () => {
    const p = submenuPlacement({ left: 700, right: 920 }, 200, 180, 120, vp);
    expect(p.left).toBe(516);
    expect(p.originX).toBe(180);
  });

  it('stays inside the window at the bottom', () => {
    const p = submenuPlacement({ left: 100, right: 320 }, 660, 180, 120, vp);
    expect(p.top).toBe(572);
    expect(p.originY).toBe(88);
  });
});
