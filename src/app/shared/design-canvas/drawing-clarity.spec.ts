// What the drawing shows for each set-up (card T104): a fabricator must be
// able to read which leaves slide, which open and how, which are fixed, and
// what glass is where. These specs pin the renderer's output, not pixels.
import Konva from 'konva';
import {
  SlideSpec,
  TrackType,
  WindowDesign,
  createDesign,
  createLeaf,
  equalPanels,
  layout,
  makeDoor,
  setLeafSpec,
  setPaneGlass,
  setSlide,
  setSlideMesh,
  setSlidePanel,
  slideDirectionOf,
  walkLeaves,
} from '../design-model';
import {
  mixedExampleB,
  singleFixed,
  twoSashOpenable,
  verticalMullion,
} from '../design-model/testing/fixtures';
import { PICTURE_HEIGHT_PX, PICTURE_WIDTH_PX, designPicture } from './canvas-export';
import { RenderOpts, renderDesign } from './canvas-renderer';
import {
  CanvasSelection,
  computeView,
  marginsFor,
  selectedPaneIds,
  slidePanelAt,
  togglePaneInSelection,
  VIEW_MARGINS,
  VIEW_MARGINS_COMPACT,
} from './canvas-view';
import { resolveSelection } from './canvas-commands';
import { drawingKey } from './drawing-key';

const FACE = 60;
let stage: Konva.Stage | null = null;

function draw(
  design: WindowDesign,
  o: {
    w?: number;
    h?: number;
    selection?: CanvasSelection | null;
    opts?: Partial<RenderOpts>;
    inside?: boolean;
  } = {}
): Konva.Layer {
  stage?.destroy();
  const w = o.w ?? 900;
  const h = o.h ?? 640;
  stage = new Konva.Stage({ container: document.createElement('div'), width: w, height: h, listening: false });
  const layer = new Konva.Layer({ listening: false });
  stage.add(layer);
  renderDesign(
    layer,
    design,
    layout(design, { frameFaceMm: FACE }),
    computeView(w, h, design.frame.widthMm, design.frame.heightMm, 1, 0, 0, !!o.inside),
    { selection: o.selection ?? null, showFrameHandle: false },
    {
      stageWPx: w,
      stageHPx: h,
      frameFaceMm: FACE,
      profileColor: '#ffffff',
      viewFrom: o.inside ? 'inside' : 'outside',
      ...o.opts,
    }
  );
  return layer;
}

const all = (layer: Konva.Layer, name: string): Konva.Node[] => layer.find(`.${name}`) as Konva.Node[];
const box = (n: Konva.Node): { x: number; y: number; w: number; h: number } => ({
  x: n.x(),
  y: n.y(),
  w: (n as Konva.Rect).width(),
  h: (n as Konva.Rect).height(),
});

function slider(tracks: TrackType, panels: number, mesh = false, widthMm = 2400): WindowDesign {
  const d = createDesign({
    frame: { widthMm, heightMm: 1200 },
    glazing: { glassId: 1 },
    root: createLeaf('p1', {}),
  });
  return setSlide(d, 'p1', { tracks, mesh, panels: equalPanels(panels, widthMm - 2 * FACE, 0, tracks) });
}

function casement(direction: string, widthMm = 900): WindowDesign {
  const d = createDesign({ frame: { widthMm, heightMm: 1200 }, glazing: { glassId: 1 } });
  return setLeafSpec(d, 'p1', {
    casementType: 'Openable',
    opening: { direction, handleId: null, hingesType: null },
  });
}

afterEach(() => {
  stage?.destroy();
  stage = null;
});

describe('drawing clarity: sliding windows', () => {
  const SETUPS: { tracks: TrackType; panels: number; trackOrder: number[]; directions: ('Left' | 'Right')[] }[] = [
    { tracks: '2 Track', panels: 2, trackOrder: [0, 1], directions: ['Right', 'Left'] },
    { tracks: '2 Track', panels: 3, trackOrder: [0, 1, 0], directions: ['Right', 'Left', 'Left'] },
    { tracks: '2 Track', panels: 4, trackOrder: [0, 1, 1, 0], directions: ['Right', 'Left', 'Right', 'Left'] },
    { tracks: '2.5 Track', panels: 2, trackOrder: [0, 1], directions: ['Right', 'Left'] },
    { tracks: '3 Track', panels: 3, trackOrder: [0, 1, 2], directions: ['Right', 'Left', 'Left'] },
    { tracks: '3 Track', panels: 4, trackOrder: [0, 1, 1, 0], directions: ['Right', 'Left', 'Right', 'Left'] },
  ];

  for (const s of SETUPS) {
    it(`${s.tracks}, ${s.panels} panels: every shutter is a framed leaf on its track`, () => {
      const d = slider(s.tracks, s.panels);
      const slide = walkLeaves(d.root)[0].slide as SlideSpec;
      expect(slide.panels.map((p) => p.direction)).toEqual(s.directions);
      const layer = draw(d);
      const edges = all(layer, 'slide-sash-edge');
      expect(edges.length).toBe(s.panels);
      // One sash = an outline and four members (slider-sash.spec.ts looks at them).
      expect(all(layer, 'slide-sash-member').length).toBe(s.panels * 4);
      const byIndex = [...edges].sort((a, b) => a.getAttr('panelIndex') - b.getAttr('panelIndex'));
      expect(byIndex.map((e) => e.getAttr('track'))).toEqual(s.trackOrder);
      // A real face width: the band is far wider than a line.
      const glass = [...all(layer, 'glass-pane'), ...all(layer, 'slide-glass')];
      expect(glass.length).toBe(s.panels);
      const face = (box(byIndex[0]).w - Math.max(...glass.map((g) => box(g).w))) / 2;
      expect(face).toBeGreaterThan(8);

      // Neighbours on different tracks lap; neighbours on one track only meet.
      for (let i = 0; i < s.panels - 1; i++) {
        const a = box(byIndex[i]);
        const b = box(byIndex[i + 1]);
        const lap = a.x + a.w - b.x;
        if (s.trackOrder[i] !== s.trackOrder[i + 1]) expect(lap).toBeGreaterThan(8);
        else expect(Math.abs(lap)).toBeLessThan(0.5);
      }
      const locks = all(layer, 'slide-interlock');
      expect(locks.length).toBe(s.panels - 1);
      expect(locks.map((l) => l.getAttr('lapped'))).toEqual(
        s.trackOrder.slice(1).map((t, i) => t !== s.trackOrder[i])
      );

      // Drawn back to front: the outside track (0) last, so it is on top.
      const drawnTracks = edges.map((e) => e.getAttr('track') as number);
      expect([...drawnTracks].sort((x, y) => y - x)).toEqual(drawnTracks);

      // An arrow on every moving shutter, the way the model says it travels.
      const arrows = [...all(layer, 'slide-arrow')].sort(
        (a, b) => a.getAttr('panelIndex') - b.getAttr('panelIndex')
      );
      expect(arrows.map((a) => a.getAttr('pointsRight'))).toEqual(s.directions.map((x) => x === 'Right'));
      // The touch lock is on the stile the shutter leaves behind.
      const handles = [...all(layer, 'slide-handle')].sort(
        (a, b) => a.getAttr('panelIndex') - b.getAttr('panelIndex')
      );
      expect(handles.map((h) => h.getAttr('edge'))).toEqual(
        s.directions.map((x) => (x === 'Right' ? 'left' : 'right'))
      );
      // The track of every shutter is written on it (1 = outside).
      const badges = all(layer, 'track-badge').map((b) => b.getAttr('text')).sort();
      expect(badges).toEqual(s.trackOrder.map((t) => String(t + 1)).sort());
      expect(all(layer, 'track-line').length).toBe(s.tracks === '3 Track' ? 3 : 2);
      expect(all(layer, 'track-line-mesh').length).toBe(s.tracks === '2.5 Track' ? 1 : 0);
    });
  }

  it('a shutter never slides into the jamb or into a neighbour on its own track', () => {
    for (const tracks of ['2 Track', '2.5 Track', '3 Track', '4 Track'] as TrackType[]) {
      for (let n = 2; n <= 6; n++) {
        expect(slideDirectionOf(tracks, n, 0)).toBe('Right');
        expect(slideDirectionOf(tracks, n, n - 1)).toBe('Left');
      }
    }
    expect(equalPanels(3, 2280).map((p) => p.direction)).toEqual(['Left', 'Left', 'Right']); // legacy seed kept
  });

  it('fixed shutters say FIXED and carry no arrow or lock', () => {
    let d = slider('2 Track', 4);
    d = setSlidePanel(d, 'p1', 0, { fixed: true });
    d = setSlidePanel(d, 'p1', 3, { fixed: true });
    const layer = draw(d);
    const fixed = all(layer, 'slide-fixed') as Konva.Text[];
    expect(fixed.map((f) => f.text())).toEqual(['FIXED', 'FIXED']);
    expect(fixed.map((f) => f.getAttr('panelIndex'))).toEqual([0, 3]);
    expect(all(layer, 'slide-arrow').map((a) => a.getAttr('panelIndex'))).toEqual([1, 2]);
    expect(all(layer, 'slide-handle').map((a) => a.getAttr('panelIndex'))).toEqual([1, 2]);
    expect(drawingKey(d).map((k) => k.glyph)).toEqual(['slides', 'fixed-shutter', 'track']);
  });

  it('the fly mesh is a shutter of its own: slim frame, fine hatch, named with its track', () => {
    for (const [tracks, panels, text] of [
      ['3 Track', 3, 'FLY MESH · track 3'],
      ['2.5 Track', 2, 'FLY MESH · half track'],
    ] as [TrackType, number, string][]) {
      const d = slider(tracks, panels, true);
      const layer = draw(d);
      const mesh = all(layer, 'fly-mesh');
      expect(mesh.length).toBe(1);
      expect(all(layer, 'fly-mesh-hatch').length).toBe(1);
      expect(all(layer, 'fly-mesh-label')[0].getAttr('caption')).toBe(text);
      // Its frame is slimmer than a glass shutter's and sits inside that shutter's bands.
      const frame = all(layer, 'fly-mesh-frame')[0] as Konva.Rect;
      const first = all(layer, 'slide-sash-edge').find((e) => e.getAttr('panelIndex') === 0) as Konva.Rect;
      const glass = all(layer, 'glass-pane')[0] as Konva.Rect;
      expect(frame.strokeWidth()).toBeLessThan((first.width() - glass.width()) / 2);
      expect(frame.x()).toBeGreaterThan(first.x());
      // Parked on the other side when asked, and mirrored with the view.
      const left = mesh[0].getAttr('xPx') as number;
      const right = all(draw(setSlideMesh(d, 'p1', true, 'Right')), 'fly-mesh')[0].getAttr('xPx') as number;
      expect(right).toBeGreaterThan(left);
      expect(all(draw(d, { inside: true }), 'fly-mesh')[0].getAttr('xPx')).toBeGreaterThan(left);
      expect(drawingKey(d).map((k) => k.glyph)).toEqual(['slides', 'mesh', 'track']);
    }
  });

  it('seen from inside, the inside track is drawn on top', () => {
    const layer = draw(slider('3 Track', 3), { inside: true });
    const drawn = all(layer, 'slide-sash-edge').map((e) => e.getAttr('track') as number);
    expect(drawn).toEqual([0, 1, 2]);
  });

  it('a selected shutter shows its sash and glass sizes; a click in a lap picks the front one', () => {
    const d = slider('2 Track', 2, false, 1800);
    const lay = layout(d, { frameFaceMm: FACE });
    const layer = draw(d, { selection: { type: 'pane', paneId: 'p1', panelIndex: 1 } });
    const sizes = all(layer, 'leaf-sizes');
    expect(sizes.length).toBe(1);
    expect(sizes[0].getAttr('sashWMm')).toBe(840);
    expect(sizes[0].getAttr('sashHMm')).toBe(1080);
    // Glass is the sight size: the sash less its 45 mm band on each side.
    expect(sizes[0].getAttr('glassWMm')).toBe(750);
    expect(sizes[0].getAttr('glassHMm')).toBe(990);
    expect(sizes[0].getAttr('where')).toBe('Shutter 2 of 2 · track 2');
    // The sash is a shade darker than the white frame: four members that can be seen.
    const edge = all(layer, 'slide-sash-edge')[0] as Konva.Rect;
    expect(edge.fill()).not.toBe('#ffffff');
    expect(edge.strokeWidth()).toBeGreaterThan(1);
    expect(all(draw(d), 'leaf-sizes').length).toBe(0);

    const overlapped = setSlide(d, 'p1', {
      tracks: '2 Track',
      mesh: false,
      panels: [
        { widthMm: 880, direction: 'Right' },
        { widthMm: 880, direction: 'Left' },
      ],
    });
    const rect = lay.leaves[0].rect;
    const leaf = walkLeaves(overlapped.root)[0];
    expect(slidePanelAt(leaf, rect, { xMm: rect.xMm + 840, yMm: rect.yMm + 10 })).toBe(0);
  });
});

describe('drawing clarity: opening sashes, doors and fixed panes', () => {
  it('a side-hung sash is a frame inside the frame, with its triangle, handle and hinges', () => {
    const layer = draw(casement('Left'));
    const gap = all(layer, 'sash-gap')[0] as Konva.Rect;
    const sash = all(layer, 'sash-outline-edge')[0] as Konva.Rect;
    const glass = all(layer, 'glass-pane')[0] as Konva.Rect;
    // Two distinct rectangles with the rebate gap between them.
    expect(sash.x()).toBeGreaterThan(gap.x());
    expect(sash.width()).toBeLessThan(gap.width());
    expect(glass.x() - sash.x()).toBeGreaterThan(8); // the sash band
    const lines = all(layer, 'opening-symbol') as Konva.Line[];
    expect(lines.length).toBe(2);
    expect(lines.every((l) => l.getAttr('hingeSide') === 'left' && !l.getAttr('dashed'))).toBeTrue();
    // The point of the triangle is on the hinge side, at mid height of the glass.
    expect(lines[0].points()[2]).toBeCloseTo(glass.x(), 3);
    expect(lines[0].points()[3]).toBeCloseTo(glass.y() + glass.height() / 2, 3);
    const handle = all(layer, 'handle-glyph')[0] as Konva.Rect;
    expect(handle.getAttr('edge')).toBe('right');
    // On the lock stile (inside the sash band), at mid height.
    expect(handle.x()).toBeGreaterThan(glass.x() + glass.width());
    expect(handle.x() + handle.width()).toBeLessThan(sash.x() + sash.width());
    expect(handle.y() + handle.height() / 2).toBeCloseTo(sash.y() + sash.height() / 2, 3);
    const hinges = all(layer, 'hinge-mark');
    expect(hinges.length).toBe(2);
    expect(hinges.every((h) => h.getAttr('side') === 'left')).toBeTrue();
    expect(drawingKey(casement('Left')).map((k) => k.glyph)).toEqual(['opens-out']);
  });

  it('top-hung: the point is on the top rail, the handle on the bottom rail', () => {
    const layer = draw(casement('Top'));
    const lines = all(layer, 'opening-symbol');
    expect(lines.every((l) => l.getAttr('hingeSide') === 'top' && !l.getAttr('dashed'))).toBeTrue();
    expect(all(layer, 'handle-glyph')[0].getAttr('edge')).toBe('bottom');
    expect(all(layer, 'hinge-mark').every((h) => h.getAttr('side') === 'top')).toBeTrue();
  });

  it('tilt and turn: two dashed triangles, and the key says so', () => {
    const d = casement('Tilt & Turn Right');
    const lines = all(draw(d), 'opening-symbol');
    expect(lines.map((l) => `${l.getAttr('motion')}:${l.getAttr('hingeSide')}:${l.getAttr('dashed')}`)).toEqual([
      'turn:right:true',
      'turn:right:true',
      'tilt:bottom:true',
      'tilt:bottom:true',
    ]);
    expect(drawingKey(d).map((k) => k.glyph)).toEqual(['opens-in', 'tilt']);
  });

  it('a door leaf follows its swing; the handle is at lever height; the threshold is drawn', () => {
    const base = createDesign({ frame: { widthMm: 1000, heightMm: 2100 }, glazing: { glassId: 1 } });
    const inward = makeDoor(base, 'p1', { leaves: 1, swing: 'In', threshold: 'Standard' });
    const layer = draw(inward);
    expect(all(layer, 'opening-symbol').every((l) => l.getAttr('dashed'))).toBeTrue();
    expect(all(layer, 'door-swing')[0].getAttr('dashed')).toBeTrue();
    expect(all(layer, 'door-threshold').length).toBe(1);
    expect(all(layer, 'hinge-mark').length).toBe(3);
    const sash = all(layer, 'sash-outline-edge')[0] as Konva.Rect;
    const handle = all(layer, 'handle-glyph')[0] as Konva.Rect;
    const pxPerMm = sash.height() / (2100 - 2 * FACE);
    const aboveFloorMm = (sash.y() + sash.height() - (handle.y() + handle.height() / 2)) / pxPerMm;
    expect(aboveFloorMm).toBeGreaterThan(1000);
    expect(aboveFloorMm).toBeLessThan(1100);
    expect(drawingKey(inward).map((k) => k.glyph)).toEqual(['opens-in']);

    const out = makeDoor(base, 'p1', { leaves: 2, swing: 'Out', threshold: 'Low' });
    const french = draw(out);
    expect(all(french, 'sash-outline-edge').length).toBe(2);
    expect(all(french, 'opening-symbol').every((l) => !l.getAttr('dashed'))).toBeTrue();
    // A french pair is hinged on the two jambs and locks in the middle.
    expect(all(french, 'door-swing').map((a) => a.getAttr('hingeSide')).sort()).toEqual(['left', 'right']);
    expect(all(french, 'handle-glyph').map((h) => h.getAttr('edge')).sort()).toEqual(['left', 'right']);
    expect(drawingKey(out).map((k) => k.glyph)).toEqual(['opens-out']);
  });

  it('a fixed pane shows glass and its bead line only', () => {
    const layer = draw(singleFixed());
    expect(all(layer, 'glass-pane').length).toBe(1);
    expect(all(layer, 'bead-line').length).toBe(1);
    for (const name of ['sash-outline-edge', 'sash-gap', 'opening-symbol', 'handle-glyph', 'hinge-mark', 'slide-arrow']) {
      expect(all(layer, name).length).toBe(0);
    }
    expect(drawingKey(singleFixed())).toEqual([]);
  });

  it('a 2-sash casement: the sashes hinge on the jambs and lock in the middle', () => {
    const layer = draw(twoSashOpenable());
    expect(all(layer, 'sash-outline-edge').length).toBe(2);
    expect(all(layer, 'handle-glyph').map((h) => h.getAttr('edge'))).toEqual(['right', 'left']);
  });
});

describe('drawing clarity: glass per pane', () => {
  const labels = { '1': '5mm plain glass', '15': '6+6 DGU glass reflactive', '2': '4mm Plain glass' };

  it('a pane with its own glass is tinted, hatched and tagged; the others are not', () => {
    const d = setPaneGlass(verticalMullion(), [walkLeaves(verticalMullion().root)[1].id], 15);
    const layer = draw(d, { opts: { glassLabels: labels, glassTints: { '15': '#a9c7d6' } } });
    const panes = all(layer, 'glass-pane');
    expect(panes.map((p) => p.getAttr('ownGlass'))).toEqual([false, true]);
    expect(panes.map((p) => p.getAttr('glassId'))).toEqual([1, 15]);
    expect(panes[1].getAttr('glassTint')).toBe('#a9c7d6');
    expect(panes[0].getAttr('glassTint')).toBe('');
    expect(all(layer, 'glass-hatch').length).toBe(1);
    const tags = all(layer, 'glass-tag');
    expect(tags.length).toBe(1);
    expect(tags[0].getAttr('caption')).toBe('G2 6+6 DGU glass reflactive');
    expect(drawingKey(d, labels)).toEqual([{ glyph: 'glass', code: 'G2', text: '6+6 DGU glass reflactive' }]);
    // Without a colour from the catalogue the pane still gets a tint of its own.
    const plain = all(draw(d), 'glass-pane');
    expect(plain[1].getAttr('glassTint')).not.toBe('');
    expect(all(draw(verticalMullion()), 'glass-tag').length).toBe(0);
  });

  it('two different glasses are numbered and hatched differently', () => {
    const [, b, c] = walkLeaves(mixedExampleB().root).map((l) => l.id);
    const d = setPaneGlass(setPaneGlass(mixedExampleB(), [b], 15), [c], 2);
    const layer = draw(d, { opts: { glassLabels: labels } });
    expect(all(layer, 'glass-tag').map((t) => t.getAttr('glassIndex'))).toEqual([1, 2]);
    expect(all(layer, 'glass-hatch').map((h) => h.getAttr('variant'))).toEqual([0, 1]);
    expect(drawingKey(d, labels).map((k) => k.code)).toEqual([undefined, 'G2', 'G3']);
  });

  it('several panes can be selected, and the selection survives edits', () => {
    const [a, b, c] = walkLeaves(mixedExampleB().root).map((l) => l.id);
    let sel = togglePaneInSelection(null, a);
    expect(sel).toEqual({ type: 'pane', paneId: a });
    sel = togglePaneInSelection(sel, c);
    expect(sel).toEqual({ type: 'pane', paneId: c, paneIds: [a, c] });
    expect(selectedPaneIds(sel)).toEqual([a, c]);
    const layer = draw(mixedExampleB(), { selection: sel });
    const marks = all(layer, 'selection-highlight');
    expect(marks.map((m) => m.getAttr('paneId'))).toEqual([a, c]);
    expect(marks.map((m) => m.getAttr('primary'))).toEqual([false, true]);
    // Shift-click on a selected pane takes it out again.
    expect(togglePaneInSelection(sel, c)).toEqual({ type: 'pane', paneId: a });
    expect(togglePaneInSelection({ type: 'pane', paneId: a }, a)).toBeNull();
    // A pane that no longer exists drops out of the selection.
    expect(resolveSelection(verticalMullion(), { type: 'pane', paneId: 'p3', paneIds: ['p2', 'p9', 'p3'] })).toEqual({
      type: 'pane',
      paneId: 'p3',
      paneIds: ['p2', 'p3'],
    });
    expect(b).toBeTruthy();
  });
});

describe('drawing clarity: small screens and the saved picture', () => {
  it('a small stage uses compact margins so the window stays large', () => {
    expect(marginsFor(900, 640)).toBe(VIEW_MARGINS);
    expect(marginsFor(374, 320)).toBe(VIEW_MARGINS_COMPACT);
    const wide = computeView(374, 320, 1500, 1200, 1, 0, 0, false, VIEW_MARGINS);
    const compact = computeView(374, 320, 1500, 1200, 1, 0, 0);
    expect(compact.pxPerMm).toBeGreaterThan(wide.pxPerMm * 1.1);
  });

  it('at phone width nothing overlaps: shutters keep bands and arrows, small print is dropped', () => {
    for (const d of [slider('3 Track', 3, true, 1500), slider('2 Track', 4, false, 1500), twoSashOpenable(), mixedExampleB()]) {
      const layer = draw(d, { w: 374, h: 320 });
      // Labels are never wider than the pane they name.
      for (const label of all(layer, 'pane-label') as Konva.Text[]) {
        const pane = (all(layer, 'glass-pane') as Konva.Rect[]).find(
          (g) => g.getAttr('paneId') === label.getAttr('paneId')
        ) as Konva.Rect;
        expect(label.width()).toBeLessThanOrEqual(pane.width() + 2 * 60);
      }
      // Every sash band is still a band (3 px or more), every arrow has room.
      for (const edge of [...all(layer, 'slide-sash-edge'), ...all(layer, 'sash-outline-edge')] as Konva.Rect[]) {
        expect(edge.width()).toBeGreaterThan(12);
      }
      for (const arrow of all(layer, 'slide-arrow') as Konva.Arrow[]) {
        const p = arrow.points();
        expect(Math.abs(p[2] - p[0])).toBeGreaterThan(6);
      }
    }
    const slide = draw(slider('3 Track', 3, true, 1500), { w: 374, h: 320 });
    expect(all(slide, 'slide-sash-edge').length).toBe(3);
    expect(all(slide, 'slide-arrow').length).toBe(3);
    expect(all(slide, 'fly-mesh').length).toBe(1);
    // Narrower still (a list thumbnail): the small print goes, the shutters stay.
    const thumb = draw(slider('3 Track', 3, true, 1500), { w: 220, h: 170 });
    expect(all(thumb, 'track-badge').length).toBe(0);
    expect(all(thumb, 'fly-mesh-label').length).toBe(0);
    expect(all(thumb, 'slide-arrow').length).toBe(3);
  });

  it('a list thumbnail keeps the frames and symbols and no text', () => {
    const layer = draw(mixedExampleB(), { w: 200, h: 150 });
    expect(all(layer, 'pane-label').length).toBe(0);
    expect(all(layer, 'glass-pane').length).toBe(3);
    expect(all(layer, 'opening-symbol').length).toBe(2);
    expect(all(layer, 'sash-outline-edge').length).toBe(1);
  });

  it('the saved picture carries the key of its own symbols, and none when there is nothing to explain', () => {
    const d = slider('3 Track', 3, true);
    const layer = draw(d, { w: PICTURE_WIDTH_PX, h: PICTURE_HEIGHT_PX, opts: { legend: true } });
    const key = all(layer, 'drawing-key');
    expect(key.length).toBe(1);
    expect(key[0].getAttr('items')).toEqual(['slides', 'mesh', 'track']);
    expect(all(draw(singleFixed(), { opts: { legend: true } }), 'drawing-key').length).toBe(0);
    expect(all(draw(d), 'drawing-key').length).toBe(0);

    const png = designPicture(d, { frameFaceMm: FACE });
    expect(png.startsWith('data:image/png;base64,')).toBeTrue();
    expect(designPicture(d, { frameFaceMm: FACE })).toBe(png); // same design, same picture
    expect(designPicture(d, { frameFaceMm: FACE, legend: false })).not.toBe(png);
  });
});
