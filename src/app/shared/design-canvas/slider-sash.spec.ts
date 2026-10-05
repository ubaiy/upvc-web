// A sliding shutter with glass is a complete sash (card T110): two stiles and
// two rails that can each be seen, the glass inside them, and at a lap the
// front shutter's stile over the one behind. These specs pin the renderer's
// output for the desktop drawing, the phone drawing and the saved picture.
import Konva from 'konva';
import {
  TrackType,
  WindowDesign,
  createDesign,
  createLeaf,
  equalPanels,
  layout,
  setSlide,
  setSlideMesh,
} from '../design-model';
import { PICTURE_HEIGHT_PX, PICTURE_WIDTH_PX } from './canvas-export';
import { renderDesign } from './canvas-renderer';
import { computeView } from './canvas-view';

const FACE = 60;
const FRAME_COLOUR = '#ffffff';
let stage: Konva.Stage | null = null;

function slider(tracks: TrackType, panels: number, mesh: boolean, widthMm = 1500): WindowDesign {
  const d = createDesign({
    frame: { widthMm, heightMm: 1200 },
    glazing: { glassId: 1 },
    root: createLeaf('p1', {}),
  });
  return setSlide(d, 'p1', { tracks, mesh, panels: equalPanels(panels, widthMm - 2 * FACE, 0, tracks) });
}

function draw(design: WindowDesign, w: number, h: number, legend = false, inside = false): Konva.Layer {
  stage?.destroy();
  stage = new Konva.Stage({ container: document.createElement('div'), width: w, height: h, listening: false });
  const layer = new Konva.Layer({ listening: false });
  stage.add(layer);
  renderDesign(
    layer,
    design,
    layout(design, { frameFaceMm: FACE }),
    computeView(w, h, design.frame.widthMm, design.frame.heightMm, 1, 0, 0, inside),
    { selection: null, showFrameHandle: false },
    {
      stageWPx: w,
      stageHPx: h,
      frameFaceMm: FACE,
      profileColor: FRAME_COLOUR,
      legend,
      viewFrom: inside ? 'inside' : 'outside',
    }
  );
  return layer;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const all = (layer: Konva.Layer, name: string): Konva.Node[] => layer.find(`.${name}`) as Konva.Node[];
const box = (n: Konva.Node): Box => ({ x: n.x(), y: n.y(), w: n.width(), h: n.height() });
/** Length of [a0, a1] that [b0, b1] covers. */
const covered = (a0: number, a1: number, b0: number, b1: number): number =>
  Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

afterEach(() => {
  stage?.destroy();
  stage = null;
});

describe('sliding shutters are complete sashes (T110)', () => {
  const WINDOWS: { name: string; tracks: TrackType; panels: number; mesh: boolean }[] = [
    { name: '2-track, 2 panels', tracks: '2 Track', panels: 2, mesh: false },
    { name: '3-track with mesh', tracks: '3 Track', panels: 3, mesh: true },
    { name: '4 panels', tracks: '2 Track', panels: 4, mesh: false },
  ];
  const STAGES: { name: string; w: number; h: number; legend: boolean }[] = [
    { name: 'the designer', w: 900, h: 640, legend: false },
    { name: 'a phone (390 wide)', w: 374, h: 320, legend: false },
    { name: 'the saved picture', w: PICTURE_WIDTH_PX, h: PICTURE_HEIGHT_PX, legend: true },
  ];

  for (const win of WINDOWS) {
    for (const st of STAGES) {
      it(`${win.name} on ${st.name}: four members a shutter, glass inside them`, () => {
        const layer = draw(slider(win.tracks, win.panels, win.mesh), st.w, st.h, st.legend);
        const order = layer.getChildren();
        const opening = box(all(layer, 'slide-opening')[0]);
        const edges = all(layer, 'slide-sash-edge') as Konva.Rect[];
        const members = all(layer, 'slide-sash-member') as Konva.Line[];
        const glasses = [...all(layer, 'glass-pane'), ...all(layer, 'slide-glass')].map(box);
        expect(edges.length).toBe(win.panels);
        expect(glasses.length).toBe(win.panels);

        for (const edge of edges) {
          const index = edge.getAttr('panelIndex') as number;
          const e = box(edge);
          const own = members.filter((m) => m.getAttr('panelIndex') === index);
          expect(own.map((m) => m.getAttr('member')).sort()).toEqual(['bottom', 'left', 'right', 'top']);
          const face = own[0].getAttr('facePx') as number;
          expect(face).toBeGreaterThanOrEqual(3);

          for (const m of own) {
            // A mitred piece of its own: four corners, an outline, a fill off the frame's.
            expect(m.points().length).toBe(8);
            expect(m.closed()).toBeTrue();
            expect(m.strokeWidth()).toBeGreaterThan(0);
            expect(m.stroke()).toBeTruthy();
            expect(m.fill()).not.toBe(FRAME_COLOUR);
            const p = m.points();
            const xs = p.filter((_, i) => i % 2 === 0);
            const ys = p.filter((_, i) => i % 2 === 1);
            // It lies on its own side of the shutter, one face width deep.
            expect(Math.min(...xs)).toBeGreaterThanOrEqual(e.x - 0.01);
            expect(Math.max(...xs)).toBeLessThanOrEqual(e.x + e.w + 0.01);
            const depth =
              m.getAttr('member') === 'left' || m.getAttr('member') === 'right'
                ? Math.max(...xs) - Math.min(...xs)
                : Math.max(...ys) - Math.min(...ys);
            expect(depth).toBeCloseTo(face, 3);
          }

          // The glass is inset by the four members.
          const glass = glasses.find((g) => Math.abs(g.x - (e.x + face)) < 0.01) as Box;
          expect(glass).toBeDefined();
          expect(glass.y).toBeCloseTo(e.y + face, 3);
          expect(glass.w).toBeCloseTo(e.w - 2 * face, 3);
          expect(glass.h).toBeCloseTo(e.h - 2 * face, 3);

          // The rails are the shutter's own: a gap of the pocket parts them from the outer frame.
          expect(e.y).toBeGreaterThan(opening.y);
          expect(e.y + e.h).toBeLessThan(opening.y + opening.h);
          // The end shutters stand off the jamb, so their stile is not taken for the frame.
          expect(e.x).toBeGreaterThan(opening.x);
          expect(e.x + e.w).toBeLessThan(opening.x + opening.w);

          // What is drawn over this shutter later (the shutters nearer the viewer).
          const front = edges.filter((o) => order.indexOf(o) > order.indexOf(edge)).map(box);
          const hidden = (x0: number, x1: number): number =>
            front.reduce((sum, f) => sum + covered(x0, x1, f.x, f.x + f.w), 0);
          const left = hidden(e.x, e.x + face);
          const right = hidden(e.x + e.w - face, e.x + e.w);
          // A stile is either in full view or wholly behind the front shutter's stile...
          for (const h of [left, right]) expect(h < 0.5 || h > face - 0.5).toBeTrue();
          // ...and never both: its far stile and most of both rails are in view. Only a shutter
          // that stands behind a neighbour on each side (the middle one of three on two tracks of
          // glass, T111) has both stiles behind theirs; its rails stay in view.
          const track = edge.getAttr('track') as number;
          const behindBoth =
            edges.filter((o) => Math.abs(o.getAttr('panelIndex') - index) === 1 && o.getAttr('track') < track)
              .length === 2;
          if (!behindBoth) expect(left < 0.5 || right < 0.5).toBeTrue();
          expect(hidden(e.x, e.x + e.w)).toBeLessThan(e.w * 0.5);
        }

        // Where two tracks meet, the outer one is in front and laps by one stile.
        const byIndex = [...edges].sort((a, b) => a.getAttr('panelIndex') - b.getAttr('panelIndex'));
        for (let i = 0; i < byIndex.length - 1; i++) {
          const [a, b] = [byIndex[i], byIndex[i + 1]];
          if (a.getAttr('track') === b.getAttr('track')) continue;
          const outer = a.getAttr('track') < b.getAttr('track') ? a : b;
          const inner = outer === a ? b : a;
          expect(order.indexOf(outer)).toBeGreaterThan(order.indexOf(inner));
          const face = members.find((m) => m.getAttr('panelIndex') === i)?.getAttr('facePx') as number;
          expect(a.x() + a.width() - b.x()).toBeGreaterThan(face - 0.5);
        }
      });
    }
  }
});

// The fly mesh is one more sash, in addition to the glass shutters (card T111):
// the glass closes the whole opening and the mesh slides over one shutter on a
// track of its own.
describe('the fly-mesh shutter is a full sash on its own track (T111)', () => {
  const WINDOWS: { name: string; tracks: TrackType; panels: number; glassTracks: number[]; lines: number; label: string }[] = [
    { name: '2.5 track, 2 panels', tracks: '2.5 Track', panels: 2, glassTracks: [0, 1], lines: 2, label: 'Fly mesh · half track' },
    { name: '3 track, 3 panels', tracks: '3 Track', panels: 3, glassTracks: [0, 1, 0], lines: 2, label: 'Fly mesh · track 3' },
    { name: '3 track, 4 panels', tracks: '3 Track', panels: 4, glassTracks: [0, 1, 1, 0], lines: 2, label: 'Fly mesh · track 3' },
    { name: '4 track, 4 panels', tracks: '4 Track', panels: 4, glassTracks: [0, 1, 1, 0], lines: 3, label: 'Fly mesh · track 4' },
  ];
  const STAGES: { name: string; w: number; h: number; legend: boolean }[] = [
    { name: 'the designer', w: 900, h: 640, legend: false },
    { name: 'a phone (390 wide)', w: 374, h: 320, legend: false },
    { name: 'the saved picture', w: PICTURE_WIDTH_PX, h: PICTURE_HEIGHT_PX, legend: true },
  ];

  for (const win of WINDOWS) {
    for (const st of STAGES) {
      it(`${win.name} on ${st.name}: glass in every shutter, the mesh a sash over the first`, () => {
        const layer = draw(slider(win.tracks, win.panels, true), st.w, st.h, st.legend);
        const opening = box(all(layer, 'slide-opening')[0]);
        const edges = [...(all(layer, 'slide-sash-edge') as Konva.Rect[])].sort(
          (a, b) => a.getAttr('panelIndex') - b.getAttr('panelIndex')
        );
        const glasses = [...all(layer, 'glass-pane'), ...all(layer, 'slide-glass')].map(box);

        // The glass shutters close the whole opening: one per panel, each with its glass,
        // from jamb to jamb with no gap between neighbours.
        expect(edges.length).toBe(win.panels);
        expect(glasses.length).toBe(win.panels);
        expect(edges[0].x() - opening.x).toBeLessThan(4);
        const last = edges[win.panels - 1];
        expect(opening.x + opening.w - (last.x() + last.width())).toBeLessThan(4);
        for (let k = 0; k < win.panels - 1; k++) {
          expect(edges[k].x() + edges[k].width()).toBeGreaterThanOrEqual(edges[k + 1].x() - 0.5);
        }
        // The glass runs on the tracks the mesh leaves it.
        expect(edges.map((e) => e.getAttr('track'))).toEqual(win.glassTracks);

        // One mesh sash, exactly the size of the glass shutter it is parked over.
        const meshEdges = all(layer, 'fly-mesh-sash-edge');
        expect(meshEdges.length).toBe(1);
        const m = box(meshEdges[0]);
        const first = box(edges[0]);
        expect(meshEdges[0].getAttr('over')).toBe(0);
        expect(m.x).toBeCloseTo(first.x, 3);
        expect(m.y).toBeCloseTo(first.y, 3);
        expect(m.w).toBeCloseTo(first.w, 3);
        expect(m.h).toBeCloseTo(first.h, 3);
        // It hides nothing: the glass shutter and its glass behind it stay in view.
        expect((meshEdges[0] as Konva.Rect).fill()).toBeFalsy();
        const under = glasses.find((g) => g.x > m.x && g.x + g.w < m.x + m.w) as Box;
        expect(under).toBeDefined();

        // Four mitred, outlined members of its own, slimmer than a glass sash, in another tone.
        const glassMembers = (all(layer, 'slide-sash-member') as Konva.Line[]).filter(
          (x) => x.getAttr('panelIndex') === 0
        );
        const glassFace = glassMembers[0].getAttr('facePx') as number;
        const members = all(layer, 'fly-mesh-sash-member') as Konva.Line[];
        expect(members.map((x) => x.getAttr('member')).sort()).toEqual(['bottom', 'left', 'right', 'top']);
        for (const piece of members) {
          expect(piece.points().length).toBe(8);
          expect(piece.closed()).toBeTrue();
          expect(piece.stroke()).toBeTruthy();
          expect(piece.getAttr('facePx')).toBeLessThan(glassFace);
          expect(piece.fill()).not.toBe(FRAME_COLOUR);
          for (const g of glassMembers) expect(piece.fill()).not.toBe(g.fill());
        }
        expect(all(layer, 'fly-mesh-hatch').length).toBe(1);
        expect((all(layer, 'fly-mesh-hatch')[0] as Konva.Shape).opacity()).toBeLessThan(1);

        // Its own pull on its own stile, on the side it leaves behind, clear of the glass shutter's lock.
        const pulls = all(layer, 'fly-mesh-handle');
        expect(pulls.length).toBe(1);
        const pull = box(pulls[0]);
        expect(pulls[0].getAttr('edge')).toBe('left');
        expect(pull.x).toBeGreaterThanOrEqual(m.x);
        expect(pull.x + pull.w).toBeLessThanOrEqual(m.x + (members[0].getAttr('facePx') as number) + 0.01);
        const lock = all(layer, 'slide-handle').find((h) => h.getAttr('panelIndex') === 0);
        if (lock) expect(pull.y).toBeGreaterThan(lock.y() + lock.height());

        // Its travel arrow inside it, away from the jamb it is parked at.
        const arrows = all(layer, 'fly-mesh-arrow') as Konva.Arrow[];
        expect(arrows.length).toBe(1);
        expect(arrows[0].getAttr('pointsRight')).toBeTrue();
        const pts = arrows[0].points();
        for (const x of [pts[0], pts[2]]) {
          expect(x).toBeGreaterThan(m.x);
          expect(x).toBeLessThan(m.x + m.w);
        }
        expect(pts[1]).toBeGreaterThan(m.y);
        expect(pts[1]).toBeLessThan(m.y + m.h / 2);

        // The sill: one line per glass track and one, dashed, for the mesh.
        expect(all(layer, 'track-line').length).toBe(win.lines);
        const meshLines = all(layer, 'track-line-mesh') as Konva.Line[];
        expect(meshLines.length).toBe(1);
        expect(meshLines[0].dash().length).toBeGreaterThan(0);
        expect(all(layer, 'fly-mesh')[0].getAttr('ownTrack')).toBeTrue();
      });
    }
  }

  it('is named with its track where there is room for the words', () => {
    for (const win of WINDOWS) {
      const layer = draw(slider(win.tracks, win.panels, true, 2400), 900, 640);
      expect(all(layer, 'fly-mesh-label')[0].getAttr('caption')).toBe(win.label);
    }
  });

  it('parked right, or seen from inside, it covers the other end shutter and travels the other way', () => {
    const d = slider('3 Track', 3, true);
    // One at a time: a new drawing takes the stage of the one before.
    const views = [() => draw(setSlideMesh(d, 'p1', true, 'Right'), 900, 640), () => draw(d, 900, 640, false, true)];
    for (const view of views) {
      const layer = view();
      const edges = all(layer, 'slide-sash-edge') as Konva.Rect[];
      const rightmost = edges.reduce((a, b) => (b.x() > a.x() ? b : a));
      const m = box(all(layer, 'fly-mesh-sash-edge')[0]);
      expect(m.x).toBeCloseTo(rightmost.x(), 3);
      expect(m.w).toBeCloseTo(rightmost.width(), 3);
      expect(all(layer, 'fly-mesh-arrow')[0].getAttr('pointsRight')).toBeFalse();
      expect(all(layer, 'fly-mesh-handle')[0].getAttr('edge')).toBe('right');
    }
  });

  it('without a mesh a 3 track keeps its three glass tracks; five shutters need them all', () => {
    const plain = draw(slider('3 Track', 3, false), 900, 640);
    expect(all(plain, 'track-line').length).toBe(3);
    expect(all(plain, 'track-line-mesh').length).toBe(0);
    expect(all(plain, 'fly-mesh').length).toBe(0);
    // Five glass shutters do not fit on two tracks: the mesh shares the innermost one.
    const five = draw(slider('3 Track', 5, true), 900, 640);
    expect(all(five, 'track-line').length).toBe(3);
    expect(all(five, 'fly-mesh')[0].getAttr('ownTrack')).toBeFalse();
  });
});
