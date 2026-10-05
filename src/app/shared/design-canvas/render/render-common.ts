/**
 * design-canvas renderer — shared drawing vocabulary: colours, the px rect
 * type, the per-redraw context and the colour helper. Konva-only, no state.
 */

import Konva from 'konva';
import { Id, LeafNode, RectMm, WindowDesign } from '../../design-model';
import {
  ViewFrom,
  ViewTransform,
  pxFromMm,
  rectPxFromMm,
} from '../canvas-view';

export const COL = {
  stroke: '#2b2b2b',
  dim: '#444444',
  symbol: '#1f6feb',
  glassTop: '#e9f4fb',
  glassBottom: '#c4e4f1',
  label: '#333333',
  select: 'rgba(31, 111, 235, 0.18)',
  selectStroke: '#1f6feb',
  ghost: '#e8590c',
  mesh: '#6b7280',
};

/**
 * Take the drawing colours from the app's design tokens when the page has
 * them (--c-accent for selection and opening symbols; --c-frame-line,
 * --c-dim and --c-glass-1/2 for lines, dimensions and glass). The sheet
 * itself stays white so the saved picture prints clean, so line and glass
 * tokens are only used with a light frame token. Without tokens (a bare
 * test page) the defaults above stay.
 */
export function applyColourTokens(el: Element): void {
  const style = getComputedStyle(el);
  const token = (name: string): string => style.getPropertyValue(name).trim();
  const hex = (v: string): boolean => /^#[0-9a-f]{6}$/i.test(v);
  const accent = token('--c-accent');
  if (hex(accent)) {
    COL.symbol = accent;
    COL.selectStroke = accent;
    const n = parseInt(accent.slice(1), 16);
    COL.select = `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.16)`;
  }
  if (token('--c-frame').toLowerCase() !== '#ffffff') return;
  const line = token('--c-frame-line');
  const dim = token('--c-dim');
  const glassTop = token('--c-glass-1');
  const glassBottom = token('--c-glass-2');
  if (hex(line)) COL.stroke = line;
  if (hex(dim)) COL.dim = dim;
  if (hex(glassTop)) COL.glassTop = glassTop;
  if (hex(glassBottom)) COL.glassBottom = glassBottom;
}

export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Side = 'left' | 'right' | 'top' | 'bottom';

/** Anything Konva nodes can be added to (the layer or a clip group). */
export type Parent = Konva.Layer | Konva.Group;

/**
 * Visible face widths of the sash profiles, mm. `byId` holds the widths the
 * catalogue gives for a sash profile id; a profile without one is drawn at
 * the default of its kind (the same figures the 3D view uses).
 */
export interface SashFaces {
  casementMm: number;
  doorMm: number;
  slidingMm: number;
  meshMm: number;
  byId?: Record<string, number>;
}

export const DEFAULT_SASH_FACES: SashFaces = {
  casementMm: 48,
  doorMm: 78,
  slidingMm: 45,
  meshMm: 28,
};

export interface RenderOpts {
  stageWPx: number;
  stageHPx: number;
  frameFaceMm: number;
  profileColor: string;
  /** Glass colour for the document's glass type (default: clear blue). */
  glassTint?: string | null;
  /** Colours of every glass, for panes glazed differently from the window. */
  glassTints?: GlassTints | null;
  /** Names of the glasses by id, for the tag on a pane with its own glass. */
  glassLabels?: Record<string, string> | null;
  sashFaces?: SashFaces | null;
  /** Draw the key of the symbols under the drawing (the saved picture). */
  legend?: boolean;
  /** Side the elevation is viewed from (default 'outside' = as modelled). */
  viewFrom?: ViewFrom;
}

/**
 * How much is drawn. A drawing a few centimetres wide (a phone, a list
 * thumbnail) keeps its frames, sashes, symbols and arrows and drops the
 * small print, so lines never run into each other.
 */
export type Detail = 'full' | 'compact' | 'tiny';

export function detailFor(shortSidePx: number): Detail {
  return shortSidePx < 120 ? 'tiny' : shortSidePx < 250 ? 'compact' : 'full';
}

/** Everything a draw function needs for one redraw. */
export interface RenderCtx {
  design: WindowDesign;
  view: ViewTransform;
  opts: RenderOpts;
  /** True when the view is mirrored (viewed from inside). */
  flip: boolean;
  color: string;
  facePx: number;
  detail: Detail;
  sashFaces: SashFaces;
  px(mm: number): number;
  rect(r: RectMm): PxRect;
  pt(xMm: number, yMm: number): { x: number; y: number };
}

export function makeCtx(
  design: WindowDesign,
  view: ViewTransform,
  opts: RenderOpts
): RenderCtx {
  const px = (mm: number): number => mm * view.pxPerMm;
  return {
    design,
    view,
    opts,
    flip: view.mirrorWMm !== undefined,
    color: opts.profileColor || '#ffffff',
    facePx: Math.max(2, px(opts.frameFaceMm)),
    detail: detailFor(px(Math.min(design.frame.widthMm, design.frame.heightMm))),
    sashFaces: { ...DEFAULT_SASH_FACES, ...(opts.sashFaces ?? {}) },
    px,
    rect: (r) => rectPxFromMm(view, r),
    pt: (xMm, yMm) => pxFromMm(view, xMm, yMm),
  };
}

export type SashKind = 'casement' | 'door' | 'sliding' | 'mesh';

/**
 * Face width of a leaf's sash on screen: the catalogue's width for its
 * profile, else the default of its kind. Never thinner than 3 px (it must
 * read as a frame, not a line) and never more than a quarter of the leaf.
 */
export function sashFacePx(
  ctx: RenderCtx,
  leaf: LeafNode | null,
  kind: SashKind,
  r: PxRect
): number {
  const f = ctx.sashFaces;
  const own =
    kind !== 'mesh' && leaf && leaf.sashId !== null && leaf.sashId !== undefined
      ? f.byId?.[String(leaf.sashId)]
      : undefined;
  const mm =
    own && own > 0
      ? own
      : kind === 'door'
        ? f.doorMm
        : kind === 'sliding'
          ? f.slidingMm
          : kind === 'mesh'
            ? f.meshMm
            : f.casementMm;
  const min = kind === 'mesh' ? 2 : 3;
  return Math.max(min, Math.min(ctx.px(mm), Math.min(r.w, r.h) * 0.25));
}

/** `r` shrunk by `d` on every side (never below 1 px). */
export function insetPx(r: PxRect, d: number): PxRect {
  return {
    x: r.x + d,
    y: r.y + d,
    w: Math.max(1, r.w - 2 * d),
    h: Math.max(1, r.h - 2 * d),
  };
}

/** A model side as it appears on screen (left/right swap when mirrored). */
export function screenSide(side: Side, flip: boolean): Side {
  if (!flip) return side;
  return side === 'left' ? 'right' : side === 'right' ? 'left' : side;
}

export function opposite(side: Side): Side {
  return side === 'left'
    ? 'right'
    : side === 'right'
      ? 'left'
      : side === 'top'
        ? 'bottom'
        : 'top';
}

/** Flat [x0, y0, x1, y1, ...] px points from mm points. */
export function flatPx(
  ctx: RenderCtx,
  points: { xMm: number; yMm: number }[]
): number[] {
  const out: number[] = [];
  for (const p of points) {
    const q = ctx.pt(p.xMm, p.yMm);
    out.push(q.x, q.y);
  }
  return out;
}

/**
 * Glass tint lookup. Hosts pass their glass master colours; the keys are
 * glass ids as strings. Unknown / null ids fall back to clear glass.
 */
export type GlassTints = Record<string, string>;

export function glassTintFor(
  glassId: Id | null,
  tints: GlassTints | null | undefined
): string | null {
  if (glassId === null || glassId === undefined || !tints) return null;
  return tints[String(glassId)] ?? null;
}

/** Lighten (>0) or darken (<0) a hex colour; non-hex falls back to white. */
export function shadeColor(hex: string, percent: number): string {
  let h = (hex || '#ffffff').trim();
  if (h[0] === '#') h = h.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) h = 'ffffff';
  const num = parseInt(h, 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  const target = percent < 0 ? 0 : 255;
  const p = Math.min(1, Math.abs(percent));
  r = Math.round((target - r) * p) + r;
  g = Math.round((target - g) * p) + g;
  b = Math.round((target - b) * p) + b;
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
