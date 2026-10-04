/**
 * design-canvas renderer — the outer frame: rectangular mitred bevel bands,
 * shaped outlines (arch, circle, triangle, trapezoid) with their daylight
 * reveal and mitre lines, and the overall + shape dimension lines.
 */

import Konva from 'konva';
import {
  getFramePoints,
  createFrameLine,
} from '../../configs/design/framePoints.config';
import {
  PointMm,
  archRadiusMm,
  daylightPolygon,
  insetConvexPolygon,
  shapeOutline,
} from '../../design-model';
import {
  COL,
  Parent,
  PxRect,
  RenderCtx,
  flatPx,
  shadeColor,
} from './render-common';

/** Arc tessellation used for drawing (dense enough to read as a curve). */
export const DRAW_ARC_SEGMENTS = 128;

export function drawOuterFrame(parent: Parent, f: PxRect, ctx: RenderCtx): void {
  parent.add(
    new Konva.Rect({
      x: f.x,
      y: f.y,
      width: f.w,
      height: f.h,
      fill: ctx.color,
      stroke: COL.stroke,
      strokeWidth: 1,
      listening: false,
      name: 'frame-back',
      shadowColor: '#000000',
      shadowBlur: 10,
      shadowOffset: { x: 2, y: 4 },
      shadowOpacity: 0.22,
    })
  );
  drawBevelBands(parent, f.x, f.y, f.w, f.h, ctx.facePx, ctx.color, 'frame-band');
}

/**
 * Four mitred polygon bands with a two-tone bevel (light from top-left) plus
 * the inner reveal hairline — the profile look of the quotation designer.
 */
export function drawBevelBands(
  parent: Parent,
  x: number,
  y: number,
  w: number,
  h: number,
  facePx: number,
  color: string,
  name: string
): void {
  for (let dir = 1; dir <= 4; dir++) {
    const pts = getFramePoints(dir, w, h, facePx).map((v, i) =>
      i % 2 === 0 ? v + x : v + y
    );
    const lit = dir === 2 || dir === 3;
    const band = createFrameLine(pts, shadeColor(color, lit ? 0.16 : -0.13));
    band.strokeWidth(1);
    band.listening(false);
    band.name(name);
    parent.add(band);
  }
  const inW = w - 2 * facePx;
  const inH = h - 2 * facePx;
  if (inW > 0 && inH > 0) {
    parent.add(
      new Konva.Rect({
        x: x + facePx,
        y: y + facePx,
        width: inW,
        height: inH,
        stroke: shadeColor(color, -0.28),
        strokeWidth: 1,
        listening: false,
        name,
      })
    );
  }
}

/**
 * Shaped frame: the outline filled with the profile colour, a mid-face
 * bevel line, the daylight reveal and a mitre line at every real corner.
 * Returns the daylight polygon (mm) that panes and dividers are clipped to.
 */
export function drawShapedFrame(parent: Parent, ctx: RenderCtx): PointMm[] {
  const { widthMm: w, heightMm: h, shape } = ctx.design.frame;
  const face = ctx.opts.frameFaceMm;
  const outline = shapeOutline(shape, w, h, { arcSegments: DRAW_ARC_SEGMENTS });
  const safeInset = (mm: number): PointMm[] => {
    try {
      return insetConvexPolygon(outline, mm);
    } catch {
      return [];
    }
  };
  let daylight: PointMm[] = [];
  try {
    daylight = daylightPolygon(shape, w, h, face, {
      arcSegments: DRAW_ARC_SEGMENTS,
    });
  } catch {
    daylight = [];
  }

  const back = new Konva.Line({
    points: flatPx(ctx, outline),
    closed: true,
    fill: ctx.color,
    stroke: COL.stroke,
    strokeWidth: 1,
    listening: false,
    name: 'frame-back',
    shadowColor: '#000000',
    shadowBlur: 10,
    shadowOffset: { x: 2, y: 4 },
    shadowOpacity: 0.22,
  });
  back.setAttr('shapeKind', shape.kind);
  parent.add(back);

  const mid = safeInset(face / 2);
  if (mid.length >= 3) {
    parent.add(
      new Konva.Line({
        points: flatPx(ctx, mid),
        closed: true,
        stroke: shadeColor(ctx.color, -0.13),
        strokeWidth: 1,
        listening: false,
        name: 'frame-band',
      })
    );
  }
  if (daylight.length >= 3) {
    parent.add(
      new Konva.Line({
        points: flatPx(ctx, daylight),
        closed: true,
        stroke: shadeColor(ctx.color, -0.28),
        strokeWidth: 1,
        listening: false,
        name: 'frame-band',
      })
    );
    for (const corner of cornersOf(outline)) {
      const inner = nearest(daylight, corner);
      parent.add(
        new Konva.Line({
          points: flatPx(ctx, [corner, inner]),
          stroke: shadeColor(ctx.color, -0.35),
          strokeWidth: 1,
          listening: false,
          name: 'frame-mitre',
        })
      );
    }
  }
  return daylight;
}

/** Outline vertices where the direction turns by more than 15°. */
function cornersOf(outline: PointMm[]): PointMm[] {
  const n = outline.length;
  const out: PointMm[] = [];
  for (let i = 0; i < n; i++) {
    const a = outline[(i + n - 1) % n];
    const b = outline[i];
    const c = outline[(i + 1) % n];
    const t1 = Math.atan2(b.yMm - a.yMm, b.xMm - a.xMm);
    const t2 = Math.atan2(c.yMm - b.yMm, c.xMm - b.xMm);
    let turn = Math.abs(t2 - t1);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    if (turn > (15 * Math.PI) / 180) out.push(b);
  }
  return out;
}

function nearest(points: PointMm[], to: PointMm): PointMm {
  let best = points[0];
  let bestD = Infinity;
  for (const p of points) {
    const d = Math.hypot(p.xMm - to.xMm, p.yMm - to.yMm);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Dimension lines                                                     */
/* ------------------------------------------------------------------ */

const EXT_OVER = 6;
const GAP = 28;
/** The right margin of the view is narrow; shape dims sit closer in. */
const GAP_RIGHT = 10;

function dimLine(points: number[]): Konva.Line {
  return new Konva.Line({
    points,
    stroke: COL.dim,
    strokeWidth: 0.75,
    listening: false,
  });
}

function dimArrow(points: number[]): Konva.Arrow {
  return new Konva.Arrow({
    points,
    stroke: COL.dim,
    fill: COL.dim,
    strokeWidth: 1,
    pointerLength: 6,
    pointerWidth: 6,
    pointerAtBeginning: true,
    pointerAtEnding: true,
    listening: false,
  });
}

/** Vertical dimension between y0 and y1 at `x`, text reading bottom-to-top. */
function verticalDim(
  parent: Parent,
  edgeX: number,
  x: number,
  y0: number,
  y1: number,
  text: string,
  name: string,
  textDx: number,
  fontSize = 12
): void {
  const over = x < edgeX ? x - EXT_OVER : x + EXT_OVER;
  parent.add(dimLine([edgeX, y0, over, y0]));
  parent.add(dimLine([edgeX, y1, over, y1]));
  parent.add(dimArrow([x, y0, x, y1]));
  parent.add(
    new Konva.Text({
      x: x + textDx,
      y: y1,
      width: Math.abs(y1 - y0),
      align: 'center',
      text,
      fontSize,
      fill: COL.dim,
      rotation: -90,
      listening: false,
      name,
    })
  );
}

/**
 * Overall width (below) and height (left) dimensions, plus the shape's own:
 * arch rise and radius, both trapezoid jamb heights, circle diameter.
 */
export function drawFrameDimensions(
  parent: Parent,
  f: PxRect,
  ctx: RenderCtx
): void {
  const { widthMm, heightMm, shape } = ctx.design.frame;
  const mm = (v: number): string => `${Math.round(v)} mm`;

  const wy = f.y + f.h + GAP;
  parent.add(dimLine([f.x, f.y + f.h, f.x, wy + EXT_OVER]));
  parent.add(dimLine([f.x + f.w, f.y + f.h, f.x + f.w, wy + EXT_OVER]));
  parent.add(dimArrow([f.x, wy, f.x + f.w, wy]));
  parent.add(
    new Konva.Text({
      x: f.x,
      y: wy + 5,
      width: f.w,
      align: 'center',
      text: shape.kind === 'circle' ? `Ø ${mm(widthMm)}` : mm(widthMm),
      fontSize: 12,
      fill: COL.dim,
      listening: false,
      name: 'dim-width',
    })
  );

  const bottom = f.y + f.h;
  if (shape.kind === 'trapezoid') {
    // Each jamb gets its own height; left/right follow the screen.
    const screenLeft = ctx.flip ? shape.rightHeightMm : shape.leftHeightMm;
    const screenRight = ctx.flip ? shape.leftHeightMm : shape.rightHeightMm;
    verticalDim(parent, f.x, f.x - GAP, bottom - ctx.px(screenLeft), bottom,
      mm(screenLeft), 'dim-height', -20);
    verticalDim(parent, f.x + f.w, f.x + f.w + GAP_RIGHT,
      bottom - ctx.px(screenRight), bottom, mm(screenRight),
      'dim-height-right', 3, 11);
    return;
  }

  verticalDim(parent, f.x, f.x - GAP, f.y, bottom, mm(heightMm), 'dim-height', -20);

  if (shape.kind === 'arch-top') {
    verticalDim(parent, f.x + f.w, f.x + f.w + GAP_RIGHT, f.y,
      f.y + ctx.px(shape.riseMm), `rise ${Math.round(shape.riseMm)}`,
      'dim-rise', 3, 11);
    parent.add(
      new Konva.Text({
        x: f.x,
        y: f.y - 17,
        width: f.w,
        align: 'center',
        text: `R ${Math.round(archRadiusMm(shape.riseMm, widthMm))} mm`,
        fontSize: 11,
        fill: COL.dim,
        listening: false,
        name: 'dim-radius',
      })
    );
  }
}
