// The project's karma entry does not load zone.js/testing itself (see the
// design-model specs); load it here so Angular's global beforeEach works.
import 'zone.js/testing';

import { layout } from '../design-model';
import {
  mixedExampleB,
  singleFixed,
} from '../design-model/testing/fixtures';
import {
  computeView,
  hitTest,
  mmFromPx,
  pxFromMm,
  VIEW_MARGINS,
} from './canvas-view';

describe('design-canvas canvas-view', () => {
  it('computeView fits the frame inside the margins at zoom 1', () => {
    const v = computeView(900, 700, 1500, 1200, 1, 0, 0);
    // Frame fully inside the stage minus margins.
    expect(v.originX).toBeGreaterThanOrEqual(VIEW_MARGINS.left - 0.01);
    expect(v.originY).toBeGreaterThanOrEqual(VIEW_MARGINS.top - 0.01);
    expect(v.originX + 1500 * v.pxPerMm).toBeLessThanOrEqual(
      900 - VIEW_MARGINS.right + 0.01
    );
    expect(v.originY + 1200 * v.pxPerMm).toBeLessThanOrEqual(
      700 - VIEW_MARGINS.bottom + 0.01
    );
  });

  it('mmFromPx is the inverse of pxFromMm', () => {
    const v = computeView(900, 700, 2400, 1380, 1.7, 33, -12);
    const p = pxFromMm(v, 123.4, 567.8);
    const back = mmFromPx(v, p.x, p.y);
    expect(back.xMm).toBeCloseTo(123.4, 6);
    expect(back.yMm).toBeCloseTo(567.8, 6);
  });

  it('hitTest resolves panes, dividers, frame and misses', () => {
    const d = mixedExampleB(); // 2400×1380, mullion @900, right transom @600
    const lay = layout(d);
    // Left pane centre (daylight starts at 60; left pane is 870 wide).
    expect(hitTest(d, lay, { xMm: 400, yMm: 700 }, 5)).toEqual({
      kind: 'pane',
      paneId: 'p2',
    });
    // Mullion centreline: 60 + 900 = 960 absolute.
    const hit = hitTest(d, lay, { xMm: 960, yMm: 700 }, 5);
    expect(hit.kind).toBe('divider');
    // Frame border (inside outer rect, outside daylight).
    expect(hitTest(d, lay, { xMm: 30, yMm: 700 }, 1).kind).toBe('frame');
    // Outside everything.
    expect(hitTest(d, lay, { xMm: -200, yMm: -200 }, 1).kind).toBe('none');
    // Corner resize handle.
    expect(hitTest(d, lay, { xMm: 2400, yMm: 1380 }, 10).kind).toBe(
      'frame-handle'
    );
  });

  it('hitTest leaves no dead zone anywhere inside the daylight', () => {
    const d = singleFixed();
    const lay = layout(d);
    for (let x = 65; x < 1435; x += 137) {
      for (let y = 65; y < 1135; y += 107) {
        const hit = hitTest(d, lay, { xMm: x, yMm: y }, 2, {
          frameHandle: false,
        });
        expect(hit.kind === 'pane' || hit.kind === 'divider').toBeTrue();
      }
    }
  });
});
