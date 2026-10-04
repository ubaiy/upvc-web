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
  return setSlide(d, 'p1', { tracks, mesh, panels: equalPanels(panels, widthMm - 2 * FACE) });
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
}

export interface DesignThumb {
  /** viewBox width for a height of 100. */
  width: number;
  panes: ThumbPane[];
}

/** A schematic picture of a design for the starting row (not the real drawing). */
export function thumbOf(design: WindowDesign): DesignThumb {
  const { widthMm, heightMm } = design.frame;
  const panes: ThumbPane[] = [];
  for (const { leaf, rect } of layout(design, { frameFaceMm: FACE }).leaves) {
    const base = { y: rect.yMm / heightMm, h: rect.hMm / heightMm };
    if (leaf.category === 'Slidding' && leaf.slide) {
      const n = leaf.slide.panels.length;
      for (let i = 0; i < n; i++) {
        panes.push({
          ...base,
          x: (rect.xMm + (rect.wMm * i) / n) / widthMm,
          w: rect.wMm / n / widthMm,
          kind: 'sliding',
        });
      }
    } else {
      panes.push({
        ...base,
        x: rect.xMm / widthMm,
        w: rect.wMm / widthMm,
        kind: leaf.casementType === 'Openable' ? 'openable' : 'fixed',
      });
    }
  }
  return { width: Math.round((widthMm / heightMm) * 100), panes };
}
