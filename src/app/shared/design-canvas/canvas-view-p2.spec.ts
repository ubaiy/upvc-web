// View math added for Phase 2-3 (card T40): the mirrored inside view,
// the four corner handles, the anchored resize view and sliding-panel hits.
import 'zone.js/testing';

import { LeafNode, layout } from '../design-model';
import {
  singleFixed,
  slidingThreeTrackMesh,
} from '../design-model/testing/fixtures';
import {
  anchoredView,
  computeView,
  hitTest,
  mmFromPx,
  pxFromMm,
  rectPxFromMm,
  slidePanelAt,
} from './canvas-view';

describe('design-canvas canvas-view — Phase 2-3', () => {
  it('the mirrored view flips x about the frame and round-trips mm ↔ px', () => {
    const normal = computeView(900, 700, 1500, 1200, 1, 0, 0);
    const mirrored = computeView(900, 700, 1500, 1200, 1, 0, 0, true);
    expect(mirrored.mirrorWMm).toBe(1500);
    // Model x = 0 lands where x = 1500 lands in the normal view.
    expect(pxFromMm(mirrored, 0, 300).x).toBeCloseTo(pxFromMm(normal, 1500, 300).x, 6);
    expect(pxFromMm(mirrored, 0, 300).y).toBeCloseTo(pxFromMm(normal, 0, 300).y, 6);
    const p = pxFromMm(mirrored, 412, 733);
    const back = mmFromPx(mirrored, p.x, p.y);
    expect(back.xMm).toBeCloseTo(412, 6);
    expect(back.yMm).toBeCloseTo(733, 6);
  });

  it('rectPxFromMm keeps width / height and mirrors the left edge', () => {
    const mirrored = computeView(900, 700, 1500, 1200, 1.5, 10, -5, true);
    const r = rectPxFromMm(mirrored, { xMm: 100, yMm: 50, wMm: 400, hMm: 300 });
    // Screen-left edge of the rect is its MODEL-right edge.
    expect(r.x).toBeCloseTo(pxFromMm(mirrored, 500, 50).x, 6);
    expect(r.y).toBeCloseTo(pxFromMm(mirrored, 500, 50).y, 6);
    expect(r.w).toBeCloseTo(400 * mirrored.pxPerMm, 6);
    expect(r.h).toBeCloseTo(300 * mirrored.pxPerMm, 6);
  });

  it('hitTest finds each of the four corner handles', () => {
    const d = singleFixed();
    const lay = layout(d);
    const corner = (x: number, y: number): unknown => hitTest(d, lay, { xMm: x, yMm: y }, 10);
    expect(corner(2, 3)).toEqual({ kind: 'frame-handle', corner: 'nw' });
    expect(corner(1498, 0)).toEqual({ kind: 'frame-handle', corner: 'ne' });
    expect(corner(0, 1201)).toEqual({ kind: 'frame-handle', corner: 'sw' });
    expect(corner(1500, 1200)).toEqual({ kind: 'frame-handle', corner: 'se' });
    // Handles can be switched off (read-only).
    expect(hitTest(d, lay, { xMm: 0, yMm: 0 }, 10, { frameHandle: false }).kind).toBe('frame');
  });

  it('anchoredView pins the corner opposite the dragged one', () => {
    const v0 = computeView(900, 700, 1500, 1200, 1, 0, 0);
    // Drag the top-left corner: the bottom-right corner must not move.
    const nw = anchoredView(v0, 'nw', 1500, 1200, 1300, 1000);
    expect(pxFromMm(nw, 1300, 1000).x).toBeCloseTo(pxFromMm(v0, 1500, 1200).x, 6);
    expect(pxFromMm(nw, 1300, 1000).y).toBeCloseTo(pxFromMm(v0, 1500, 1200).y, 6);
    expect(nw.pxPerMm).toBe(v0.pxPerMm);
    // Drag the bottom-right corner: the top-left corner must not move.
    const se = anchoredView(v0, 'se', 1500, 1200, 1800, 1400);
    expect(pxFromMm(se, 0, 0)).toEqual(pxFromMm(v0, 0, 0));

    // Mirrored: model-east is on the screen-left; dragging it pins model-west.
    const m0 = computeView(900, 700, 1500, 1200, 1, 0, 0, true);
    const ne = anchoredView(m0, 'ne', 1500, 1200, 1700, 1100);
    expect(ne.mirrorWMm).toBe(1700);
    expect(pxFromMm(ne, 0, 1100).x).toBeCloseTo(pxFromMm(m0, 0, 1200).x, 6);
    expect(pxFromMm(ne, 0, 1100).y).toBeCloseTo(pxFromMm(m0, 0, 1200).y, 6);
  });

  it('slidePanelAt resolves the panel under a point; null for other leaves', () => {
    const d = slidingThreeTrackMesh();
    const lay = layout(d);
    const { leaf, rect } = lay.leaves[0];
    // Three 760 mm panels tile the 2280 mm daylight from x = 60.
    expect(slidePanelAt(leaf, rect, { xMm: 60 + 10, yMm: 600 })).toBe(0);
    expect(slidePanelAt(leaf, rect, { xMm: 60 + 760 + 380, yMm: 600 })).toBe(1);
    expect(slidePanelAt(leaf, rect, { xMm: 60 + 2270, yMm: 600 })).toBe(2);

    const fixed = singleFixed();
    const fl = layout(fixed).leaves[0];
    expect(slidePanelAt(fl.leaf as LeafNode, fl.rect, { xMm: 500, yMm: 500 })).toBeNull();
  });
});
