// A sliding shutter with glass is a complete sash (card T110): two stiles and
// two rails that can each be seen, the glass inside them, and at a lap the
// front shutter's stile over the one behind. These specs pin the renderer's
// output for the desktop drawing, the phone drawing and the saved picture.
import Konva from 'konva';
import { TrackType, WindowDesign, createDesign, createLeaf, equalPanels, layout, setSlide } from '../design-model';
import { PICTURE_HEIGHT_PX, PICTURE_WIDTH_PX } from './canvas-export';
import { renderDesign } from './canvas-renderer';
import { computeView } from './canvas-view';

const FACE = 60;
const FRAME_COLOUR = '#ffffff';
let stage: Konva.Stage | null = null;

function slider(tracks: TrackType, panels: number, mesh: boolean): WindowDesign {
  const d = createDesign({
    frame: { widthMm: 1500, heightMm: 1200 },
    glazing: { glassId: 1 },
    root: createLeaf('p1', {}),
  });
  return setSlide(d, 'p1', { tracks, mesh, panels: equalPanels(panels, 1500 - 2 * FACE, 0, tracks) });
}

function draw(design: WindowDesign, w: number, h: number, legend = false): Konva.Layer {
  stage?.destroy();
  stage = new Konva.Stage({ container: document.createElement('div'), width: w, height: h, listening: false });
  const layer = new Konva.Layer({ listening: false });
  stage.add(layer);
  renderDesign(
    layer,
    design,
    layout(design, { frameFaceMm: FACE }),
    computeView(w, h, design.frame.widthMm, design.frame.heightMm, 1, 0, 0),
    { selection: null, showFrameHandle: false },
    { stageWPx: w, stageHPx: h, frameFaceMm: FACE, profileColor: FRAME_COLOUR, legend }
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
          // ...and never both: its far stile and most of both rails are in view.
          expect(left < 0.5 || right < 0.5).toBeTrue();
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

  it('the mesh shutter still sits inside the bands of the glass shutter it is parked with', () => {
    const layer = draw(slider('3 Track', 3, true), 900, 640);
    const frame = box(all(layer, 'fly-mesh-frame')[0]);
    const first = box(all(layer, 'slide-sash-edge').find((e) => e.getAttr('panelIndex') === 0) as Konva.Node);
    expect(frame.x).toBeGreaterThan(first.x);
    expect(frame.y).toBeGreaterThan(first.y);
    expect(frame.y + frame.h).toBeLessThan(first.y + first.h);
  });
});
