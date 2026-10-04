/**
 * design-canvas view math — pure TS (no Konva, no Angular, no DOM).
 *
 * Owns the mm ↔ px transform (zoom / pan over a fit-to-screen base scale)
 * and the model-driven hit test. All interaction coordinates resolve through
 * here, so clicks, drags and renders can never disagree about where a pane
 * is: everything derives from the one design-model `layout()`.
 *
 * Phase 1 items 1.2–1.5 of docs/product/designer-architecture.md.
 */

import {
  Axis,
  Layout,
  LeafNode,
  RectMm,
  WindowDesign,
  slideLayout,
} from '../design-model';

/** Palette tools that can be dragged (or armed) onto a pane. */
export type CanvasTool = 'split-x' | 'split-y';

/** What is currently selected on the canvas. */
export type CanvasSelection =
  | { type: 'frame' }
  /** `panelIndex` is set when a panel of a multi-panel sliding leaf was hit. */
  | { type: 'pane'; paneId: string; panelIndex?: number }
  | { type: 'divider'; splitId: string; index: number };

/** mm → px: px = origin + mm · pxPerMm (mm space origin = frame outer corner). */
export interface ViewTransform {
  pxPerMm: number;
  originX: number;
  originY: number;
  /**
   * Set (to the frame width) when the elevation is viewed from the other
   * side: x is mirrored about the frame, px = origin + (W − mm) · pxPerMm.
   * mm coordinates stay in MODEL space, so hit tests and operations are
   * identical in both views.
   */
  mirrorWMm?: number;
}

/** Which side of the wall the elevation is drawn from. */
export type ViewFrom = 'outside' | 'inside';

/** Frame corner in MODEL space (n = top, w = model-left). */
export type FrameCorner = 'nw' | 'ne' | 'sw' | 'se';

/**
 * Margins (px) reserved around the fitted frame so the dimension lines and
 * labels never clip: height dims live LEFT, width dims BELOW (same scheme as
 * the quotation designer's capture layout).
 */
export const VIEW_MARGINS = { left: 64, right: 26, top: 26, bottom: 62 };

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;

/**
 * Compute the active transform. `zoom` is relative to the fit-to-screen base
 * scale (1 = fit); `panX/panY` are px offsets applied on top.
 */
export function computeView(
  stageWPx: number,
  stageHPx: number,
  frameWMm: number,
  frameHMm: number,
  zoom: number,
  panXPx: number,
  panYPx: number,
  mirror = false
): ViewTransform {
  const m = VIEW_MARGINS;
  const availW = Math.max(40, stageWPx - m.left - m.right);
  const availH = Math.max(40, stageHPx - m.top - m.bottom);
  const base = Math.min(availW / frameWMm, availH / frameHMm);
  const pxPerMm = base * zoom;
  const view: ViewTransform = {
    pxPerMm,
    originX: m.left + (availW - frameWMm * pxPerMm) / 2 + panXPx,
    originY: m.top + (availH - frameHMm * pxPerMm) / 2 + panYPx,
  };
  if (mirror) view.mirrorWMm = frameWMm;
  return view;
}

/**
 * View used while a corner handle resizes the frame from w0×h0 to w×h:
 * the scale of `view0` is kept and the corner OPPOSITE the dragged one
 * stays where it was on screen, so the handle tracks the pointer.
 */
export function anchoredView(
  view0: ViewTransform,
  corner: FrameCorner,
  w0Mm: number,
  h0Mm: number,
  wMm: number,
  hMm: number
): ViewTransform {
  const mirrored = view0.mirrorWMm !== undefined;
  // The dragged edge is on the screen-left when it is the model-west edge
  // in the normal view, or the model-east edge in the mirrored view.
  const dragsScreenLeft = (corner[1] === 'w') !== mirrored;
  const view: ViewTransform = {
    pxPerMm: view0.pxPerMm,
    originX: dragsScreenLeft
      ? view0.originX + (w0Mm - wMm) * view0.pxPerMm
      : view0.originX,
    originY:
      corner[0] === 'n'
        ? view0.originY + (h0Mm - hMm) * view0.pxPerMm
        : view0.originY,
  };
  if (mirrored) view.mirrorWMm = wMm;
  return view;
}

export interface PointMm {
  xMm: number;
  yMm: number;
}

export function mmFromPx(
  view: ViewTransform,
  xPx: number,
  yPx: number
): PointMm {
  const x = (xPx - view.originX) / view.pxPerMm;
  return {
    xMm: view.mirrorWMm === undefined ? x : view.mirrorWMm - x,
    yMm: (yPx - view.originY) / view.pxPerMm,
  };
}

export function pxFromMm(
  view: ViewTransform,
  xMm: number,
  yMm: number
): { x: number; y: number } {
  const x = view.mirrorWMm === undefined ? xMm : view.mirrorWMm - xMm;
  return {
    x: view.originX + x * view.pxPerMm,
    y: view.originY + yMm * view.pxPerMm,
  };
}

/** A mm rect as a screen rect (top-left + size), mirror-aware. */
export function rectPxFromMm(
  view: ViewTransform,
  r: RectMm
): { x: number; y: number; w: number; h: number } {
  const xMm =
    view.mirrorWMm === undefined ? r.xMm : view.mirrorWMm - r.xMm - r.wMm;
  return {
    x: view.originX + xMm * view.pxPerMm,
    y: view.originY + r.yMm * view.pxPerMm,
    w: r.wMm * view.pxPerMm,
    h: r.hMm * view.pxPerMm,
  };
}

/** Rect-contains with a symmetric mm tolerance. */
export function rectContains(r: RectMm, p: PointMm, tolMm = 0): boolean {
  return (
    p.xMm >= r.xMm - tolMm &&
    p.xMm <= r.xMm + r.wMm + tolMm &&
    p.yMm >= r.yMm - tolMm &&
    p.yMm <= r.yMm + r.hMm + tolMm
  );
}

export type HitResult =
  | { kind: 'frame-handle'; corner: FrameCorner }
  | { kind: 'divider'; splitId: string; index: number; axis: Axis }
  | { kind: 'pane'; paneId: string }
  | { kind: 'frame' }
  | { kind: 'none' };

/**
 * Model-driven hit test, priority: corner resize handles > divider band (fattened by
 * `tolMm` so thin bars stay grabbable on touch) > leaf pane > frame border.
 * Every pane's FULL rect is a hit target — no dead zones by construction
 * (gap-report defect B5).
 */
export function hitTest(
  design: WindowDesign,
  lay: Layout,
  p: PointMm,
  tolMm: number,
  opts?: { frameHandle?: boolean }
): HitResult {
  const fw = design.frame.widthMm;
  const fh = design.frame.heightMm;

  if (opts?.frameHandle !== false) {
    const handleTol = tolMm * 1.6;
    const nearX = (x: number): boolean => Math.abs(p.xMm - x) <= handleTol;
    const nearY = (y: number): boolean => Math.abs(p.yMm - y) <= handleTol;
    const ns = nearY(fh) ? 's' : nearY(0) ? 'n' : null;
    const we = nearX(fw) ? 'e' : nearX(0) ? 'w' : null;
    if (ns && we) {
      return { kind: 'frame-handle', corner: `${ns}${we}` as FrameCorner };
    }
  }

  for (const d of lay.dividers) {
    const grow = d.direction === 'vertical' ? { x: tolMm, y: 0 } : { x: 0, y: tolMm };
    const band: RectMm = {
      xMm: d.rect.xMm - grow.x,
      yMm: d.rect.yMm - grow.y,
      wMm: d.rect.wMm + 2 * grow.x,
      hMm: d.rect.hMm + 2 * grow.y,
    };
    if (rectContains(band, p)) {
      return {
        kind: 'divider',
        splitId: d.split.id,
        index: d.index,
        axis: d.split.axis,
      };
    }
  }

  for (const l of lay.leaves) {
    if (rectContains(l.rect, p)) {
      return { kind: 'pane', paneId: l.leaf.id };
    }
  }

  if (p.xMm >= -tolMm && p.xMm <= fw + tolMm && p.yMm >= -tolMm && p.yMm <= fh + tolMm) {
    return { kind: 'frame' };
  }
  return { kind: 'none' };
}

/**
 * Which sliding panel of `leaf` (laid out in `rect`) is under `p`; null
 * for non-sliding or single-panel leaves. In an interlock overlap the
 * later panel wins (it is the one drawn in front).
 */
export function slidePanelAt(
  leaf: LeafNode,
  rect: RectMm,
  p: PointMm
): number | null {
  if (leaf.category !== 'Slidding' || !leaf.slide) return null;
  if (leaf.slide.panels.length < 2) return null;
  const x = p.xMm - rect.xMm;
  const panels = slideLayout(leaf.slide, rect.wMm).panels;
  for (let i = panels.length - 1; i >= 0; i--) {
    if (x >= panels[i].xMm && x <= panels[i].xMm + panels[i].widthMm) {
      return panels[i].index;
    }
  }
  return null;
}
