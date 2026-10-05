// Shaped sashes (card T131): how a pane in a round or arched frame can open
// (the rule), the sash outline offset from the pane's real outline, and
// where its hinges, pivots and handle go.
import {
  LeafNode,
  OpeningKind,
  PaneNode,
  PaneOutline,
  PointMm,
  SplitNode,
  WindowDesign,
  defaultOpeningKind,
  effectiveOpeningKind,
  isFullRound,
  nearestOnPolygon,
  openingChoices,
  openingSpecFor,
  paneOutlines,
  shapedSash,
  shapedSashHardware,
  slidingAllowed,
  storedOpeningKind,
  toPayload,
} from './index';
import { singleFixed } from './testing/fixtures';

const FACE = 60;
const GAP = 4;
const SASH = 48;

const leaf = (id: string, extra: Partial<LeafNode> = {}): LeafNode => ({
  id,
  kind: 'leaf',
  category: 'Casement',
  casementType: 'Fixed',
  productId: null,
  sashId: null,
  ...extra,
});
const split = (id: string, axis: 'x' | 'y', positionsMm: number[], children: PaneNode[]): SplitNode => ({
  id,
  kind: 'split',
  axis,
  dividerKind: 'mullion',
  dividerProfileId: null,
  dividerFaceMm: 60,
  positionsMm,
  lockedMm: positionsMm.map(() => false),
  children,
});
function framed(shape: WindowDesign['frame']['shape'], w: number, h: number, root: PaneNode): WindowDesign {
  const base = singleFixed();
  return { ...base, frame: { ...base.frame, shape, widthMm: w, heightMm: h }, root };
}
const outline = (d: WindowDesign, id: string): PaneOutline =>
  paneOutlines(d, { frameFaceMm: FACE, arcSegments: 128 }).get(id) as PaneOutline;
const allowed = (o: PaneOutline): OpeningKind[] =>
  openingChoices(o)
    .filter((c) => c.allowed)
    .map((c) => c.kind);

const round = (): WindowDesign => framed({ kind: 'circle' }, 1200, 1200, leaf('p1'));
const twoHalves = (): WindowDesign =>
  framed({ kind: 'circle' }, 1500, 1500, split('p1', 'x', [690], [leaf('p2'), leaf('p3')]));
const quarters = (): WindowDesign =>
  framed(
    { kind: 'circle' },
    1500,
    1500,
    split('p1', 'x', [690], [
      split('p2', 'y', [690], [leaf('p3'), leaf('p4')]),
      split('p5', 'y', [690], [leaf('p6'), leaf('p7')]),
    ])
  );
const archTop = (): WindowDesign => framed({ kind: 'arch-top', riseMm: 450 }, 900, 1500, leaf('p1'));
/** A half-round light over a transom above the spring line, a pair of panes below. */
const halfRoundOver = (): WindowDesign =>
  framed(
    { kind: 'arch-top', riseMm: 600 },
    1200,
    1800,
    split('p1', 'y', [540], [leaf('p2'), split('p3', 'x', [540], [leaf('p4'), leaf('p5')])])
  );

function inside(poly: PointMm[], p: PointMm, slackMm = 0.5): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.yMm > p.yMm !== b.yMm > p.yMm && p.xMm < ((b.xMm - a.xMm) * (p.yMm - a.yMm)) / (b.yMm - a.yMm) + a.xMm) {
      hit = !hit;
    }
  }
  return hit || nearestOnPolygon(poly, p).distMm <= slackMm;
}

describe('design-model — how a shaped pane opens (T131)', () => {
  it('a full round: centre pivot (the default) on either axis, or tilt on its lowest point; no hinged side', () => {
    const o = outline(round(), 'p1');
    expect(o.cut).toBeTrue();
    expect(isFullRound(o)).toBeTrue();
    expect(o.sides).toEqual({ left: null, right: null, top: null, bottom: null });
    expect(allowed(o)).toEqual(['Bottom', 'Pivot Horizontal', 'Pivot Vertical']);
    expect(defaultOpeningKind(o)).toBe('Pivot Horizontal');
    const left = openingChoices(o).find((c) => c.kind === 'Left');
    expect(left?.hint).toContain('straight upright side');
  });

  it('a half round on a mullion: side-hung on the mullion (the default), or pivoted across it', () => {
    const d = twoHalves();
    const leftPane = outline(d, 'p2');
    const rightPane = outline(d, 'p3');
    expect(isFullRound(leftPane)).toBeFalse();
    expect(leftPane.sides.right?.lengthMm).toBeGreaterThan(1300);
    expect(leftPane.sides.left).toBeNull();
    expect(allowed(leftPane)).toEqual(['Right', 'Pivot Horizontal']);
    expect(defaultOpeningKind(leftPane)).toBe('Right');
    expect(allowed(rightPane)).toEqual(['Left', 'Pivot Horizontal']);
    expect(defaultOpeningKind(rightPane)).toBe('Left');
  });

  it('a half round on its chord: bottom-hung on the transom (the default), or pivoted upright', () => {
    const o = outline(halfRoundOver(), 'p2');
    expect(o.sides.bottom?.lengthMm).toBeGreaterThan(1000);
    expect(o.sides.left).toBeNull();
    expect(o.sides.right).toBeNull();
    expect(allowed(o)).toEqual(['Bottom', 'Pivot Vertical']);
    expect(defaultOpeningKind(o)).toBe('Bottom');
    // The panes under the spring line are plain rectangles: the six ordinary ways.
    const below = outline(halfRoundOver(), 'p4');
    expect(below.cut).toBeFalse();
    expect(allowed(below)).toEqual(['Left', 'Right', 'Top', 'Bottom', 'Tilt & Turn Left', 'Tilt & Turn Right']);
  });

  it('an arch-top pane: side-hung on either jamb, bottom-hung, tilt and turn; never top-hung', () => {
    const o = outline(archTop(), 'p1');
    expect(o.sides.top).toBeNull();
    expect(o.sides.left?.lengthMm).toBeCloseTo(1500 - FACE - 450, 0);
    expect(allowed(o)).toEqual([
      'Left',
      'Right',
      'Bottom',
      'Tilt & Turn Left',
      'Tilt & Turn Right',
      'Pivot Vertical',
    ]);
    expect(defaultOpeningKind(o)).toBe('Left');
    expect(openingChoices(o).find((c) => c.kind === 'Top')?.hint).toContain('straight top rail');
  });

  it('a quarter pane: hung on the mullion or the transom it meets, no pivot', () => {
    const o = outline(quarters(), 'p3'); // top left
    expect(o.sides.right?.lengthMm).toBeGreaterThan(600);
    expect(o.sides.bottom?.lengthMm).toBeGreaterThan(600);
    expect(allowed(o)).toEqual(['Right', 'Bottom', 'Tilt & Turn Right']);
    expect(defaultOpeningKind(o)).toBe('Right');
    expect(defaultOpeningKind(outline(quarters(), 'p7'))).toBe('Left'); // bottom right
  });

  it('sliding is never offered in a pane the shape cuts', () => {
    expect(slidingAllowed(outline(round(), 'p1'))).toBeFalse();
    expect(slidingAllowed(outline(halfRoundOver(), 'p4'))).toBeTrue();
  });

  it('a saved way of opening the outline cannot carry is drawn as the default; the document is not rewritten', () => {
    const saved = leaf('p1', {
      casementType: 'Openable',
      opening: { direction: 'Left', handleId: 7, hingesType: null },
    });
    const o = outline(round(), 'p1');
    expect(storedOpeningKind(saved)).toBe('Left');
    expect(effectiveOpeningKind(saved, o)).toBe('Pivot Horizontal');
    expect(saved.opening?.direction).toBe('Left');
    const half = outline(twoHalves(), 'p3');
    expect(effectiveOpeningKind(saved, half)).toBe('Left');
  });

  it('a pivot is saved beside the direction, so the api receives what it did before', () => {
    const hinged = leaf('p1', {
      casementType: 'Openable',
      opening: { direction: 'Left', handleId: null, hingesType: null },
    });
    const spec = openingSpecFor('Pivot Horizontal', hinged);
    expect(spec).toEqual({ direction: 'Left', pivot: 'horizontal' });
    const pivoted: LeafNode = { ...hinged, opening: { ...hinged.opening!, ...spec } };
    expect(storedOpeningKind(pivoted)).toBe('Pivot Horizontal');
    const before = toPayload({ ...round(), root: hinged }, { frameFaceMm: FACE });
    const after = toPayload({ ...round(), root: pivoted }, { frameFaceMm: FACE });
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    expect(openingSpecFor('Bottom', pivoted)).toEqual({ direction: 'Bottom' });
  });
});

describe('design-model — the shaped sash outline and its hardware (T131)', () => {
  const radius = (p: PointMm, c: number): number => Math.hypot(p.xMm - c, p.yMm - c);

  it('a full round sash: two circles inside the frame line, no straight member, no joint', () => {
    const s = shapedSash(outline(round(), 'p1'), GAP, SASH);
    const inner = 600 - FACE;
    for (const p of s.outerMm) expect(radius(p, 600)).toBeCloseTo(inner - GAP, 0);
    for (const p of s.innerMm) expect(radius(p, 600)).toBeCloseTo(inner - GAP - SASH, 0);
    expect(s.straight).toEqual({ left: null, right: null, top: null, bottom: null });
    expect(s.joints.length).toBe(0);
  });

  it('a half-round sash: a straight stile on the mullion, bent to the curve, joined at both ends', () => {
    const o = outline(twoHalves(), 'p3');
    const s = shapedSash(o, GAP, SASH);
    const stileX = o.box.xMm + GAP;
    expect(s.straight.left).not.toBeNull();
    expect(s.straight.right).toBeNull();
    // Nothing of the sash is outside the frame's inner line, and it never crosses the mullion.
    for (const p of s.outerMm) {
      expect(radius(p, 750)).toBeLessThanOrEqual(750 - FACE - GAP + 0.5);
      expect(p.xMm).toBeGreaterThanOrEqual(stileX - 1e-6);
    }
    expect(s.joints.length).toBe(2);
    for (const j of s.joints) {
      expect(j.outer.xMm).toBeCloseTo(stileX, 3);
      expect(nearestOnPolygon(s.innerMm, j.inner).distMm).toBeLessThan(1e-6);
      // A mitre: about the face width across, longer on the slant.
      const len = Math.hypot(j.outer.xMm - j.inner.xMm, j.outer.yMm - j.inner.yMm);
      expect(len).toBeGreaterThanOrEqual(SASH - 0.5);
      expect(len).toBeLessThan(SASH * 2.5);
    }
  });

  it('an arch-top sash: jambs joined to the bent head at the spring line, mitres at the sill', () => {
    const s = shapedSash(outline(archTop(), 'p1'), GAP, SASH);
    expect(s.joints.length).toBe(4);
    const ys = s.joints.map((j) => Math.round(j.outer.yMm)).sort((a, b) => a - b);
    expect(ys[0]).toBeGreaterThan(440);
    expect(ys[1]).toBeLessThan(520);
    expect(ys[2]).toBe(1500 - FACE - GAP);
    expect(ys[3]).toBe(1500 - FACE - GAP);
  });

  it('a pane too small for the profile has no sash (the caller draws glass)', () => {
    const d = framed({ kind: 'circle' }, 1500, 1500, split('p1', 'x', [60], [leaf('p2'), leaf('p3')]));
    const sliver = outline(d, 'p2');
    expect(() => shapedSash(sliver, GAP, SASH)).toThrow();
  });

  it('hinges sit only on the straight side; the handle is on the bent profile opposite, at its middle', () => {
    const o = outline(twoHalves(), 'p3');
    const s = shapedSash(o, GAP, SASH);
    const hw = shapedSashHardware(s, 'Left');
    const run = s.straight.left!;
    expect(hw.hinges.length).toBe(2);
    for (const h of hw.hinges) {
      expect(h.side).toBe('left');
      expect(h.at.xMm).toBeCloseTo(o.box.xMm + GAP, 3);
      expect(h.at.yMm).toBeGreaterThan(run.fromMm);
      expect(h.at.yMm).toBeLessThan(run.toMm);
    }
    expect(hw.pivots.length + hw.bearings.length).toBe(0);
    const handle = hw.handle!;
    expect(handle.side).toBe('right');
    expect(handle.at.yMm).toBeCloseTo(750, 0);
    // On the middle line of the profile: half a face from each edge, so never floating or cut.
    expect(nearestOnPolygon(s.outerMm, handle.at).distMm).toBeCloseTo(SASH / 2, 0);
    expect(nearestOnPolygon(s.innerMm, handle.at).distMm).toBeCloseTo(SASH / 2, 0);
    // Upright where the curve is upright.
    expect(Math.abs(Math.cos(handle.angleRad))).toBeLessThan(0.05);
    // The triangle: its point on the hinge side, every end on the glass.
    expect(hw.marks.length).toBe(2);
    for (const m of hw.marks) {
      expect(m.hingeSide).toBe('left');
      expect(m.to.xMm).toBeCloseTo(o.box.xMm + GAP + SASH, 3);
      expect(inside(s.innerMm, m.from)).toBeTrue();
      expect(inside(s.innerMm, m.to)).toBeTrue();
    }
  });

  it('a full round pivots at the two ends of its diameter; the handle is on the profile at the bottom', () => {
    const s = shapedSash(outline(round(), 'p1'), GAP, SASH);
    const r = 600 - FACE - GAP;
    const hw = shapedSashHardware(s, 'Pivot Horizontal');
    expect(hw.hinges.length).toBe(0);
    expect(hw.pivots.length).toBe(2);
    expect(hw.pivots[0].yMm).toBeCloseTo(600, 3);
    expect(hw.pivots[0].xMm).toBeCloseTo(600 - r, 0);
    expect(hw.pivots[1].xMm).toBeCloseTo(600 + r, 0);
    expect(hw.axis).not.toBeNull();
    expect(hw.marks.length).toBe(4);
    expect(hw.marks.filter((m) => m.inward).length).toBe(2);
    for (const m of hw.marks) {
      expect(inside(s.innerMm, m.from)).toBeTrue();
      expect(inside(s.innerMm, m.to)).toBeTrue();
    }
    expect(hw.handle!.side).toBe('bottom');
    expect(hw.handle!.at.xMm).toBeCloseTo(600, 0);
    expect(hw.handle!.at.yMm).toBeCloseTo(600 + r - SASH / 2, 0);
    const upright = shapedSashHardware(s, 'Pivot Vertical');
    expect(upright.pivots[0].xMm).toBeCloseTo(600, 3);
    expect(upright.pivots[0].yMm).toBeCloseTo(600 - r, 0);
    expect(upright.handle!.side).toBe('right');
  });

  it('a full round tilts on two bearings below, held by two stays above; no hinge on the curve', () => {
    const s = shapedSash(outline(round(), 'p1'), GAP, SASH);
    const hw = shapedSashHardware(s, 'Bottom');
    expect(hw.hinges.length).toBe(0);
    expect(hw.bearings.length).toBe(2);
    expect(hw.bearings.every((b) => b.yMm > 1000)).toBeTrue();
    const xs = hw.bearings.map((b) => b.xMm).sort((a, b) => a - b);
    expect(xs[0]).toBeLessThan(500);
    expect(xs[1]).toBeGreaterThan(700);
    expect(hw.stays.length).toBe(2);
    expect(hw.stays.every(([a, b]) => a.yMm < 200 && b.yMm < 250)).toBeTrue();
    expect(hw.handle!.side).toBe('top');
    expect(hw.marks.length).toBe(2);
    // The point of the triangle is at the lowest point of the glass.
    expect(hw.marks[0].to.xMm).toBeCloseTo(600, 0);
    expect(hw.marks[0].to.yMm).toBeGreaterThan(1080);
  });

  it('a bottom-hung half round: hinges on the chord, handle at the top of the curve', () => {
    const o = outline(halfRoundOver(), 'p2');
    const s = shapedSash(o, GAP, SASH);
    const hw = shapedSashHardware(s, 'Bottom');
    expect(hw.hinges.length).toBe(2);
    for (const h of hw.hinges) {
      expect(h.side).toBe('bottom');
      expect(h.at.yMm).toBeCloseTo(o.box.yMm + o.box.hMm - GAP, 3);
    }
    expect(hw.handle!.side).toBe('top');
    expect(hw.handle!.at.xMm).toBeCloseTo(600, 0);
    expect(nearestOnPolygon(s.outerMm, hw.handle!.at).distMm).toBeCloseTo(SASH / 2, 0);
  });

  it('an arch-top door leaf: three hinges on the jamb, the lever 1050 above the foot of the leaf', () => {
    const door = framed({ kind: 'arch-top', riseMm: 500 }, 1000, 2100, leaf('p1'));
    const s = shapedSash(outline(door, 'p1'), GAP, 78);
    const hw = shapedSashHardware(s, 'Left', { hingeCount: 3, doorLeverMm: 1050 });
    expect(hw.hinges.length).toBe(3);
    // All three on the straight jamb, below the spring line.
    expect(hw.hinges.every((h) => h.at.yMm > 500)).toBeTrue();
    expect(hw.handle!.side).toBe('right');
    expect(hw.handle!.at.yMm).toBeCloseTo(2100 - FACE - GAP - 1050, 0);
    expect(hw.handle!.at.xMm).toBeCloseTo(1000 - FACE - GAP - 39, 0);
  });

  it('a door leaf on a mullion in a round frame: the lever is at the farthest point of the curve, upright', () => {
    const s = shapedSash(outline(twoHalves(), 'p3'), GAP, 78);
    const hw = shapedSashHardware(s, 'Left', { hingeCount: 3, doorLeverMm: 1050 });
    expect(hw.handle!.at.yMm).toBeCloseTo(750, 0);
    expect(hw.handle!.at.xMm).toBeCloseTo(1500 - FACE - GAP - 39, 0);
    expect(Math.abs(Math.cos(hw.handle!.angleRad))).toBeLessThan(0.05);
    // The triangle runs from the point on the hinges to the curve towards the far top and bottom corners.
    expect(hw.marks.length).toBe(2);
    expect(hw.marks[0].from.yMm).toBeLessThan(450);
    expect(hw.marks[1].from.yMm).toBeGreaterThan(1050);
    expect(hw.marks[0].from.xMm).toBeGreaterThan(1050);
  });
});
