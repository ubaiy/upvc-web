/**
 * design-canvas renderer — render = f(model). Konva lives ONLY here.
 *
 * Draws a WindowDesign from the design-model `layout()` (all geometry in mm,
 * converted to px through the ViewTransform) onto one Konva layer: mitred
 * frame bands, mullion/transom bars, sash bands, glass tint, opening
 * symbology (fixed / side-hung / tilt & turn / awning / hopper), sliding
 * panels with tracks + fly mesh, mm dimension lines for the frame and every
 * pane, selection highlight, drag ghost and live readout.
 *
 * The renderer attaches NO event handlers and holds NO state: the component
 * hit-tests pointer positions against the same layout (canvas-view.ts), so
 * what you see and what you hit can never disagree.
 */

import Konva from 'konva';
import {
  getFramePoints,
  createFrameLine,
} from '../configs/design/framePoints.config';
import {
  Layout,
  LeafNode,
  RectMm,
  SlideSpec,
  TrackType,
  WindowDesign,
  isSplit,
  walkLeaves,
} from '../design-model';
import {
  CanvasSelection,
  ViewTransform,
  pxFromMm,
} from './canvas-view';

/* ------------------------------------------------------------------ */
/* Public interface                                                    */
/* ------------------------------------------------------------------ */

/** Ghost divider shown while a palette split tool hovers a pane. */
export interface RenderGhost {
  paneId: string;
  axis: 'x' | 'y';
  /** Centreline mm from the pane's content left/top edge. */
  posMm: number;
}

/** Floating mm readout (drag feedback), anchored in mm space. */
export interface RenderReadout {
  xMm: number;
  yMm: number;
  text: string;
}

export interface RenderUi {
  selection: CanvasSelection | null;
  ghost?: RenderGhost | null;
  readout?: RenderReadout | null;
  /** Draw the corner resize handle (hidden when read-only). */
  showFrameHandle: boolean;
  /** Visible keyboard-focus ring around the drawing. */
  focused?: boolean;
}

export interface RenderOpts {
  stageWPx: number;
  stageHPx: number;
  frameFaceMm: number;
  profileColor: string;
}

const COL = {
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

/** Full redraw of one design onto `layer` (cleared first). */
export function renderDesign(
  layer: Konva.Layer,
  design: WindowDesign,
  lay: Layout,
  view: ViewTransform,
  ui: RenderUi,
  opts: RenderOpts
): void {
  layer.destroyChildren();

  // Opaque background so stage.toDataURL() captures print-clean white.
  layer.add(
    new Konva.Rect({
      x: 0,
      y: 0,
      width: opts.stageWPx,
      height: opts.stageHPx,
      fill: '#ffffff',
      listening: false,
      name: 'canvas-bg',
    })
  );

  const px = (mm: number): number => mm * view.pxPerMm;
  const toPx = (r: RectMm): { x: number; y: number; w: number; h: number } => {
    const p = pxFromMm(view, r.xMm, r.yMm);
    return { x: p.x, y: p.y, w: px(r.wMm), h: px(r.hMm) };
  };

  const frame = toPx({
    xMm: 0,
    yMm: 0,
    wMm: design.frame.widthMm,
    hMm: design.frame.heightMm,
  });
  const facePx = Math.max(2, px(opts.frameFaceMm));
  const color = opts.profileColor || '#ffffff';

  drawOuterFrame(layer, frame, facePx, color);
  drawFrameDimensions(layer, frame, design.frame.widthMm, design.frame.heightMm);

  // Sash bands around sashFramed regions (palla sashes), drawn before glass.
  for (const [, nl] of lay.nodes) {
    if (nl.node.sashFramed) {
      const r = toPx(nl.rect);
      drawBevelBands(layer, r.x, r.y, r.w, r.h, facePx, color, 'sash-band');
    }
  }

  const rootIsLeaf = !isSplit(design.root);
  for (const l of lay.leaves) {
    drawLeaf(layer, design, l.leaf, toPx(l.rect), view, opts, !rootIsLeaf);
  }

  for (const d of lay.dividers) {
    const r = toPx(d.rect);
    const bar = new Konva.Rect({
      x: r.x,
      y: r.y,
      width: Math.max(2, r.w),
      height: Math.max(2, r.h),
      fill: shadeColor(color, color === '#ffffff' ? -0.18 : -0.08),
      stroke: COL.stroke,
      strokeWidth: 1.5,
      listening: false,
      name: 'divider-bar',
    });
    bar.setAttrs({ splitId: d.split.id, dividerIndex: d.index });
    layer.add(bar);
  }

  drawSelection(layer, lay, view, ui.selection, frame);
  drawGhost(layer, lay, view, ui.ghost ?? null);

  if (ui.showFrameHandle) {
    const hs = 9;
    layer.add(
      new Konva.Rect({
        x: frame.x + frame.w - hs / 2,
        y: frame.y + frame.h - hs / 2,
        width: hs,
        height: hs,
        fill: '#ffffff',
        stroke: COL.selectStroke,
        strokeWidth: 1.5,
        listening: false,
        name: 'frame-handle',
      })
    );
  }

  if (ui.readout) {
    const p = pxFromMm(view, ui.readout.xMm, ui.readout.yMm);
    const label = new Konva.Label({ x: p.x + 12, y: p.y - 26, listening: false, name: 'drag-readout' });
    label.add(
      new Konva.Tag({ fill: '#111827', cornerRadius: 3, pointerDirection: 'down', pointerWidth: 6, pointerHeight: 5 })
    );
    label.add(
      new Konva.Text({
        text: ui.readout.text,
        fontSize: 12,
        padding: 5,
        fill: '#ffffff',
      })
    );
    layer.add(label);
  }

  if (ui.focused) {
    layer.add(
      new Konva.Rect({
        x: 1.5,
        y: 1.5,
        width: opts.stageWPx - 3,
        height: opts.stageHPx - 3,
        stroke: COL.selectStroke,
        strokeWidth: 2,
        dash: [6, 4],
        listening: false,
        name: 'focus-ring',
        opacity: 0.7,
      })
    );
  }

  layer.batchDraw();
}

/* ------------------------------------------------------------------ */
/* Frame                                                               */
/* ------------------------------------------------------------------ */

function drawOuterFrame(
  layer: Konva.Layer,
  f: { x: number; y: number; w: number; h: number },
  facePx: number,
  color: string
): void {
  const back = new Konva.Rect({
    x: f.x,
    y: f.y,
    width: f.w,
    height: f.h,
    fill: color,
    stroke: COL.stroke,
    strokeWidth: 1,
    listening: false,
    name: 'frame-back',
    shadowColor: '#000000',
    shadowBlur: 10,
    shadowOffset: { x: 2, y: 4 },
    shadowOpacity: 0.22,
  });
  layer.add(back);
  drawBevelBands(layer, f.x, f.y, f.w, f.h, facePx, color, 'frame-band');
}

/**
 * Four mitred polygon bands with a two-tone bevel (light from top-left) plus
 * the inner reveal hairline — the profile look of the quotation designer.
 */
function drawBevelBands(
  layer: Konva.Layer,
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
    layer.add(band);
  }
  const inW = w - 2 * facePx;
  const inH = h - 2 * facePx;
  if (inW > 0 && inH > 0) {
    layer.add(
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

function drawFrameDimensions(
  layer: Konva.Layer,
  f: { x: number; y: number; w: number; h: number },
  wMm: number,
  hMm: number
): void {
  const col = COL.dim;
  const extOver = 6;
  const gap = 28;
  const line = (points: number[]): Konva.Line =>
    new Konva.Line({ points, stroke: col, strokeWidth: 0.75, listening: false });
  const arrow = (points: number[]): Konva.Arrow =>
    new Konva.Arrow({
      points,
      stroke: col,
      fill: col,
      strokeWidth: 1,
      pointerLength: 6,
      pointerWidth: 6,
      pointerAtBeginning: true,
      pointerAtEnding: true,
      listening: false,
    });

  const wy = f.y + f.h + gap;
  layer.add(line([f.x, f.y + f.h, f.x, wy + extOver]));
  layer.add(line([f.x + f.w, f.y + f.h, f.x + f.w, wy + extOver]));
  layer.add(arrow([f.x, wy, f.x + f.w, wy]));
  layer.add(
    new Konva.Text({
      x: f.x,
      y: wy + 5,
      width: f.w,
      align: 'center',
      text: `${Math.round(wMm)} mm`,
      fontSize: 12,
      fill: col,
      listening: false,
      name: 'dim-width',
    })
  );

  const hx = f.x - gap;
  layer.add(line([f.x, f.y, hx - extOver, f.y]));
  layer.add(line([f.x, f.y + f.h, hx - extOver, f.y + f.h]));
  layer.add(arrow([hx, f.y, hx, f.y + f.h]));
  layer.add(
    new Konva.Text({
      x: hx - 20,
      y: f.y + f.h,
      width: f.h,
      align: 'center',
      text: `${Math.round(hMm)} mm`,
      fontSize: 12,
      fill: col,
      rotation: -90,
      listening: false,
      name: 'dim-height',
    })
  );
}

/* ------------------------------------------------------------------ */
/* Leaves                                                              */
/* ------------------------------------------------------------------ */

function drawLeaf(
  layer: Konva.Layer,
  design: WindowDesign,
  leaf: LeafNode,
  r: { x: number; y: number; w: number; h: number },
  view: ViewTransform,
  opts: RenderOpts,
  showLabel: boolean
): void {
  const glass = new Konva.Rect({
    x: r.x,
    y: r.y,
    width: r.w,
    height: r.h,
    stroke: COL.stroke,
    strokeWidth: 1,
    listening: false,
    name: 'glass-pane',
    fillLinearGradientStartPoint: { x: 0, y: 0 },
    fillLinearGradientEndPoint: { x: 0, y: r.h },
    fillLinearGradientColorStops: [0, COL.glassTop, 1, COL.glassBottom],
  });
  glass.setAttr('paneId', leaf.id);
  layer.add(glass);
  drawGlassReflection(layer, r.x, r.y, r.w, r.h);

  // Glazing / Georgian bars from the document's glazing spec.
  drawGlazingBars(
    layer,
    r.x,
    r.y,
    r.w,
    r.h,
    design.glazing.barsV,
    design.glazing.barsH,
    opts.profileColor
  );

  if (leaf.category === 'Slidding' && leaf.slide) {
    drawSlidingLeaf(layer, leaf.slide, r, view);
  } else if (leaf.category === 'Casement' && leaf.casementType === 'Openable') {
    drawOpenableCasement(layer, leaf, r, view, opts);
  }

  if (showLabel) {
    const wMm = Math.round(r.w / view.pxPerMm);
    const hMm = Math.round(r.h / view.pxPerMm);
    const label = new Konva.Text({
      text: `${wMm} × ${hMm} mm`,
      fontSize: 11,
      fill: COL.label,
      listening: false,
      name: 'pane-label',
    });
    // Centred on a white pill so sash bands / opening symbols never cross it.
    const textW = label.width();
    const lx = r.x + (r.w - textW) / 2;
    const ly = r.y + 6;
    label.position({ x: lx, y: ly });
    label.setAttrs({ paneId: leaf.id, wMm, hMm });
    layer.add(
      new Konva.Rect({
        x: lx - 4,
        y: ly - 2,
        width: textW + 8,
        height: label.height() + 4,
        cornerRadius: 3,
        fill: '#ffffff',
        opacity: 0.85,
        listening: false,
        name: 'pane-label-bg',
      })
    );
    layer.add(label);
  }
}

function drawGlassReflection(
  layer: Konva.Layer,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  layer.add(
    new Konva.Line({
      points: [
        x + w * 0.52, y,
        x + w * 0.72, y,
        x + w * 0.32, y + h,
        x + w * 0.12, y + h,
      ],
      closed: true,
      fill: 'rgba(255,255,255,0.28)',
      listening: false,
      name: 'glass-reflection',
    })
  );
}

function drawGlazingBars(
  layer: Konva.Layer,
  x: number,
  y: number,
  w: number,
  h: number,
  vBars: number,
  hBars: number,
  color: string
): void {
  const barPx = 3;
  const fill = color && color !== '#ffffff' ? color : '#bfbfbf';
  for (let i = 1; i <= vBars; i++) {
    const bx = x + (w / (vBars + 1)) * i;
    layer.add(
      new Konva.Rect({
        x: bx - barPx / 2,
        y,
        width: barPx,
        height: h,
        fill,
        stroke: '#777777',
        strokeWidth: 0.5,
        listening: false,
        name: 'glazing-bar',
      })
    );
  }
  for (let j = 1; j <= hBars; j++) {
    const by = y + (h / (hBars + 1)) * j;
    layer.add(
      new Konva.Rect({
        x,
        y: by - barPx / 2,
        width: w,
        height: barPx,
        fill,
        stroke: '#777777',
        strokeWidth: 0.5,
        listening: false,
        name: 'glazing-bar',
      })
    );
  }
}

/* ------------------------------------------------------------------ */
/* Casement symbology                                                  */
/* ------------------------------------------------------------------ */

function drawOpenableCasement(
  layer: Konva.Layer,
  leaf: LeafNode,
  r: { x: number; y: number; w: number; h: number },
  view: ViewTransform,
  opts: RenderOpts
): void {
  const inset = Math.max(3, Math.round(opts.frameFaceMm * view.pxPerMm * 0.55));
  layer.add(
    new Konva.Rect({
      x: r.x + inset,
      y: r.y + inset,
      width: r.w - 2 * inset,
      height: r.h - 2 * inset,
      stroke: '#555555',
      strokeWidth: 3,
      listening: false,
      name: 'sash-outline',
    })
  );

  const dir = (leaf.opening?.direction || 'Left').toLowerCase();
  const tiltTurn = dir.startsWith('tilt');
  if (tiltTurn) {
    const turnSide: Side = dir.includes('right') ? 'right' : 'left';
    drawEgress(layer, r, turnSide, false);
    drawEgress(layer, r, 'top', true);
    drawHandleGlyph(layer, r, turnSide === 'left' ? 'right' : 'left');
    drawHingeMarks(layer, r, turnSide, hingeCount(leaf));
    return;
  }
  const side: Side =
    dir === 'right' ? 'right' : dir === 'top' ? 'top' : dir === 'bottom' ? 'bottom' : 'left';
  drawEgress(layer, r, side, false);
  drawHandleGlyph(layer, r, opposite(side));
  drawHingeMarks(layer, r, side, hingeCount(leaf));
}

type Side = 'left' | 'right' | 'top' | 'bottom';

function opposite(side: Side): Side {
  return side === 'left'
    ? 'right'
    : side === 'right'
      ? 'left'
      : side === 'top'
        ? 'bottom'
        : 'top';
}

function hingeCount(leaf: LeafNode): number {
  return leaf.opening?.hingesType === '3D Hinges' ? 3 : 2;
}

/**
 * Egress chevron: apex on the HINGE side (window symbology convention —
 * solid = turn, dashed = tilt).
 */
function drawEgress(
  layer: Konva.Layer,
  r: { x: number; y: number; w: number; h: number },
  side: Side,
  dashed: boolean
): void {
  const { x, y, w, h } = r;
  const cx = x + w / 2;
  const cy = y + h / 2;
  let sets: number[][];
  switch (side) {
    case 'right':
      sets = [[x, y, x + w, cy], [x, y + h, x + w, cy]];
      break;
    case 'top':
      sets = [[x, y + h, cx, y], [x + w, y + h, cx, y]];
      break;
    case 'bottom':
      sets = [[x, y, cx, y + h], [x + w, y, cx, y + h]];
      break;
    default:
      sets = [[x + w, y, x, cy], [x + w, y + h, x, cy]];
      break;
  }
  for (const points of sets) {
    layer.add(
      new Konva.Line({
        points,
        stroke: COL.symbol,
        strokeWidth: 1.5,
        dash: dashed ? [6, 4] : [],
        listening: false,
        name: 'opening-symbol',
      })
    );
  }
}

/** Simple lever-bar handle glyph centred on `edge`. */
function drawHandleGlyph(
  layer: Konva.Layer,
  r: { x: number; y: number; w: number; h: number },
  edge: Side
): void {
  const { x, y, w, h } = r;
  const len = Math.max(12, Math.min(22, Math.min(w, h) * 0.2));
  const thick = 5;
  const pad = 4;
  let rx: number, ry: number, rw: number, rh: number;
  switch (edge) {
    case 'right':
      rx = x + w - pad - thick;
      ry = y + h / 2 - len / 2;
      rw = thick;
      rh = len;
      break;
    case 'top':
      rx = x + w / 2 - len / 2;
      ry = y + pad;
      rw = len;
      rh = thick;
      break;
    case 'bottom':
      rx = x + w / 2 - len / 2;
      ry = y + h - pad - thick;
      rw = len;
      rh = thick;
      break;
    default:
      rx = x + pad;
      ry = y + h / 2 - len / 2;
      rw = thick;
      rh = len;
      break;
  }
  layer.add(
    new Konva.Rect({
      x: rx,
      y: ry,
      width: rw,
      height: rh,
      fill: '#4a4f55',
      stroke: '#2b2e33',
      strokeWidth: 1,
      cornerRadius: 2,
      listening: false,
      name: 'handle-glyph',
    })
  );
}

/** Hinge knuckles flush on the hinge stile. */
function drawHingeMarks(
  layer: Konva.Layer,
  r: { x: number; y: number; w: number; h: number },
  side: Side,
  count: number
): void {
  const { x, y, w, h } = r;
  const barrelLen = Math.max(8, Math.min(16, Math.min(w, h) * 0.14));
  const barrelW = Math.max(5, Math.min(9, Math.min(w, h) * 0.08));
  const alongIsX = side === 'top' || side === 'bottom';
  for (let i = 1; i <= count; i++) {
    const f = i / (count + 1);
    let bcx: number, bcy: number;
    switch (side) {
      case 'right':
        bcx = x + w - barrelW / 2;
        bcy = y + h * f;
        break;
      case 'top':
        bcx = x + w * f;
        bcy = y + barrelW / 2;
        break;
      case 'bottom':
        bcx = x + w * f;
        bcy = y + h - barrelW / 2;
        break;
      default:
        bcx = x + barrelW / 2;
        bcy = y + h * f;
        break;
    }
    layer.add(
      new Konva.Rect({
        x: bcx - (alongIsX ? barrelLen : barrelW) / 2,
        y: bcy - (alongIsX ? barrelW : barrelLen) / 2,
        width: alongIsX ? barrelLen : barrelW,
        height: alongIsX ? barrelW : barrelLen,
        fill: '#8a9097',
        stroke: '#3a3d42',
        strokeWidth: 1,
        cornerRadius: barrelW / 2,
        listening: false,
        name: 'hinge-mark',
      })
    );
  }
}

/* ------------------------------------------------------------------ */
/* Sliding                                                             */
/* ------------------------------------------------------------------ */

const TRACK_COUNT: Record<TrackType, number> = {
  '2 Track': 2,
  '2.5 Track': 2,
  '3 Track': 3,
  '4 Track': 4,
};

interface PanelGeom {
  xMm: number;
  widthMm: number;
  track: number;
  direction: 'Left' | 'Right';
}

/**
 * Panel geometry within the leaf daylight: overlap derived from stored
 * widths ((Σw − daylight)/(n−1), floored at 0), mirrored track assignment
 * (outer panels on the outer track). Mirrors the design-model slide layout
 * semantics; swap to the library's slideLayout() once the Phase 2 slide
 * module lands on the branch.
 */
function panelGeometry(slide: SlideSpec, daylightWMm: number): PanelGeom[] {
  const n = slide.panels.length;
  const sum = slide.panels.reduce((a, p) => a + p.widthMm, 0);
  const overlap = n > 1 ? Math.max(0, (sum - daylightWMm) / (n - 1)) : 0;
  const out: PanelGeom[] = [];
  let x = 0;
  slide.panels.forEach((p, i) => {
    out.push({
      xMm: x,
      widthMm: p.widthMm,
      track: Math.min(i, n - 1 - i, TRACK_COUNT[slide.tracks] - 1),
      direction: p.direction,
    });
    x += p.widthMm - overlap;
  });
  return out;
}

function drawSlidingLeaf(
  layer: Konva.Layer,
  slide: SlideSpec,
  r: { x: number; y: number; w: number; h: number },
  view: ViewTransform
): void {
  const daylightWMm = r.w / view.pxPerMm;
  const panels = panelGeometry(slide, daylightWMm);
  const trackCount = TRACK_COUNT[slide.tracks];
  const trackStep = 3; // px depth offset per track

  // Track channels: thin rails along the bottom of the opening, one per track.
  const railH = 3;
  for (let t = 0; t < trackCount; t++) {
    layer.add(
      new Konva.Rect({
        x: r.x + 2,
        y: r.y + r.h - 6 - t * (railH + 2),
        width: r.w - 4,
        height: railH,
        fill: '#9aa0a6',
        stroke: '#6b7280',
        strokeWidth: 0.5,
        listening: false,
        name: 'track-line',
      })
    );
  }

  panels.forEach((p, i) => {
    const depth = p.track * trackStep;
    const px = r.x + p.xMm * view.pxPerMm;
    const pw = p.widthMm * view.pxPerMm;
    const py = r.y + 3 + depth;
    const ph = r.h - 6 - 2 * depth - trackCount * 4;
    const panel = new Konva.Rect({
      x: px + 1,
      y: py,
      width: Math.max(4, pw - 2),
      height: Math.max(10, ph),
      stroke: '#555555',
      strokeWidth: 3,
      fill: 'rgba(255,255,255,0.06)',
      listening: false,
      name: 'slide-panel',
    });
    panel.setAttr('panelIndex', i);
    layer.add(panel);

    // Direction arrow at mid height.
    const slidesRight = p.direction === 'Right';
    const margin = Math.max(8, pw * 0.22);
    const cy = py + Math.max(10, ph) / 2;
    const xL = px + margin;
    const xR = px + pw - margin;
    layer.add(
      new Konva.Arrow({
        points: slidesRight ? [xL, cy, xR, cy] : [xR, cy, xL, cy],
        stroke: COL.symbol,
        fill: COL.symbol,
        strokeWidth: 2,
        pointerLength: 9,
        pointerWidth: 9,
        listening: false,
        name: 'slide-arrow',
      })
    );

    // Panel width label along the bottom.
    const label = new Konva.Text({
      x: px,
      y: r.y + r.h - 6 - trackCount * 5 - 14,
      width: Math.max(10, pw),
      align: 'center',
      text: `${Math.round(p.widthMm)}`,
      fontSize: 10,
      fill: COL.label,
      listening: false,
      name: 'slide-panel-label',
    });
    layer.add(label);
  });

  if (slide.mesh) {
    const meshW = r.w / 2;
    const meshX = (slide.meshPosition ?? 'Left') === 'Left' ? r.x : r.x + r.w - meshW;
    drawFlyMesh(layer, meshX, r.y + 2, meshW, r.h - 4);
  }
}

function drawFlyMesh(
  layer: Konva.Layer,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  if (w <= 0 || h <= 0) return;
  const mesh = new Konva.Group({ listening: false, name: 'fly-mesh' });
  const step = 7;
  for (let mx = x + step; mx < x + w; mx += step) {
    mesh.add(
      new Konva.Line({
        points: [mx, y, mx, y + h],
        stroke: COL.mesh,
        strokeWidth: 0.5,
        opacity: 0.6,
        listening: false,
      })
    );
  }
  for (let my = y + step; my < y + h; my += step) {
    mesh.add(
      new Konva.Line({
        points: [x, my, x + w, my],
        stroke: COL.mesh,
        strokeWidth: 0.5,
        opacity: 0.6,
        listening: false,
      })
    );
  }
  mesh.add(
    new Konva.Text({
      x,
      y: y + 4,
      width: w,
      align: 'center',
      text: 'Fly Mesh',
      fontSize: 10,
      fill: '#374151',
      listening: false,
    })
  );
  layer.add(mesh);
}

/* ------------------------------------------------------------------ */
/* Selection / ghost                                                   */
/* ------------------------------------------------------------------ */

function drawSelection(
  layer: Konva.Layer,
  lay: Layout,
  view: ViewTransform,
  selection: CanvasSelection | null,
  frame: { x: number; y: number; w: number; h: number }
): void {
  if (!selection) return;
  let rect: { x: number; y: number; w: number; h: number } | null = null;
  if (selection.type === 'frame') {
    rect = frame;
  } else if (selection.type === 'pane') {
    const nl = lay.nodes.get(selection.paneId);
    if (nl) {
      const p = pxFromMm(view, nl.rect.xMm, nl.rect.yMm);
      rect = { x: p.x, y: p.y, w: nl.rect.wMm * view.pxPerMm, h: nl.rect.hMm * view.pxPerMm };
    }
  } else {
    const d = lay.dividers.find(
      (dv) => dv.split.id === selection.splitId && dv.index === selection.index
    );
    if (d) {
      const p = pxFromMm(view, d.rect.xMm, d.rect.yMm);
      rect = { x: p.x, y: p.y, w: d.rect.wMm * view.pxPerMm, h: d.rect.hMm * view.pxPerMm };
    }
  }
  if (!rect) return;
  const hl = new Konva.Rect({
    x: rect.x,
    y: rect.y,
    width: Math.max(3, rect.w),
    height: Math.max(3, rect.h),
    fill: selection.type === 'frame' ? undefined : COL.select,
    stroke: COL.selectStroke,
    strokeWidth: 2.5,
    listening: false,
    name: 'selection-highlight',
  });
  layer.add(hl);
}

function drawGhost(
  layer: Konva.Layer,
  lay: Layout,
  view: ViewTransform,
  ghost: RenderGhost | null
): void {
  if (!ghost) return;
  const nl = lay.nodes.get(ghost.paneId);
  if (!nl) return;
  const c = nl.content;
  let points: number[];
  let labelPos: { x: number; y: number };
  if (ghost.axis === 'x') {
    const gx = c.xMm + ghost.posMm;
    const a = pxFromMm(view, gx, c.yMm);
    const b = pxFromMm(view, gx, c.yMm + c.hMm);
    points = [a.x, a.y, b.x, b.y];
    labelPos = { x: a.x, y: a.y };
  } else {
    const gy = c.yMm + ghost.posMm;
    const a = pxFromMm(view, c.xMm, gy);
    const b = pxFromMm(view, c.xMm + c.wMm, gy);
    points = [a.x, a.y, b.x, b.y];
    labelPos = { x: a.x, y: a.y };
  }
  layer.add(
    new Konva.Line({
      points,
      stroke: COL.ghost,
      strokeWidth: 3,
      dash: [8, 5],
      listening: false,
      name: 'ghost-line',
    })
  );
  layer.add(
    new Konva.Text({
      x: labelPos.x + 6,
      y: labelPos.y - 16,
      text: `${Math.round(ghost.posMm)} mm`,
      fontSize: 11,
      fill: COL.ghost,
      listening: false,
      name: 'ghost-label',
    })
  );
}

/* ------------------------------------------------------------------ */
/* Colour helper                                                       */
/* ------------------------------------------------------------------ */

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
