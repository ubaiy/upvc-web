// Shaped frames (card T130): a pane the frame shape cuts is fixed glass
// that follows the cut; bars end on the frame's inner line; nothing is
// drawn outside the frame; a sash is refused there.
import 'zone.js/testing';

import Konva from 'konva';
import {
  LeafNode,
  PaneNode,
  SHAPED_OPENING_PROBLEM,
  SplitNode,
  WindowDesign,
  layout,
  panesCutByShape,
  shapedOpeningPanes,
} from '../design-model';
import { singleFixed } from '../design-model/testing/fixtures';
import { renderDesign } from './canvas-renderer';
import { ViewTransform, computeView, mmFromPx } from './canvas-view';
import { setPaneKind } from './design-edit-ops';

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

describe('design-canvas — shaped frames (T130)', () => {
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

  it('the rule: only panes the shape cuts are refused a sash', () => {
    const round = roundDoor();
    expect([...panesCutByShape(round, { frameFaceMm: FACE })].sort()).toEqual(['p3', 'p4', 'p5', 'p6']);
    expect(shapedOpeningPanes(round, { frameFaceMm: FACE })).toEqual(['p6']);
    const arch = archWithSash();
    // Under the spring line the opening is a rectangle: the sash stays.
    expect([...panesCutByShape(arch, { frameFaceMm: FACE })]).toEqual(['p2']);
    expect(shapedOpeningPanes(arch, { frameFaceMm: FACE })).toEqual([]);
    expect(shapedOpeningPanes(singleFixed())).toEqual([]);
  });

  it('openable and sliding are refused, in plain words, for a cut pane', () => {
    const arch = archWithSash();
    expect(() => setPaneKind(arch, 'p2', 'openable', { frameFaceMm: FACE })).toThrowError(SHAPED_OPENING_PROBLEM);
    expect(() => setPaneKind(arch, 'p2', 'sliding', { frameFaceMm: FACE })).toThrowError(SHAPED_OPENING_PROBLEM);
    expect(() => setPaneKind(arch, 'p5', 'openable', { frameFaceMm: FACE })).not.toThrow();
    expect(SHAPED_OPENING_PROBLEM).toContain('mullion');
  });

  it('a saved round door opens: glass with a warning, no sash, nothing outside the frame', () => {
    draw(roundDoor());
    for (const name of [
      'sash-outline-edge', 'sash-gap', 'handle-glyph', 'door-lever', 'hinge-mark',
      'opening-symbol', 'door-swing', 'door-swing-label', 'door-threshold',
    ]) {
      expect(find(name).length).withContext(name).toBe(0);
    }
    const warning = find<Konva.Text>('shape-warning');
    expect(warning.length).toBe(1);
    expect(warning[0].getAttr('paneId')).toBe('p6');
    expect(warning[0].text()).toContain('Cannot open');
    expect(find('glass-pane').length).toBe(4);
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
