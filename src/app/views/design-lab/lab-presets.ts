/**
 * Design Lab — built-in presets, one per window type the canvas draws.
 *
 * Id vocabulary of designer-architecture §1: casement frame product 8,
 * sliding 23, sash 12/31, mullion profile 55, colour 4, glass 1, handles
 * 3/5. Rebuilt here (not imported from the design-model test fixtures)
 * because the fixtures module is test-only.
 */

import {
  LeafSpecPatch,
  WindowDesign,
  addDoorSideLight,
  addDoorTopLight,
  createDesign,
  createLeaf,
  makeDoor,
  setFrameShape,
  setLeafSpec,
  setSlide,
  setSlideMesh,
  setSlidePanel,
  setSlidePanelCount,
  setSlideTracks,
  splitPane,
  splitPaneEqualSash,
} from 'src/app/shared/design-model';
import { GlassTints } from 'src/app/shared/design-canvas/canvas-renderer';
import {
  ColorOption,
  GlassOption,
} from 'src/app/shared/design-canvas/design-inspector.component';

export type PresetGroup = 'Casement' | 'Sliding' | 'Door' | 'Shaped';

export interface LabPreset {
  key: string;
  label: string;
  group: PresetGroup;
  tags: string[];
  build: () => WindowDesign;
}

export const PRESET_GROUPS: PresetGroup[] = ['Casement', 'Sliding', 'Door', 'Shaped'];

const MULLION = { dividerProfileId: 55, dividerFaceMm: 60 };
const DOOR_HARDWARE = { sashId: 12, handleId: 3, hingesType: '3D Hinges' };

function casement(widthMm: number, heightMm: number): WindowDesign {
  return createDesign({
    frame: { widthMm, heightMm, productId: 8, colorId: 4 },
    glazing: { glassId: 1 },
  });
}

/** 2-track, 2-panel slider; daylight width = frame − 2 × 60 mm face. */
function slider(widthMm: number, heightMm: number): WindowDesign {
  const base = createDesign({
    frame: { widthMm, heightMm, productId: 23, colorId: 4 },
    glazing: { glassId: 1 },
    root: createLeaf('p1', { sashId: 31 }),
  });
  const half = (widthMm - 120) / 2;
  return setSlide(base, 'p1', {
    tracks: '2 Track',
    mesh: false,
    panels: [
      { widthMm: half, direction: 'Left' },
      { widthMm: half, direction: 'Right' },
    ],
  });
}

function openable(direction: string): LeafSpecPatch {
  return {
    casementType: 'Openable',
    sashId: 12,
    opening: { direction, handleId: 3, hingesType: 'Friction' },
  };
}

export const LAB_PRESETS: LabPreset[] = [
  {
    key: 'single-fixed',
    label: 'Single fixed',
    group: 'Casement',
    tags: ['fixed'],
    build: () => casement(1500, 1200),
  },
  {
    key: 'two-sash-casement',
    label: '2-sash casement',
    group: 'Casement',
    tags: ['casement'],
    build: () => {
      const base = createDesign({
        frame: { widthMm: 1500, heightMm: 1200, productId: 8, colorId: 4 },
        glazing: { glassId: 1 },
        root: createLeaf('p1', {
          casementType: 'Openable',
          sashId: 12,
          opening: { direction: 'Left', handleId: 3, hingesType: 'Friction' },
        }),
      });
      return splitPaneEqualSash(base, 'p1', 2);
    },
  },
  {
    key: 'mixed-mullion-transom',
    label: 'Mixed mullion + transom',
    group: 'Casement',
    tags: ['casement', 'awning'],
    build: () => {
      let d = casement(2400, 1380);
      d = splitPane(d, 'p1', 'x', 900, MULLION);
      d = splitPane(d, 'p3', 'y', 600, MULLION);
      return setLeafSpec(d, 'p4', {
        casementType: 'Openable',
        sashId: 12,
        opening: { direction: 'Top', handleId: 5, hingesType: 'Friction' },
      });
    },
  },
  {
    key: 'tilt-turn',
    label: 'Tilt & turn',
    group: 'Casement',
    tags: ['tilt-turn'],
    build: () => setLeafSpec(casement(1000, 1400), 'p1', openable('Tilt & Turn Left')),
  },
  {
    key: 'opening-symbols',
    label: 'All opening symbols',
    group: 'Casement',
    tags: ['symbols'],
    build: () => {
      // Left, right, top-hung, bottom-hung, tilt & turn, side by side.
      let d = casement(3360, 1300);
      const leaves: string[] = [];
      let rest = 'p1';
      for (let i = 0; i < 4; i++) {
        d = splitPane(d, rest, 'x', 618, MULLION);
        const n = 2 * (i + 1);
        leaves.push(`p${n}`);
        rest = `p${n + 1}`;
      }
      leaves.push(rest);
      const dirs = ['Left', 'Right', 'Top', 'Bottom', 'Tilt & Turn Right'];
      leaves.forEach((id, i) => (d = setLeafSpec(d, id, openable(dirs[i]))));
      return d;
    },
  },
  {
    key: 'sliding-2-track',
    label: '2-track sliding',
    group: 'Sliding',
    tags: ['sliding'],
    build: () => slider(1800, 1380),
  },
  {
    key: 'sliding-2-track-4-panel',
    label: '2-track, 4 pallas, fixed ends',
    group: 'Sliding',
    tags: ['sliding', 'fixed'],
    build: () => {
      let d = slider(3000, 1500);
      d = setSlidePanelCount(d, 'p1', 4, 2880, { interlockMm: 40 });
      d = setSlidePanel(d, 'p1', 0, { fixed: true });
      d = setSlidePanel(d, 'p1', 3, { fixed: true });
      d = setSlidePanel(d, 'p1', 1, { direction: 'Left' });
      return setSlidePanel(d, 'p1', 2, { direction: 'Right' });
    },
  },
  {
    key: 'sliding-2-5-track-mesh',
    label: '2.5-track + fly mesh',
    group: 'Sliding',
    tags: ['sliding', 'mesh'],
    build: () => {
      const d = setSlideTracks(slider(1800, 1380), 'p1', '2.5 Track', 1680);
      return setSlideMesh(d, 'p1', true, 'Right');
    },
  },
  {
    key: 'sliding-3-track-mesh',
    label: '3-track sliding + mesh',
    group: 'Sliding',
    tags: ['sliding', 'mesh'],
    build: () => {
      const base = createDesign({
        frame: { widthMm: 2400, heightMm: 1380, productId: 23, colorId: 4 },
        glazing: { glassId: 1 },
        root: createLeaf('p1', { sashId: 31 }),
      });
      return setSlide(base, 'p1', {
        tracks: '3 Track',
        mesh: true,
        panels: [
          { widthMm: 760, direction: 'Left' },
          { widthMm: 760, direction: 'Left' },
          { widthMm: 760, direction: 'Right' },
        ],
      });
    },
  },
  {
    key: 'door-single',
    label: 'Single door',
    group: 'Door',
    tags: ['door'],
    build: () =>
      makeDoor(casement(950, 2100), 'p1', {
        leaves: 1,
        openingSide: 'Left',
        swing: 'In',
        threshold: 'Low',
        ...DOOR_HARDWARE,
      }),
  },
  {
    key: 'door-double-top-light',
    label: 'Double door + top light',
    group: 'Door',
    tags: ['door', 'french'],
    build: () => {
      const d = makeDoor(casement(1800, 2400), 'p1', {
        leaves: 2,
        swing: 'Out',
        threshold: 'Standard',
        ...DOOR_HARDWARE,
      });
      return addDoorTopLight(d, 300, MULLION);
    },
  },
  {
    key: 'door-side-light',
    label: 'Door + side light',
    group: 'Door',
    tags: ['door'],
    build: () => {
      const d = makeDoor(casement(1500, 2100), 'p1', {
        leaves: 1,
        openingSide: 'Right',
        swing: 'Out',
        threshold: 'None',
        ...DOOR_HARDWARE,
      });
      return addDoorSideLight(d, 'left', 400, MULLION);
    },
  },
  {
    key: 'shape-arch',
    label: 'Arch top (segmental)',
    group: 'Shaped',
    tags: ['arch'],
    build: () => setFrameShape(casement(2000, 1500), { kind: 'arch-top', riseMm: 500 }),
  },
  {
    key: 'shape-arch-semicircle',
    label: 'Semicircular arch + mullion',
    group: 'Shaped',
    tags: ['arch'],
    build: () => {
      const d = splitPane(casement(1600, 1800), 'p1', 'x', 740, MULLION);
      return setFrameShape(d, { kind: 'arch-top', riseMm: 800 });
    },
  },
  {
    key: 'shape-circle',
    label: 'Circle',
    group: 'Shaped',
    tags: ['circle'],
    build: () => setFrameShape(casement(1200, 1200), { kind: 'circle' }),
  },
  {
    key: 'shape-triangle',
    label: 'Triangle',
    group: 'Shaped',
    tags: ['triangle'],
    build: () =>
      setFrameShape(casement(1800, 1200), { kind: 'triangle', apex: 'isosceles' }),
  },
  {
    key: 'shape-trapezoid',
    label: 'Trapezoid',
    group: 'Shaped',
    tags: ['trapezoid'],
    build: () =>
      setFrameShape(casement(1800, 1500), {
        kind: 'trapezoid',
        leftHeightMm: 1500,
        rightHeightMm: 900,
      }),
  },
];

/** Demo glass master: ids are lab-only; a real host passes its own. */
export const LAB_GLASS: (GlassOption & { tint: string })[] = [
  { id: 1, label: 'Clear 5 mm', tint: '#c4e4f1' },
  { id: 2, label: 'Bronze tinted', tint: '#c9a27a' },
  { id: 3, label: 'Grey tinted', tint: '#9aa3ad' },
  { id: 4, label: 'Green tinted', tint: '#9fd3b4' },
  { id: 5, label: 'Blue reflective', tint: '#6fa8dc' },
  { id: 6, label: 'Frosted', tint: '#e8eef2' },
];

export const LAB_GLASS_TINTS: GlassTints = Object.fromEntries(
  LAB_GLASS.map((g) => [String(g.id), g.tint])
);

export const LAB_COLORS: ColorOption[] = [
  { label: 'White', hex: '#ffffff' },
  { label: 'Anthracite grey', hex: '#3c4044' },
  { label: 'Golden oak', hex: '#b5782e' },
  { label: 'Walnut', hex: '#5e3b23' },
];
