// Shaped frames (cards T130, T131): a pane the frame shape cuts follows the
// cut: fixed glass, or an opening sash made to that outline; bars end on the
// frame's inner line; nothing is drawn outside the frame.
import 'zone.js/testing';

import Konva from 'konva';
import {
  LeafNode,
  PaneNode,
  SLIDING_NEEDS_STRAIGHT_TRACK,
  SplitNode,
  WindowDesign,
  layout,
  panesCutByShape,
} from '../design-model';
import { singleFixed } from '../design-model/testing/fixtures';
import { renderDesign } from './canvas-renderer';
import { ViewTransform, computeView, mmFromPx } from './canvas-view';
import { setOpeningDirection, setPaneKind } from './design-edit-ops';

const FACE = 60;

const leaf = (id: string, extra: Partial<LeafNode> = {}): LeafNode => ({
  id,
  kind: 'leaf',
  category: 'Casement',
  casementType: 'Fixed',
  productId: null,
  sashId: null,
  ...extra,
});
const sash = (id: string): LeafNode =>
  leaf(id, {
    casementType: 'Openable',
    opening: { direction: 'Left', handleId: null, hingesType: null },
  });
const split = (
  id: string,
  axis: 'x' | 'y',
  positionsMm: number[],
  children: PaneNode[]
): SplitNode => ({
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

/** The owner's window: round 1500, two mullions, a transom, a door leaf. */
function roundDoor(): WindowDesign {
  const base = singleFixed();
  return {
    ...base,
    productType: 'Door',
    frame: { ...base.frame, shape: { kind: 'circle' }, widthMm: 1500, heightMm: 1500 },
    root: split('p1', 'x', [330, 690], [
      split('p2', 'y', [800], [leaf('p3'), leaf('p4')]),
      leaf('p5'),
      sash('p6'),
    ]),
    door: { leaves: 1, openingSide: 'Left', swing: 'In', threshold: 'Standard', doorNodeId: 'p6' },
  };
}

/** Arched top with a transom at the spring line and a sash below it. */
function archWithSash(): WindowDesign {
  const base = singleFixed();
  return {
    ...base,
    frame: { ...base.frame, shape: { kind: 'arch-top', riseMm: 600 }, widthMm: 1200, heightMm: 1800 },
    root: split('p1', 'y', [600], [
      leaf('p2'),
      split('p3', 'x', [540], [sash('p4'), leaf('p5')]),
    ]),
  };
}

describe('design-canvas — shaped frames (T130, T131)', () => {
  let stage: Konva.Stage;
  let layer: Konva.Layer;
  let view: ViewTransform;

  function draw(design: WindowDesign, w = 900, h = 700): void {
    stage = new Konva.Stage({ container: document.createElement('div'), width: w, height: h });
    layer = new Konva.Layer();
    stage.add(layer);
    view = computeView(w, h, design.frame.widthMm, design.frame.heightMm, 1, 0, 0);
    renderDesign(
      layer,
      design,
      layout(design, { frameFaceMm: FACE }),
      view,
      { selection: null, showFrameHandle: false },
      { stageWPx: w, stageHPx: h, frameFaceMm: FACE, profileColor: '#ffffff' }
    );
  }
  const find = <T extends Konva.Node>(name: string): T[] => layer.find<T>('.' + name);
  /** Distance of every point of the named lines from the circle's centre, mm. */
  function radii(name: string, only?: (n: Konva.Line) => boolean): number[] {
    const out: number[] = [];
    for (const line of find<Konva.Line>(name)) {
      if (only && !only(line)) continue;
      const pts = line.points();
      for (let i = 0; i < pts.length; i += 2) {
        const p = mmFromPx(view, pts[i], pts[i + 1]);
        out.push(Math.hypot(p.xMm - 750, p.yMm - 750));
      }
    }
    return out;
  }

  afterEach(() => stage?.destroy());

  it('the round door of the owner: a sash made to the outline, hung on the mullion, all inside the frame', () => {
    draw(roundDoor());
    const inner = 750 - FACE;
    const edges = find<Konva.Line>('sash-outline-edge');
    expect(edges.length).toBe(1);
    expect(edges[0].getAttr('shaped')).toBeTrue();
    expect(edges[0].getAttr('opening')).toBe('Left');
    expect(find('sash-gap').length).toBe(1);
    // The sash, its joints, the opening triangle and the swing never pass the frame's inner line.
    for (const name of ['sash-outline-edge', 'sash-joint', 'opening-symbol', 'door-swing']) {
      expect(find(name).length).withContext(name).toBeGreaterThan(0);
    }
    for (const name of ['sash-outline-edge', 'sash-joint', 'opening-symbol']) {
      expect(Math.max(...radii(name))).withContext(name).toBeLessThanOrEqual(inner + 0.5);
    }
    // Two joints: where the straight stile meets the bent profile, top and bottom.
    expect(find('sash-joint').length).toBe(2);
    // Three hinges, all on the straight side (the mullion), none on the curve.
    const pane = layout(roundDoor(), { frameFaceMm: FACE }).leaves.find((l) => l.leaf.id === 'p6')!.rect;
    const hinges = find<Konva.Rect>('hinge-mark');
    expect(hinges.length).toBe(3);
    for (const h of hinges) {
      const c = mmFromPx(view, h.x() + h.width() / 2, h.y() + h.height() / 2);
      expect(Math.abs(c.xMm - pane.xMm)).toBeLessThan(8);
      expect(Math.hypot(c.xMm - 750, c.yMm - 750)).toBeLessThan(inner - 20);
    }
    // The lever is on the sash profile, inside the frame: not floating, not cut.
    const handle = find<Konva.Rect>('handle-glyph');
    expect(handle.length).toBe(1);
    const at = mmFromPx(view, handle[0].x(), handle[0].y());
    const r = Math.hypot(at.xMm - 750, at.yMm - 750);
    expect(r).toBeLessThan(inner - 10);
    expect(r).toBeGreaterThan(inner - 100);
    // The leaf stands on the curve of the frame: no sill strip of its own.
    expect(find('door-threshold').length).toBe(0);
    expect(find('shape-warning').length).toBe(0);
    expect(find('glass-pane').length).toBe(4);
  });

  it('a full round pivots on its centre; a tilting one has bearings and stays, never a hinge on the curve', () => {
    const base = singleFixed();
    const roundFrame = { ...base.frame, shape: { kind: 'circle' as const }, widthMm: 1200, heightMm: 1200 };
    let d = setPaneKind({ ...base, frame: roundFrame, root: leaf('p1') }, 'p1', 'openable', { frameFaceMm: FACE });
    expect((d.root as LeafNode).opening?.pivot).toBe('horizontal');
    draw(d);
    expect(find('pivot-mark').length).toBe(2);
    expect(find('pivot-axis').length).toBe(1);
    expect(find('hinge-mark').length).toBe(0);
    expect(find('handle-glyph').length).toBe(1);
    expect(find('opening-symbol').length).toBe(4);
    stage.destroy();
    d = setOpeningDirection(d, 'p1', 'Bottom', { frameFaceMm: FACE });
    expect((d.root as LeafNode).opening?.pivot).toBeUndefined();
    draw(d);
    expect(find('tilt-bearing').length).toBe(2);
    expect(find('tilt-stay').length).toBe(2);
    expect(find('hinge-mark').length).toBe(0);
    expect(find('pivot-mark').length).toBe(0);
    // Side-hung has no straight side to hang on: said as what it needs.
    expect(() => setOpeningDirection(d, 'p1', 'Left', { frameFaceMm: FACE })).toThrowError(/straight upright side/);
  });

  it('the rule: a cut pane opens the way its outline allows; it cannot slide', () => {
    const round = roundDoor();
    expect([...panesCutByShape(round, { frameFaceMm: FACE })].sort()).toEqual(['p3', 'p4', 'p5', 'p6']);
    const arch = archWithSash();
    expect([...panesCutByShape(arch, { frameFaceMm: FACE })]).toEqual(['p2']);
    // The half-round light over the transom: bottom-hung on its chord.
    const opened = setPaneKind(arch, 'p2', 'openable', { frameFaceMm: FACE });
    const top = (opened.root as SplitNode).children[0] as LeafNode;
    expect(top.casementType).toBe('Openable');
    expect(top.opening?.direction).toBe('Bottom');
    expect(() => setPaneKind(arch, 'p2', 'sliding', { frameFaceMm: FACE })).toThrowError(SLIDING_NEEDS_STRAIGHT_TRACK);
    expect(SLIDING_NEEDS_STRAIGHT_TRACK).toContain('straight, level track');
    // A pane the shape does not cut is as before.
    expect(() => setPaneKind(arch, 'p5', 'sliding', { frameFaceMm: FACE })).not.toThrow();
    draw(opened);
    expect(find<Konva.Line>('sash-outline-edge').filter((e) => e.getAttr('shaped')).length).toBe(1);
    expect(find<Konva.Rect>('hinge-mark').filter((h) => h.getAttr('side') === 'bottom').length).toBe(2);
  });

  it('bars end on the inner frame line and the bead follows the curve', () => {
    draw(roundDoor());
    const inner = 750 - FACE;
    const bars = radii('divider-bar');
    expect(find('divider-bar').length).toBe(3);
    expect(Math.max(...bars)).toBeLessThanOrEqual(inner + 0.5);
    // Each mullion reaches the inner line at both ends (closed joint).
    expect(bars.filter((r) => r > inner - 2).length).toBeGreaterThanOrEqual(6);
    const panes = radii('pane-outline');
    expect(Math.max(...panes)).toBeLessThanOrEqual(inner + 0.5);
    const beads = find<Konva.Line>('bead-line').filter((b) => b.getAttr('shaped'));
    expect(beads.length).toBe(4);
    const beadR = radii('bead-line', (b) => !!b.getAttr('shaped'));
    // 18 mm inside the glass edge, all the way along the curve.
    expect(Math.max(...beadR)).toBeLessThanOrEqual(inner - 18 + 0.5);
    expect(beadR.filter((r) => r > inner - 19).length).toBeGreaterThan(20);
  });

  it('a cut pane is labelled with its overall size, an uncut one as before', () => {
    draw(roundDoor());
    const label = find<Konva.Text>('pane-label').find((l) => l.getAttr('paneId') === 'p6') as Konva.Text;
    expect(label.getAttr('overall')).toBeTrue();
    expect(label.text()).toContain('overall');
    expect(label.getAttr('wMm')).toBe(660);
    // The chord of the inner circle at the mullion, not the 1380 of the box.
    expect(label.getAttr('hMm')).toBeLessThan(1380);
    expect(label.getAttr('hMm')).toBeGreaterThan(1370);
    stage.destroy();
    draw(archWithSash());
    const texts = find<Konva.Text>('pane-label').map((l) => l.text());
    expect(texts).toContain('1080 × 570 mm overall');
    expect(texts).toContain('510 × 1050 mm');
    // The sash in the rectangular opening is drawn as a sash.
    expect(find('sash-outline-edge').length).toBe(1);
    expect(find('shape-warning').length).toBe(0);
  });

  it('a plain round fixed light: one pane, edge and bead along the circle', () => {
    const base = singleFixed();
    draw({ ...base, frame: { ...base.frame, shape: { kind: 'circle' }, widthMm: 1500, heightMm: 1500 } });
    expect(find('pane-outline').length).toBe(1);
    const bead = radii('bead-line', (b) => !!b.getAttr('shaped'));
    expect(bead.length).toBeGreaterThan(60);
    expect(Math.min(...bead)).toBeGreaterThan(750 - FACE - 19);
    expect(find('pane-label').length).toBe(0);
  });
});
