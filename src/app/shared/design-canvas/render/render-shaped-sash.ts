/**
 * design-canvas renderer — an OPENING sash in a pane the frame shape cuts
 * (a round, half-round, arched or quarter pane). The sash is drawn to the
 * pane's real outline: the gap to the outer frame, the sash profile (straight
 * where it meets a mullion or transom, bent where it meets the curved frame),
 * the joints between its members, then the glass with its bead. Hinges sit on
 * a straight side only; a full round has pivot points or tilt bearings; the
 * handle lies on the profile, turned to follow it.
 *
 * Every point comes from design-model (shaped-sash.ts), in mm: nothing here
 * is a rectangle, so nothing can stand outside the frame or be cut by it.
 * The opening marks follow the one convention of render-casement: the point
 * of the triangle is on the hinge side, solid opens out, dashed opens in.
 */

import Konva from 'konva';
import {
  LeafNode,
  OpeningKind,
  PaneOutline,
  PointMm,
  ShapedSash,
  ShapedSashHardware,
  insetConvexPolygon,
  shapedSash,
  shapedSashHardware,
} from '../../design-model';
import { COL, Parent, RenderCtx, flatPx, sashFacePx, shadeColor } from './render-common';
import { drawGlass, sashColor } from './render-sash';
import { drawShapedPaneEdges } from './render-shaped';

const DASH = [6, 4];
/** Height of a door lever above the floor. */
const DOOR_HANDLE_MM = 1050;
const HARDWARE = '#4a4f55';
const HARDWARE_EDGE = '#2b2e33';

function boxPx(pts: number[]): { x: number; y: number; w: number; h: number } {
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

function clipTo(pts: number[], name: string): Konva.Group {
  return new Konva.Group({
    listening: false,
    name,
    clipFunc: (c) => {
      c.beginPath();
      c.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
      c.closePath();
    },
  });
}

/**
 * Draw the opening sash of a cut pane. Returns the glass outline (mm), or
 * null when the pane is too small to hold a sash (the caller draws glass).
 */
export function drawShapedSash(
  parent: Parent,
  leaf: LeafNode,
  outline: PaneOutline,
  kind: OpeningKind,
  ctx: RenderCtx,
  isDoorLeaf: boolean
): PointMm[] | null {
  const panePts = flatPx(ctx, outline.polygonMm);
  const pane = boxPx(panePts);
  const gapPx = ctx.detail === 'tiny' ? 1 : Math.max(1.5, Math.min(3, ctx.px(4)));
  const facePx = sashFacePx(ctx, leaf, isDoorLeaf ? 'door' : 'casement', pane);
  let sash: ShapedSash;
  try {
    sash = shapedSash(outline, gapPx / ctx.view.pxPerMm, facePx / ctx.view.pxPerMm);
  } catch {
    return null;
  }
  const outerPts = flatPx(ctx, sash.outerMm);
  const innerPts = flatPx(ctx, sash.innerMm);
  const tone = sashColor(ctx.color);

  // The rebate gap: the dark line between the outer frame and the sash.
  parent.add(
    new Konva.Line({
      points: panePts,
      closed: true,
      fill: shadeColor(ctx.color, -0.5),
      listening: false,
      name: 'sash-gap',
    })
  );
  // The sash profile, one closed band along the outline.
  const edge = new Konva.Line({
    points: outerPts,
    closed: true,
    fill: tone,
    stroke: COL.stroke,
    strokeWidth: 1.5,
    lineJoin: 'round',
    listening: false,
    name: 'sash-outline-edge',
  });
  edge.setAttrs({ paneId: leaf.id, shaped: true, opening: kind });
  parent.add(edge);
  if (ctx.detail !== 'tiny' && facePx >= 6) {
    // The bevel of the profile: a lit line a third of the way in.
    try {
      const bevel = insetConvexPolygon(outline.polygonMm, sash.gapMm + sash.faceMm * 0.35);
      parent.add(
        new Konva.Line({
          points: flatPx(ctx, bevel),
          closed: true,
          stroke: shadeColor(tone, 0.45),
          strokeWidth: 1,
          listening: false,
          name: 'sash-bevel',
        })
      );
    } catch {
      /* no room for the bevel line */
    }
  }
  // Glass, inside the profile's inner edge, with its gasket line and bead.
  const glass = clipTo(innerPts, 'sash-glass-clip');
  parent.add(glass);
  drawGlass(glass, leaf, boxPx(innerPts), ctx);
  // Where two members of the sash meet.
  for (const j of sash.joints) {
    const a = ctx.pt(j.outer.xMm, j.outer.yMm);
    const b = ctx.pt(j.inner.xMm, j.inner.yMm);
    const joint = new Konva.Line({
      points: [a.x, a.y, b.x, b.y],
      stroke: COL.stroke,
      strokeWidth: 1,
      listening: false,
      name: 'sash-joint',
    });
    joint.setAttr('paneId', leaf.id);
    parent.add(joint);
  }
  drawShapedPaneEdges(parent, leaf, sash.innerMm, ctx);

  const door = isDoorLeaf ? ctx.design.door ?? null : null;
  const hw = shapedSashHardware(sash, kind, {
    hingeCount: door || leaf.opening?.hingesType === '3D Hinges' ? 3 : 2,
    doorLeverMm: door ? DOOR_HANDLE_MM : undefined,
  });
  const tiltTurn = kind.startsWith('Tilt');
  const inward = door ? door.swing === 'In' : tiltTurn;
  drawMarks(parent, hw, inward, ctx);
  if (door && sash.straight[hw.hinges[0]?.side ?? 'left']) {
    drawSwing(parent, sash, hw, innerPts, door.swing, ctx);
  }
  drawHardware(parent, hw, facePx, pane, !!door, ctx);
  return sash.innerMm;
}

/** Opening triangles and the pivot axis, over the glass. */
function drawMarks(parent: Parent, hw: ShapedSashHardware, inward: boolean, ctx: RenderCtx): void {
  for (const m of hw.marks) {
    const a = ctx.pt(m.from.xMm, m.from.yMm);
    const b = ctx.pt(m.to.xMm, m.to.yMm);
    const dashed = m.motion === 'pivot' ? !!m.inward : inward;
    const line = new Konva.Line({
      points: [a.x, a.y, b.x, b.y],
      stroke: COL.symbol,
      strokeWidth: 1.5,
      dash: dashed ? DASH : [],
      listening: false,
      name: 'opening-symbol',
    });
    line.setAttrs({ hingeSide: m.hingeSide, dashed, motion: m.motion, shaped: true });
    parent.add(line);
  }
  if (hw.axis) {
    const a = ctx.pt(hw.axis[0].xMm, hw.axis[0].yMm);
    const b = ctx.pt(hw.axis[1].xMm, hw.axis[1].yMm);
    parent.add(
      new Konva.Line({
        points: [a.x, a.y, b.x, b.y],
        stroke: COL.symbol,
        strokeWidth: 1,
        dash: [12, 3, 2, 3],
        listening: false,
        name: 'pivot-axis',
      })
    );
  }
}

/** Door swing: a quarter arc from the foot of the hinged side, kept on the glass. */
function drawSwing(
  parent: Parent,
  sash: ShapedSash,
  hw: ShapedSashHardware,
  innerPts: number[],
  swing: 'In' | 'Out',
  ctx: RenderCtx
): void {
  const side = hw.hinges[0]?.side;
  const run = side ? sash.straight[side] : null;
  if (!run || (side !== 'left' && side !== 'right')) return;
  const foot = ctx.pt(hw.hinges[0].at.xMm, run.toMm);
  const far = ctx.pt(hw.handle ? hw.handle.at.xMm : hw.hinges[0].at.xMm, run.toMm);
  const g = boxPx(innerPts);
  const towards = far.x >= foot.x ? 1 : -1;
  const radius = Math.max(8, Math.min(g.w * 0.86, g.h * 0.45));
  const points: number[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = ((Math.PI / 2) * i) / 24;
    points.push(foot.x + towards * radius * Math.cos(a), foot.y - radius * Math.sin(a));
  }
  const clip = clipTo(innerPts, 'door-swing-clip');
  parent.add(clip);
  const dashed = swing === 'In';
  const arc = new Konva.Line({
    points,
    stroke: COL.symbol,
    strokeWidth: 1.5,
    dash: dashed ? DASH : [],
    listening: false,
    name: 'door-swing',
  });
  arc.setAttrs({ hingeSide: side, dashed, swing, shaped: true });
  clip.add(arc);
  if (ctx.detail === 'tiny' || radius < 44) return;
  clip.add(
    new Konva.Text({
      x: towards > 0 ? foot.x + radius * 0.5 : foot.x - radius * 0.5 - 30,
      y: foot.y - radius * 0.5 - 6,
      width: 30,
      align: 'center',
      text: swing.toUpperCase(),
      fontSize: 10,
      fontStyle: 'bold',
      fill: COL.symbol,
      listening: false,
      name: 'door-swing-label',
    })
  );
}

/** Hinges, pivot points, tilt bearings and stays, and the handle on the profile. */
function drawHardware(
  parent: Parent,
  hw: ShapedSashHardware,
  facePx: number,
  pane: { w: number; h: number },
  door: boolean,
  ctx: RenderCtx
): void {
  const tiny = ctx.detail === 'tiny';
  const short = Math.min(pane.w, pane.h);
  const barrelLen = Math.max(tiny ? 4 : 8, Math.min(16, short * 0.12));
  const barrelW = Math.max(tiny ? 2 : 4, Math.min(7, short * 0.05));
  for (const h of hw.hinges) {
    const p = ctx.pt(h.at.xMm, h.at.yMm);
    const alongX = h.side === 'top' || h.side === 'bottom';
    const mark = new Konva.Rect({
      x: p.x - (alongX ? barrelLen : barrelW) / 2,
      y: p.y - (alongX ? barrelW : barrelLen) / 2,
      width: alongX ? barrelLen : barrelW,
      height: alongX ? barrelW : barrelLen,
      fill: '#8a9097',
      stroke: '#3a3d42',
      strokeWidth: tiny ? 0.5 : 1,
      cornerRadius: barrelW / 2,
      listening: false,
      name: 'hinge-mark',
    });
    mark.setAttrs({ side: h.side, shaped: true });
    parent.add(mark);
  }
  const dot = (at: PointMm, name: string): void => {
    const p = ctx.pt(at.xMm, at.yMm);
    const r = Math.max(tiny ? 2 : 3.5, Math.min(6, short * 0.03));
    parent.add(
      new Konva.Circle({
        x: p.x,
        y: p.y,
        radius: r,
        fill: '#8a9097',
        stroke: '#3a3d42',
        strokeWidth: tiny ? 0.5 : 1,
        listening: false,
        name,
      })
    );
    if (name === 'pivot-mark' && !tiny) {
      parent.add(new Konva.Circle({ x: p.x, y: p.y, radius: 1, fill: '#1c1e21', listening: false, name: 'pivot-pin' }));
    }
  };
  hw.pivots.forEach((p) => dot(p, 'pivot-mark'));
  hw.bearings.forEach((p) => dot(p, 'tilt-bearing'));
  for (const [from, to] of hw.stays) {
    const a = ctx.pt(from.xMm, from.yMm);
    const b = ctx.pt(to.xMm, to.yMm);
    parent.add(
      new Konva.Line({
        points: [a.x, a.y, b.x, b.y],
        stroke: HARDWARE,
        strokeWidth: tiny ? 1.5 : 3,
        lineCap: 'round',
        listening: false,
        name: 'tilt-stay',
      })
    );
  }
  if (!hw.handle) return;
  const at = ctx.pt(hw.handle.at.xMm, hw.handle.at.yMm);
  // The direction of the profile on screen (a mirrored view turns it over).
  const ahead = ctx.pt(
    hw.handle.at.xMm + Math.cos(hw.handle.angleRad) * 10,
    hw.handle.at.yMm + Math.sin(hw.handle.angleRad) * 10
  );
  const angle = Math.atan2(ahead.y - at.y, ahead.x - at.x);
  const len = Math.max(tiny ? 6 : 10, Math.min(24, short * 0.16));
  const thick = Math.max(2, Math.min(5, facePx * 0.45));
  const glyph = new Konva.Rect({
    x: at.x,
    y: at.y,
    offsetX: len / 2,
    offsetY: thick / 2,
    width: len,
    height: thick,
    rotation: (angle * 180) / Math.PI,
    fill: HARDWARE,
    stroke: HARDWARE_EDGE,
    strokeWidth: tiny ? 0.5 : 1,
    cornerRadius: Math.min(2, thick / 2),
    listening: false,
    name: 'handle-glyph',
  });
  glyph.setAttrs({ edge: hw.handle.side, shaped: true });
  parent.add(glyph);
  if (door && hw.hinges.length) {
    // The lever, level, pointing back towards the hinges.
    const hinge = ctx.pt(hw.hinges[0].at.xMm, hw.hinges[0].at.yMm);
    const back = hinge.x < at.x ? -1 : 1;
    const leverLen = Math.max(6, Math.min(20, pane.w * 0.18));
    const h = tiny ? 2 : 4;
    parent.add(
      new Konva.Rect({
        x: back < 0 ? at.x - leverLen : at.x,
        y: at.y - h / 2,
        width: leverLen,
        height: h,
        fill: HARDWARE,
        stroke: HARDWARE_EDGE,
        strokeWidth: tiny ? 0.5 : 1,
        cornerRadius: 2,
        listening: false,
        name: 'door-lever',
      })
    );
  }
}
