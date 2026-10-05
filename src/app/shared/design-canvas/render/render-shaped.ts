/**
 * design-canvas renderer — what a shaped frame (round, arched, sloped) cuts:
 * a pane whose glass is not a rectangle, and a mullion or transom that ends
 * on the curve.
 *
 * A fixed pane is glass whose edge and glazing bead follow the frame's
 * inner line; its size is the overall (bounding) size of the cut glass. An
 * opening pane is a shaped sash (render-shaped-sash.ts). Sliding needs a
 * straight track, so a saved design that has a slider in a cut pane is drawn
 * as the glass it can be, with a note on it.
 */

import Konva from 'konva';
import { LeafNode, PointMm, insetConvexPolygon } from '../../design-model';
import { COL, Parent, RenderCtx, flatPx, shadeColor } from './render-common';
import { GASKET } from './render-sash';

/** Depth of the glazing bead along the cut edge, mm (as for fixed glass). */
const BEAD_MM = 18;
const WARN_INK = '#9a3412';
const WARN_FILL = '#ffedd5';

/** A cut pane drawn as plain fixed glass, no sash band. */
export function asShapedGlass(leaf: LeafNode): LeafNode {
  const glass: LeafNode = { ...leaf, category: 'Casement', casementType: 'Fixed' };
  delete glass.slide;
  delete glass.opening;
  delete glass.sashFramed;
  return glass;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function boxOf(pts: number[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]);
    x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]);
    y1 = Math.max(y1, pts[i + 1]);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Area centroid of a flat px polygon. */
function centroidOf(pts: number[]): { x: number; y: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1];
    a += cross;
    cx += (pts[2 * i] + pts[2 * j]) * cross;
    cy += (pts[2 * i + 1] + pts[2 * j + 1]) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    const b = boxOf(pts);
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

function insidePoly(pts: number[], x: number, y: number): boolean {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[2 * i];
    const yi = pts[2 * i + 1];
    const xj = pts[2 * j];
    const yj = pts[2 * j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function boxInside(pts: number[], b: Box): boolean {
  return (
    insidePoly(pts, b.x, b.y) &&
    insidePoly(pts, b.x + b.w, b.y) &&
    insidePoly(pts, b.x, b.y + b.h) &&
    insidePoly(pts, b.x + b.w, b.y + b.h)
  );
}

/**
 * The edge of a cut pane (the gasket line all the way round, so the glass
 * is closed along the curve) and its glazing bead, parallel to that edge.
 */
export function drawShapedPaneEdges(
  parent: Parent,
  leaf: LeafNode,
  polygonMm: PointMm[],
  ctx: RenderCtx
): void {
  const pts = flatPx(ctx, polygonMm);
  const outline = new Konva.Line({
    points: pts,
    closed: true,
    stroke: GASKET,
    strokeWidth: ctx.detail === 'tiny' ? 1 : 1.5,
    lineJoin: 'round',
    listening: false,
    name: 'pane-outline',
  });
  outline.setAttr('paneId', leaf.id);
  parent.add(outline);
  if (ctx.detail === 'tiny') return;
  const box = boxOf(pts);
  const beadMm = Math.min(BEAD_MM, (Math.min(box.w, box.h) * 0.12) / ctx.view.pxPerMm);
  if (ctx.px(beadMm) < 2 || Math.min(box.w, box.h) <= 4 * ctx.px(beadMm)) return;
  let bead: PointMm[];
  try {
    bead = insetConvexPolygon(polygonMm, beadMm);
  } catch {
    return; // a sliver: no room for a bead line
  }
  const line = new Konva.Line({
    points: flatPx(ctx, bead),
    closed: true,
    stroke: shadeColor(COL.stroke, 0.35),
    strokeWidth: 0.75,
    listening: false,
    name: 'bead-line',
  });
  line.setAttrs({ paneId: leaf.id, shaped: true });
  parent.add(line);
}

/**
 * A mullion or transom in a shaped frame: the bar cut to the frame's inner
 * line, outlined all round, so it ends ON that line with a closed joint.
 */
export function drawShapedDivider(
  parent: Parent,
  cutMm: PointMm[],
  fill: string,
  ctx: RenderCtx,
  attrs: Record<string, unknown>
): void {
  const bar = new Konva.Line({
    points: flatPx(ctx, cutMm),
    closed: true,
    fill,
    stroke: COL.stroke,
    strokeWidth: 1.5,
    lineJoin: 'round',
    listening: false,
    name: 'divider-bar',
  });
  bar.setAttrs({ ...attrs, shaped: true });
  parent.add(bar);
}

interface TagStyle {
  name: string;
  fontSize: number;
  ink: string;
  fill: string;
  bold?: boolean;
  attrs: Record<string, unknown>;
}

/**
 * The first of `texts` whose pill lies wholly on the glass, centred on
 * (cx, top). Returns the y under it, or `top` when none fits.
 */
function placeTag(
  parent: Parent,
  glass: number[],
  cx: number,
  top: number,
  texts: string[],
  s: TagStyle
): number {
  for (const text of texts) {
    const label = new Konva.Text({
      text,
      fontSize: s.fontSize,
      fontStyle: s.bold ? 'bold' : 'normal',
      align: 'center',
      fill: s.ink,
      listening: false,
      name: s.name,
    });
    const pill: Box = {
      x: cx - label.width() / 2 - 4,
      y: top - 2,
      w: label.width() + 8,
      h: label.height() + 4,
    };
    if (!boxInside(glass, pill)) {
      label.destroy();
      continue;
    }
    label.position({ x: pill.x + 4, y: top });
    label.setAttrs({ ...s.attrs, caption: text });
    parent.add(
      new Konva.Rect({
        x: pill.x,
        y: pill.y,
        width: pill.w,
        height: pill.h,
        cornerRadius: 3,
        fill: s.fill,
        opacity: 0.9,
        listening: false,
        name: `${s.name}-bg`,
      })
    );
    parent.add(label);
    return pill.y + pill.h + 4;
  }
  return top;
}

/**
 * Size of a cut pane: the overall (bounding) width × height of its glass,
 * said to be overall, placed on the glass. With `blocked`, the note that
 * the pane was saved as a slider and cannot be one (no straight track).
 */
export function drawShapedPaneLabel(
  parent: Parent,
  leaf: LeafNode,
  polygonMm: PointMm[],
  ctx: RenderCtx,
  o: { size: boolean; blocked: boolean; glassMm?: PointMm[] }
): void {
  if (ctx.detail === 'tiny') return;
  // The size is the pane's (the opening a sash is made to); the tag is
  // placed on the glass, which is smaller when the pane holds a sash.
  const box = boxOf(flatPx(ctx, polygonMm));
  const wMm = Math.round(box.w / ctx.view.pxPerMm);
  const hMm = Math.round(box.h / ctx.view.pxPerMm);
  const pts = flatPx(ctx, o.glassMm ?? polygonMm);
  const compact = ctx.detail === 'compact';
  const c = centroidOf(pts);
  let y = c.y - (o.blocked ? 14 : 7);
  if (o.size) {
    y = placeTag(
      parent,
      pts,
      c.x,
      y,
      compact
        ? [`${wMm} × ${hMm} overall`, `${wMm} × ${hMm}`]
        : [`${wMm} × ${hMm} mm overall`, `${wMm} × ${hMm} mm\noverall`, `${wMm} × ${hMm}\noverall`],
      {
        name: 'pane-label',
        fontSize: compact ? 9 : 11,
        ink: COL.label,
        fill: '#ffffff',
        attrs: { paneId: leaf.id, wMm, hMm, overall: true },
      }
    );
  }
  if (!o.blocked) return;
  const placed = placeTag(
    parent,
    pts,
    c.x,
    y,
    ['Sliding needs a straight track', 'Sliding needs a\nstraight track', 'Cannot slide', 'Cannot\nslide', '!'],
    {
      name: 'shape-warning',
      fontSize: compact ? 9 : 11,
      ink: WARN_INK,
      fill: WARN_FILL,
      bold: true,
      attrs: { paneId: leaf.id },
    }
  );
  if (placed === y) {
    // Not even the mark fits on the glass: it still has to be seen.
    const mark = new Konva.Text({
      x: c.x - 3,
      y: c.y - 6,
      text: '!',
      fontSize: 12,
      fontStyle: 'bold',
      fill: WARN_INK,
      listening: false,
      name: 'shape-warning',
    });
    mark.setAttrs({ paneId: leaf.id, caption: '!' });
    parent.add(mark);
  }
}
