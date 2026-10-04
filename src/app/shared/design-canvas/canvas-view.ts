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

import { Axis, Layout, RectMm, WindowDesign } from '../design-model';

/** Palette tools that can be dragged (or armed) onto a pane. */
export type CanvasTool = 'split-x' | 'split-y';

/** What is currently selected on the canvas. */
export type CanvasSelection =
  | { type: 'frame' }
  | { type: 'pane'; paneId: string }
  | { type: 'divider'; splitId: string; index: number };

/** mm → px: px = origin + mm · pxPerMm (mm space origin = frame outer corner). */
export interface ViewTransform {
  pxPerMm: number;
  originX: number;
  originY: number;
}

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
  panYPx: number
): ViewTransform {
  const m = VIEW_MARGINS;
  const availW = Math.max(40, stageWPx - m.left - m.right);
  const availH = Math.max(40, stageHPx - m.top - m.bottom);
  const base = Math.min(availW / frameWMm, availH / frameHMm);
  const pxPerMm = base * zoom;
  return {
    pxPerMm,
    originX: m.left + (availW - frameWMm * pxPerMm) / 2 + panXPx,
    originY: m.top + (availH - frameHMm * pxPerMm) / 2 + panYPx,
  };
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
  return {
    xMm: (xPx - view.originX) / view.pxPerMm,
    yMm: (yPx - view.originY) / view.pxPerMm,
  };
}

export function pxFromMm(
  view: ViewTransform,
  xMm: number,
  yMm: number
): { x: number; y: number } {
  return {
    x: view.originX + xMm * view.pxPerMm,
    y: view.originY + yMm * view.pxPerMm,
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
  | { kind: 'frame-handle' }
  | { kind: 'divider'; splitId: string; index: number; axis: Axis }
  | { kind: 'pane'; paneId: string }
  | { kind: 'frame' }
  | { kind: 'none' };

/**
 * Model-driven hit test, priority: resize handle > divider band (fattened by
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
    if (
      Math.abs(p.xMm - fw) <= handleTol &&
      Math.abs(p.yMm - fh) <= handleTol
    ) {
      return { kind: 'frame-handle' };
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
