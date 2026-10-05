/**
 * structure-model types — the document "upvc.structure/1" (architecture.md §2).
 *
 * A structure is a set of flat faces placed in 3D, joined along their edges by
 * joints (bars) and at points by hubs. Pure TypeScript: no Angular, no
 * three.js, no DOM. Millimetres; X to the right along the front, Y up, Z
 * towards the viewer standing outside; the floor is Y = 0.
 */

import type { Id, WindowDesign } from '../design-model/types';

export const STRUCTURE_SCHEMA = 'upvc.structure/1';

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

/** How a framed face opens. The full WindowDesign joins it on a later card. */
export type FaceOpening = 'fixed' | 'casement' | 'top-hung' | 'door' | 'sliding';

export type FaceFill =
  /** A framed unit; `design` is filled in when the 2D designer is wired to faces. */
  | { kind: 'design'; opening: FaceOpening; design?: WindowDesign }
  /** A pane held directly by the bars around it (roof and dome panes). */
  | { kind: 'glass'; glassId: Id | null }
  /** Solid infill. */
  | { kind: 'panel'; productId: Id | null }
  /** Nothing: a doorway or an opening. */
  | { kind: 'open' };

export interface Face {
  /** Stable and meaningful ("front-2", "r1-s3"), so a re-run of the template finds it again. */
  id: string;
  label: string;
  role: 'wall' | 'roof';
  /** Faces changed together: one wall, one ring, one roof slope. */
  group: string;
  groupLabel: string;
  /** u to the right and v up as seen from outside; both unit; the outward normal is u × v. */
  plane: { origin: Vec3; u: Vec3; v: Vec3 };
  /** Outline in face (u, v) mm, anticlockwise seen from outside, on the system lines. */
  outline: Vec2[];
  fill: FaceFill;
  /** Drawing tint of this face's glass; absent = the tint of the structure (appearance.glassTint). */
  glassTint?: string;
  /** True once the user changed this face by hand; a template re-run keeps its fill. */
  edited?: boolean;
}

export interface Joint {
  id: string;
  /** A role of the bar table (bar-sections.ts). Free text on purpose: roles are data. */
  role: string;
  /** The catalogue row; null = not chosen yet. */
  productId: Id | null;
  /** System line (centre line) of the member. */
  a: Vec3;
  b: Vec3;
  faceIds: string[];
}

export interface Hub {
  id: string;
  role: string;
  productId: Id | null;
  at: Vec3;
  jointIds: string[];
}

export interface Extra {
  id: string;
  label: string;
  productId: Id | null;
  qty: number;
  unit: 'pc' | 'm' | 'sqm';
}

export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

export interface Structure {
  schema: string;
  unit: 'mm';
  name: string;
  /** Where it came from; lets the parameters be changed later. */
  template?: { kind: string; params: Params };
  defaults: { profileSystemId: Id | null; colorId: Id | null; glassId: Id | null };
  /** Drawing colours until the catalogue colour and glass rows are wired in. */
  appearance: { profileColour: string; glassTint: string };
  faces: Face[];
  joints: Joint[];
  hubs: Hub[];
  extras: Extra[];
}

export const DEFAULT_APPEARANCE = { profileColour: '#f4f4f1', glassTint: '#9fc4cf' };
