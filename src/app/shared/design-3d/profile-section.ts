/**
 * design-3d profile sections — the ONE place the 3D view takes its section
 * sizes from. Pure data and pure functions: no three.js, no Angular.
 *
 * P0 has no section outlines in the catalogue, so every profile is a
 * simplified but proportionate polygon built from a face width and a depth
 * (a plain box, or a box with one glazing rebate). No profile id appears
 * here or anywhere else in design-3d: P1-D replaces `outline` with the
 * catalogue row's own outline and nothing else changes.
 *
 * A section point is [d, y] in mm:
 *   d: 0 = the outside face of the bar, + = towards the room;
 *   y: 0 = the bar's outer perimeter edge, + = towards the glass.
 * Outlines run counter-clockwise in (d, y) and are star-shaped from their
 * first point, so an end cap is a simple fan (checked by the spec).
 */

export type SectionPt = readonly [number, number];

export interface ProfileSection {
  faceMm: number;
  depthMm: number;
  outline: SectionPt[];
}

/** Plain rectangular bar; `chamferMm` eases its four long edges so they catch the light. */
export function boxSection(faceMm: number, depthMm: number, chamferMm = 0): ProfileSection {
  const c = chamferMm;
  const outline: SectionPt[] = c
    ? [
        [c, 0],
        [depthMm - c, 0],
        [depthMm, c],
        [depthMm, faceMm - c],
        [depthMm - c, faceMm],
        [c, faceMm],
        [0, faceMm - c],
        [0, c],
      ]
    : [
        [0, 0],
        [depthMm, 0],
        [depthMm, faceMm],
        [0, faceMm],
      ];
  return { faceMm, depthMm, outline };
}

/**
 * A bar with one rebate on the room side of its glass edge: the full depth
 * over `REBATE.solid` of the face, then a lip of `REBATE.lip` of the depth.
 */
export function rebatedSection(faceMm: number, depthMm: number, chamferMm = 0): ProfileSection {
  const step = faceMm * REBATE.solid;
  const lip = depthMm * REBATE.lip;
  const c = chamferMm;
  const outline: SectionPt[] = c
    ? [
        [c, 0],
        [depthMm - c, 0],
        [depthMm, c],
        [depthMm, step],
        [lip, step],
        [lip, faceMm],
        [c, faceMm],
        [0, faceMm - c],
        [0, c],
      ]
    : [
        [0, 0],
        [depthMm, 0],
        [depthMm, step],
        [lip, step],
        [lip, faceMm],
        [0, faceMm],
      ];
  return { faceMm, depthMm, outline };
}

const REBATE = { solid: 0.7, lip: 0.62 };

/**
 * Every size the 3D view uses, in mm. The outer frame's FACE is not here:
 * it is the same `frameFaceMm` the 2D layout uses, so both views agree.
 */
export const SECTION_DATA = {
  /** Casement outer frame and the depth every casement part is set in. */
  casementFrameDepthMm: 60,
  /** Opening casement sash. */
  sash: { faceMm: 48, depthMm: 54 },
  /** Door leaf. */
  doorSash: { faceMm: 78, depthMm: 58 },
  /** Mullion and transom bars: set back from both faces of the frame. */
  dividerSetbackMm: 3,
  /** Sliding frame: depth = 2 × edge + pitch × tracks (mesh track included). */
  track: { pitchMm: 28, edgeMm: 6, railHeightMm: 10, railWidthMm: 6 },
  /** Sliding shutter. */
  slidingSash: { faceMm: 45, depthMm: 22 },
  /** Fly-mesh shutter. */
  meshSash: { faceMm: 28, depthMm: 14 },
  meshThicknessMm: 1.5,
  /** Eased edge of every profile bar. */
  chamferMm: 1.5,
  /** Dark gasket between a glass and its bar: how much of it shows, and how proud of the glass it stands. */
  gasket: { showMm: 4, proudMm: 5 },
  glassThicknessMm: 6,
  /** How far a glass edge goes into the bar that holds it. */
  glassBiteMm: 4,
  /** Glazing (Georgian) bar on the glass. */
  glazingBar: { faceMm: 20, proudMm: 5 },
  /** Low door threshold. */
  lowThresholdHeightMm: 20,
  /** Handle: a base plate and a lever, on the room side. */
  handle: { plateWMm: 26, plateHMm: 130, plateDMm: 8, leverLMm: 110, leverWMm: 18, leverDMm: 12 },
} as const;

/** Opening limits by hanging, in degrees at "fully open". A centre pivot turns its sash edge-on. */
export const OPEN_LIMITS_DEG = { side: 90, top: 45, bottom: 25, pivot: 90 } as const;

/** A window casement in this market opens outwards; a door follows its own swing. */
export const WINDOW_CASEMENT_OPENS_OUT = true;

/** Depth of a sliding frame that carries `tracks` tracks (mesh track included). */
export function slidingFrameDepthMm(tracks: number): number {
  const t = SECTION_DATA.track;
  return Math.max(SECTION_DATA.casementFrameDepthMm, 2 * t.edgeMm + t.pitchMm * tracks);
}

/** Distance from the outside face to the centre of track `index` (0 = outermost). */
export function trackCentreMm(index: number): number {
  const t = SECTION_DATA.track;
  return t.edgeMm + t.pitchMm * (index + 0.5);
}

export function frameSection(frameFaceMm: number, depthMm: number, sliding: boolean): ProfileSection {
  const c = SECTION_DATA.chamferMm;
  return sliding ? boxSection(frameFaceMm, depthMm, c) : rebatedSection(frameFaceMm, depthMm, c);
}
