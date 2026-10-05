/**
 * design-model sliding systems (Phase 2 item 2.1, model level).
 *
 * A sliding leaf's panels are NOT geometric splits — they overlap on
 * tracks. This module is the one place that knows:
 *  - which TRACK each panel runs on (deterministic mirror assignment);
 *  - where panels sit horizontally once overlaps are applied
 *    (slideLayout — what the renderer draws and dimension labels read);
 *  - where the interlocks (overlap bands) are;
 *  - where the fly-mesh panel sits;
 *  - which track/panel-count combinations are valid.
 *
 * Pure TS, same op contract as operations.ts: every mutation returns a new
 * immutable document.
 */

import { MIN_PANE_MM } from './geometry';
import {
  DesignError,
  LeafNode,
  SlidePanel,
  SlideSpec,
  TrackType,
  WindowDesign,
  findNode,
  isLeaf,
} from './types';
import { setSlide } from './leaf-ops';

/** Physical track count per track type (2.5 = 2 shutter tracks + mesh half-track). */
export const TRACK_COUNTS: Record<TrackType, number> = {
  '2 Track': 2,
  '2.5 Track': 2,
  '3 Track': 3,
  '4 Track': 4,
};

/** Track types on which the legacy screen offers a fly mesh. */
export const MESH_TRACKS: TrackType[] = ['2.5 Track', '3 Track', '4 Track'];

/**
 * Panel counts a track system can carry: from the shutter-track count up
 * to two panels per track (e.g. 2-track: 2–4 panels; 3-track: 3–6).
 */
export function allowedPanelCounts(tracks: TrackType): number[] {
  const n = TRACK_COUNTS[tracks];
  const out: number[] = [];
  for (let c = n; c <= 2 * n; c++) out.push(c);
  return out;
}

/**
 * Deterministic track assignment (0 = outermost track) for panel `index`
 * of `count` panels: mirrored from both ends so the outer panels run on
 * the outer track and panels meet at interlocks mid-run.
 *   2 Track, 2 panels → [0, 1];   2 Track, 4 panels → [0, 1, 1, 0];
 *   3 Track, 3 panels → [0, 1, 2]; 3 Track, 6 panels → [0, 1, 2, 2, 1, 0].
 */
export function trackOf(tracks: TrackType, count: number, index: number): number {
  if (index < 0 || index >= count) {
    throw new DesignError(`panel index ${index} out of range 0..${count - 1}`);
  }
  const trackCount = TRACK_COUNTS[tracks];
  // One panel per track: panel i runs on track i. More panels than
  // tracks: mirrored from both ends so the outer panels take the outer
  // track and pairs meet at interlocks mid-run.
  if (count <= trackCount) return index;
  return Math.min(index, count - 1 - index, trackCount - 1);
}

/**
 * Validate a slide spec against its leaf's daylight width. Returns
 * human-readable problems (empty = valid). Mirrors checkInvariants style.
 */
export function validateSlide(
  slide: SlideSpec,
  daylightWMm?: number
): string[] {
  const problems: string[] = [];
  const n = slide.panels.length;
  const counts = allowedPanelCounts(slide.tracks);
  if (!counts.includes(n)) {
    problems.push(
      `${slide.tracks} carries ${counts.join('/')} panels, got ${n}`
    );
  }
  if (slide.mesh && !MESH_TRACKS.includes(slide.tracks)) {
    problems.push(`fly mesh needs ${MESH_TRACKS.join(' or ')}, got ${slide.tracks}`);
  }
  if (slide.panels.some((p) => !(p.widthMm > 0))) {
    problems.push('every panel needs a positive widthMm');
  }
  if (slide.panels.every((p) => p.fixed)) {
    problems.push('at least one panel must be moving');
  }
  if (slide.interlockMm !== undefined && !(slide.interlockMm >= 0)) {
    problems.push(`interlockMm ${slide.interlockMm} must be >= 0`);
  }
  if (daylightWMm !== undefined) {
    const sum = slide.panels.reduce((a, p) => a + p.widthMm, 0);
    if (sum < daylightWMm - 0.5) {
      problems.push(`panels sum ${sum} < daylight ${daylightWMm}`);
    }
  }
  return problems;
}

/** One panel's resolved geometry inside its leaf's daylight. */
export interface SlidePanelLayout {
  index: number;
  /** Left edge in mm from the leaf's daylight left edge. */
  xMm: number;
  widthMm: number;
  /** 0 = outermost track. */
  track: number;
  direction: 'Left' | 'Right';
  fixed: boolean;
}

/** An interlock: the overlap band between two adjacent panels. */
export interface InterlockLayout {
  /** Left edge of the overlap band, mm from the daylight left edge. */
  xMm: number;
  widthMm: number;
  /** The two panel indexes that meet here. */
  panels: [number, number];
}

export interface MeshLayout {
  xMm: number;
  widthMm: number;
  position: 'Left' | 'Right';
}

export interface SlideLayout {
  panels: SlidePanelLayout[];
  interlocks: InterlockLayout[];
  /** Present when slide.mesh is true. */
  mesh?: MeshLayout;
  /** The overlap actually applied at each interlock. */
  overlapMm: number;
}

/**
 * Resolve panel/interlock/mesh geometry for a sliding leaf within
 * `daylightWMm` (the leaf's daylight width from layout()).
 *
 * Overlap: `slide.interlockMm` when set; otherwise derived from stored
 * widths — (sum(widths) − daylight) / (n − 1), floored at 0 — so
 * equal-split zero-overlap panels tile the daylight exactly and the panel
 * x-positions always span the full daylight: x_i = Σw_j(j<i) − i·overlap.
 */
export function slideLayout(
  slide: SlideSpec,
  daylightWMm: number
): SlideLayout {
  const n = slide.panels.length;
  const sum = slide.panels.reduce((a, p) => a + p.widthMm, 0);
  const overlap =
    slide.interlockMm !== undefined
      ? slide.interlockMm
      : n > 1
        ? Math.max(0, (sum - daylightWMm) / (n - 1))
        : 0;

  const panels: SlidePanelLayout[] = [];
  const interlocks: InterlockLayout[] = [];
  let x = 0;
  slide.panels.forEach((p, i) => {
    panels.push({
      index: i,
      xMm: x,
      widthMm: p.widthMm,
      track: trackOf(slide.tracks, n, i),
      direction: p.direction,
      fixed: p.fixed === true,
    });
    if (i < n - 1) {
      interlocks.push({
        xMm: x + p.widthMm - overlap,
        widthMm: overlap,
        panels: [i, i + 1],
      });
    }
    x += p.widthMm - overlap;
  });

  const out: SlideLayout = { panels, interlocks, overlapMm: overlap };
  if (slide.mesh) {
    const position = slide.meshPosition ?? 'Left';
    // The mesh shutter is as wide as one panel: half of a 2-panel window, a third of a 3-panel one.
    const widthMm = daylightWMm / Math.max(2, slide.panels.length);
    out.mesh = {
      xMm: position === 'Left' ? 0 : daylightWMm - widthMm,
      widthMm,
      position,
    };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Operations                                                          */
/* ------------------------------------------------------------------ */

function mustSlidingLeaf(design: WindowDesign, paneId: string): LeafNode {
  const node = findNode(design.root, paneId);
  if (!node) throw new DesignError(`no node with id '${paneId}'`);
  if (!isLeaf(node) || node.category !== 'Slidding' || !node.slide) {
    throw new DesignError(`node '${paneId}' is not a sliding leaf`);
  }
  return node;
}

function withSlide(
  design: WindowDesign,
  paneId: string,
  slide: SlideSpec
): WindowDesign {
  // The track/panel-count rule is enforced by setSlideTracks /
  // setSlidePanelCount (which re-seed panels); width/direction/mesh
  // patches must keep working on legacy-imported nonstandard counts.
  const problems = validateSlide(slide).filter(
    (p) => !p.includes('carries')
  );
  if (problems.length) {
    throw new DesignError(`invalid slide spec: ${problems.join('; ')}`);
  }
  let next = setSlide(design, paneId, slide);
  // setSlide copies only the core SlideSpec fields; carry the Phase 2
  // optionals across explicitly (additive to the Phase 1 writer).
  const written = findNode(next.root, paneId) as LeafNode;
  const extras: Partial<SlideSpec> = {};
  if (slide.meshPosition !== undefined) extras.meshPosition = slide.meshPosition;
  if (slide.interlockMm !== undefined) extras.interlockMm = slide.interlockMm;
  if (Object.keys(extras).length) {
    next = {
      ...next,
      root: replaceSlide(next.root, paneId, {
        ...(written.slide as SlideSpec),
        ...extras,
      }),
    };
  }
  return next;
}

function replaceSlide(
  node: WindowDesign['root'],
  paneId: string,
  slide: SlideSpec
): WindowDesign['root'] {
  if (node.id === paneId && isLeaf(node)) return { ...node, slide };
  if (isLeaf(node)) return node;
  let changed = false;
  const children = node.children.map((c) => {
    const next = replaceSlide(c, paneId, slide);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...node, children } : node;
}

/**
 * The way panel `index` can travel. A shutter passes a neighbour only when
 * that neighbour runs on another track, and never passes the jamb: the left
 * end shutter opens to the right, the right end one to the left. A shutter
 * free on both sides (the middle one of three on three tracks) opens Left.
 */
export function slideDirectionOf(
  tracks: TrackType,
  count: number,
  index: number
): 'Left' | 'Right' {
  const own = trackOf(tracks, count, index);
  const left = index > 0 && trackOf(tracks, count, index - 1) !== own;
  const right = index < count - 1 && trackOf(tracks, count, index + 1) !== own;
  if (left === right) return index === 0 && count > 1 ? 'Right' : 'Left';
  return left ? 'Left' : 'Right';
}

/**
 * Equal panels. With `tracks` each panel gets the direction it can really
 * travel ({@link slideDirectionOf}): what a new slider is seeded with.
 * Without it the legacy seeding is kept (first half Left, second half
 * Right; 3 panels = L/L/R, worked example A).
 */
export function equalPanels(
  count: number,
  daylightWMm: number,
  interlockMm = 0,
  tracks?: TrackType
): SlidePanel[] {
  const widthMm = (daylightWMm + (count - 1) * interlockMm) / count;
  const panels: SlidePanel[] = [];
  for (let i = 0; i < count; i++) {
    panels.push({
      widthMm,
      direction: tracks
        ? slideDirectionOf(tracks, count, i)
        : i < Math.ceil(count / 2)
          ? 'Left'
          : 'Right',
    });
  }
  return panels;
}

export interface SlideSetupOptions {
  meshPosition?: 'Left' | 'Right';
  interlockMm?: number;
}

/**
 * Change the track system of a sliding leaf. When the current panel count
 * is not valid for the new system the panels are re-seeded equal at the
 * nearest allowed count; otherwise panels are kept as-is. Mesh is dropped
 * (with the position) when the new system cannot carry one.
 */
export function setSlideTracks(
  design: WindowDesign,
  paneId: string,
  tracks: TrackType,
  daylightWMm: number,
  opts?: SlideSetupOptions
): WindowDesign {
  const leaf = mustSlidingLeaf(design, paneId);
  const cur = leaf.slide as SlideSpec;
  const counts = allowedPanelCounts(tracks);
  let panels = cur.panels;
  if (!counts.includes(panels.length)) {
    const count = counts.reduce((best, c) =>
      Math.abs(c - panels.length) < Math.abs(best - panels.length) ? c : best
    );
    panels = equalPanels(count, daylightWMm, opts?.interlockMm ?? cur.interlockMm ?? 0, tracks);
  }
  const mesh = cur.mesh && MESH_TRACKS.includes(tracks);
  const slide: SlideSpec = { ...cur, tracks, mesh, panels };
  if (!mesh) delete slide.meshPosition;
  if (opts?.interlockMm !== undefined) slide.interlockMm = opts.interlockMm;
  if (opts?.meshPosition !== undefined && mesh) slide.meshPosition = opts.meshPosition;
  return withSlide(design, paneId, slide);
}

/** Re-seed a sliding leaf with `count` equal panels (legacy directions). */
export function setSlidePanelCount(
  design: WindowDesign,
  paneId: string,
  count: number,
  daylightWMm: number,
  opts?: SlideSetupOptions
): WindowDesign {
  const leaf = mustSlidingLeaf(design, paneId);
  const cur = leaf.slide as SlideSpec;
  const interlockMm = opts?.interlockMm ?? cur.interlockMm ?? 0;
  const slide: SlideSpec = {
    ...cur,
    panels: equalPanels(count, daylightWMm, interlockMm, cur.tracks),
  };
  if (opts?.interlockMm !== undefined) slide.interlockMm = opts.interlockMm;
  return withSlide(design, paneId, slide);
}

/** Toggle the fly mesh (and optionally place it). */
export function setSlideMesh(
  design: WindowDesign,
  paneId: string,
  mesh: boolean,
  position?: 'Left' | 'Right'
): WindowDesign {
  const leaf = mustSlidingLeaf(design, paneId);
  const slide: SlideSpec = { ...(leaf.slide as SlideSpec), mesh };
  if (!mesh) delete slide.meshPosition;
  else if (position !== undefined) slide.meshPosition = position;
  return withSlide(design, paneId, slide);
}

/** Patch one panel's direction / fixed flag. */
export function setSlidePanel(
  design: WindowDesign,
  paneId: string,
  index: number,
  patch: Partial<Pick<SlidePanel, 'direction' | 'fixed'>>
): WindowDesign {
  const leaf = mustSlidingLeaf(design, paneId);
  const cur = leaf.slide as SlideSpec;
  if (index < 0 || index >= cur.panels.length) {
    throw new DesignError(`sliding leaf '${paneId}' has no panel ${index}`);
  }
  const panels = cur.panels.map((p, i) => {
    if (i !== index) return p;
    const next: SlidePanel = { ...p, ...patch };
    if (next.fixed !== true) delete next.fixed;
    return next;
  });
  return withSlide(design, paneId, { ...cur, panels });
}

/**
 * Typed exact panel width: sets panel `index` to `widthMm` and gives the
 * difference to its right neighbour (the left neighbour for the last
 * panel), clamped so both panels keep `minPanelMm`. The panel-width sum —
 * and therefore the invariant against the daylight — never changes.
 */
export function setSlidePanelWidthMm(
  design: WindowDesign,
  paneId: string,
  index: number,
  widthMm: number,
  minPanelMm: number = MIN_PANE_MM
): WindowDesign {
  const leaf = mustSlidingLeaf(design, paneId);
  const cur = leaf.slide as SlideSpec;
  const n = cur.panels.length;
  if (index < 0 || index >= n) {
    throw new DesignError(`sliding leaf '${paneId}' has no panel ${index}`);
  }
  if (n === 1) throw new DesignError('single-panel leaf: resize the frame instead');
  const other = index === n - 1 ? index - 1 : index + 1;
  const pair = cur.panels[index].widthMm + cur.panels[other].widthMm;
  const clamped = Math.min(pair - minPanelMm, Math.max(minPanelMm, widthMm));
  const panels = cur.panels.map((p, i) => {
    if (i === index) return { ...p, widthMm: clamped };
    if (i === other) return { ...p, widthMm: pair - clamped };
    return p;
  });
  return withSlide(design, paneId, { ...cur, panels });
}
