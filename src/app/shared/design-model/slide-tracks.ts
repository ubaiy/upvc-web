/**
 * design-model slide tracks — which track every shutter of a sliding leaf
 * runs on, the fly mesh included. Read-only: it stores nothing and changes
 * no document, price or payload.
 *
 * THE RULE (one for the 2D drawing, the 3D view and the track count):
 *  - Track 0 is the OUTSIDE track; the highest track is nearest the ROOM.
 *  - The fly mesh runs on the track nearest the room, so insects are kept
 *    out while the glass shutters stand open.
 *  - A "3 Track" or "4 Track" has that many tracks in all. With a mesh the
 *    innermost one is the mesh's own and the glass shutters share the
 *    others (two to a track at most): 3 Track + mesh = 2 glass tracks + 1.
 *  - A "2.5 Track" has two glass tracks and a half track for the mesh, on
 *    the room side of them.
 *  - More glass shutters than the remaining tracks can carry (5 or 6 on a
 *    3 Track with mesh): the glass keeps every track and the mesh shares
 *    the innermost one. `meshOwnTrack` is then false.
 *
 * The glass assignment is the 2D drawing's (design-canvas
 * render-sliding.ts, `glassTrackCount`); a spec holds the two together.
 */

import { SlideSpec } from './types';
import { TRACK_COUNTS, trackOf } from './slide';

export interface SlideTracks {
  /** Rails in the frame, outside to room: full tracks plus the half track of a 2.5 track with mesh. */
  railCount: number;
  /** Tracks the glass shutters run on. */
  glassTracks: number;
  /** Track of each panel, by panel index (0 = outside). */
  panelTrack: number[];
  /** Track of the fly mesh; null when the leaf has none. */
  meshTrack: number | null;
  /** False when the mesh has to share its track with glass shutters. */
  meshOwnTrack: boolean;
}

export function slideTracks(slide: SlideSpec): SlideTracks {
  const all = TRACK_COUNTS[slide.tracks];
  const n = slide.panels.length;
  const half = slide.tracks === '2.5 Track';
  const mesh = slide.mesh === true;
  // The innermost full track is given to the mesh when the glass fits on the rest.
  const gives = mesh && !half && all >= 3 && n <= 2 * (all - 1);
  const glassTracks = gives ? all - 1 : all;
  const panelTrack = slide.panels.map((_, i) =>
    !gives ? trackOf(slide.tracks, n, i) : n <= glassTracks ? i : Math.min(i, n - 1 - i, glassTracks - 1)
  );
  return {
    railCount: all + (mesh && half ? 1 : 0),
    glassTracks,
    panelTrack,
    meshTrack: !mesh ? null : half ? all : all - 1,
    meshOwnTrack: mesh && (half || gives),
  };
}
