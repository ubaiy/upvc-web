/**
 * The row of starting designs shown when a window is added: the common
 * windows a fabricator quotes, so a new item is "pick a design, type the
 * size" instead of drawing from an empty rectangle.
 *
 * The designs carry no catalogue ids; completeDesign fills them in.
 */

import {
  WindowDesign,
  addDoorTopLight,
  createDesign,
  equalPanels,
  layout,
  makeDoor,
  setFrameShape,
  setLeafSpec,
  setSlide,
  slideLayout,
  splitPane,
  splitPaneEqualSash,
  walkLeaves,
} from 'src/app/shared/design-model';

export interface StartingDesign {
  key: string;
  label: string;
  /** True: placed at its own size (a door is not a window-sized thing). */
  ownSize: boolean;
  build: () => WindowDesign;
}

const FACE = 60;

function blank(widthMm = 1500, heightMm = 1200): WindowDesign {
  return createDesign({ frame: { widthMm, heightMm } });
}

function openable(d: WindowDesign, id: string, direction = 'Left'): WindowDesign {
  return setLeafSpec(d, id, {
    category: 'Casement',
    casementType: 'Openable',
    opening: { direction, handleId: null, hingesType: null },
  });
}

function slider(tracks: '2 Track' | '3 Track', panels: number, mesh: boolean): WindowDesign {
  const widthMm = panels > 2 ? 2400 : 1800;
  const d = blank(widthMm, 1200);
  return setSlide(d, 'p1', { tracks, mesh, panels: equalPanels(panels, widthMm - 2 * FACE, 0, tracks) });
}

export const STARTING_DESIGNS: StartingDesign[] = [
  { key: 'fixed', label: 'Fixed', ownSize: false, build: () => blank() },
  {
    key: 'casement-1',
    label: 'Casement',
    ownSize: false,
    build: () => openable(blank(900, 1200), 'p1'),
  },
  {
    key: 'casement-2',
    label: '2-sash casement',
    ownSize: false,
    build: () => splitPaneEqualSash(openable(blank(), 'p1'), 'p1', 2),
  },
  {
    key: 'slider-2',
    label: '2-track slider',
    ownSize: false,
    build: () => slider('2 Track', 2, false),
  },
  {
    key: 'slider-3',
    label: '3-track slider with mesh',
    ownSize: false,
    build: () => slider('3 Track', 3, true),
  },
  {
    key: 'top-light',
    label: 'Casement with top light',
    ownSize: false,
    build: () => {
      // Fixed light above, two opening sashes below.
      let d = splitPane(blank(1500, 1500), 'p1', 'y', 380, { dividerFaceMm: FACE });
      const lower = walkLeaves(d.root)[1];
      d = openable(d, lower.id);
      return splitPaneEqualSash(d, lower.id, 2);
    },
  },
  {
    key: 'fixed-open',
    label: 'Fixed and opening',
    ownSize: false,
    build: () => {
      let d = splitPane(blank(), 'p1', 'x', 690, { dividerFaceMm: FACE });
      d = openable(d, walkLeaves(d.root)[1].id, 'Right');
      return d;
    },
  },
  {
    key: 'door',
    label: 'Door',
    ownSize: true,
    build: () => makeDoor(blank(1000, 2100), 'p1', { leaves: 1, swing: 'In', threshold: 'Standard' }),
  },
  {
    key: 'door-top-light',
    label: 'Double door with top light',
    ownSize: true,
    build: () =>
      addDoorTopLight(
        makeDoor(blank(1800, 2400), 'p1', { leaves: 2, swing: 'Out', threshold: 'Low' }),
        300,
        { dividerFaceMm: FACE }
      ),
  },
  {
    key: 'arch',
    label: 'Arch top',
    ownSize: false,
    build: () => setFrameShape(blank(1200, 1500), { kind: 'arch-top', riseMm: 400 }),
  },
];

/** One pane of a starting design's small picture, in 0..1 of the frame. */
export interface ThumbPane {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'fixed' | 'openable' | 'sliding';
  /** The glass inside a sash, in viewBox units (a fixed pane is all glass). */
  glass?: { x: number; y: number; w: number; h: number };
  /** Opening triangle or slide arrow, an SVG path in viewBox units. */
  mark?: string;
  /** Fly-mesh hatch, an SVG path in viewBox units. */
  mesh?: string;
}

export interface DesignThumb {
  /** viewBox width for a height of 100. */
  width: number;
  panes: ThumbPane[];
}

/** Sash band of a thumbnail, in viewBox units. */
const THUMB_SASH = 6;

const n1 = (v: number): number => Math.round(v * 10) / 10;

/** Triangle with its point on the hinge side of `g`. */
function triangle(g: { x: number; y: number; w: number; h: number }, direction: string): string {
  const d = direction.toLowerCase();
  const { x, y, w, h } = g;
  const p = (px: number, py: number): string => `${n1(px)} ${n1(py)}`;
  if (d === 'top') return `M${p(x, y + h)} L${p(x + w / 2, y)} L${p(x + w, y + h)}`;
  if (d === 'bottom') return `M${p(x, y)} L${p(x + w / 2, y + h)} L${p(x + w, y)}`;
  if (d.includes('right')) return `M${p(x, y)} L${p(x + w, y + h / 2)} L${p(x, y + h)}`;
  return `M${p(x + w, y)} L${p(x, y + h / 2)} L${p(x + w, y + h)}`;
}

/** Arrow with a head, across the middle of `g`. */
function arrow(g: { x: number; y: number; w: number; h: number }, right: boolean): string {
  const cy = n1(g.y + g.h / 2);
  const a = n1(g.x + g.w * 0.2);
  const b = n1(g.x + g.w * 0.8);
  const [tail, tip, back] = right ? [a, b, n1(b - 7)] : [b, a, n1(a + 7)];
  return `M${tail} ${cy} L${tip} ${cy} M${back} ${n1(cy - 5)} L${tip} ${cy} L${back} ${n1(cy + 5)}`;
}

function hatch(g: { x: number; y: number; w: number; h: number }): string {
  let d = '';
  for (let x = g.x + 4; x < g.x + g.w; x += 4) d += `M${n1(x)} ${n1(g.y)} V${n1(g.y + g.h)} `;
  for (let y = g.y + 4; y < g.y + g.h; y += 4) d += `M${n1(g.x)} ${n1(y)} H${n1(g.x + g.w)} `;
  return d.trim();
}

/**
 * A small picture of a design for the starting row. It follows the drawing:
 * a sash is a band round its glass, a triangle points at the hinges, a
 * shutter laps its neighbour and carries its arrow, the mesh is hatched.
 */
export function thumbOf(design: WindowDesign): DesignThumb {
  const { widthMm, heightMm } = design.frame;
  const width = Math.round((widthMm / heightMm) * 100);
  const panes: ThumbPane[] = [];
  const inset = (r: { x: number; y: number; w: number; h: number }) => ({
    x: n1(r.x * width + THUMB_SASH),
    y: n1(r.y * 100 + THUMB_SASH),
    w: n1(Math.max(2, r.w * width - 2 * THUMB_SASH)),
    h: n1(Math.max(2, r.h * 100 - 2 * THUMB_SASH)),
  });
  for (const { leaf, rect } of layout(design, { frameFaceMm: FACE }).leaves) {
    const base = { y: rect.yMm / heightMm, h: rect.hMm / heightMm };
    if (leaf.category === 'Slidding' && leaf.slide) {
      const slide = leaf.slide;
      const sl = slideLayout(slide, rect.wMm);
      // Shutters on different tracks lap by a sliver, the outer track on top.
      const lap = 0.012;
      const drawn = [...sl.panels].sort((p, q) => q.track - p.track);
      for (const panel of drawn) {
        const before = panel.index > 0 && sl.panels[panel.index - 1].track !== panel.track;
        const after =
          panel.index < sl.panels.length - 1 && sl.panels[panel.index + 1].track !== panel.track;
        const x = (rect.xMm + panel.xMm) / widthMm - (before ? lap : 0);
        const w = panel.widthMm / widthMm + (before ? lap : 0) + (after ? lap : 0);
        const pane: ThumbPane = { ...base, x, w, kind: 'sliding' };
        pane.glass = inset(pane);
        if (!panel.fixed) pane.mark = arrow(pane.glass, panel.direction === 'Right');
        const meshHere =
          sl.mesh && (sl.mesh.position === 'Left' ? panel.index === 0 : panel.index === sl.panels.length - 1);
        if (meshHere) pane.mesh = hatch(pane.glass);
        panes.push(pane);
      }
    } else {
      const pane: ThumbPane = {
        ...base,
        x: rect.xMm / widthMm,
        w: rect.wMm / widthMm,
        kind: leaf.casementType === 'Openable' ? 'openable' : 'fixed',
      };
      if (pane.kind === 'openable') {
        pane.glass = inset(pane);
        pane.mark = triangle(pane.glass, leaf.opening?.direction ?? 'Left');
      }
      panes.push(pane);
    }
  }
  return { width, panes };
}
