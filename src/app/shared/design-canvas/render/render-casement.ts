/**
 * design-canvas renderer — an opening sash and its symbols: the sash frame
 * inside the outer frame (two rectangles with the rebate gap between them),
 * the opening triangle, hinge marks, the handle, the door swing arc and the
 * door threshold.
 *
 * THE CONVENTION (one, stated in the key under every drawing):
 *  - the triangle's apex is on the HINGE side;
 *  - a solid triangle opens OUTWARD, a dashed one opens INWARD;
 *  - tilt and turn has two triangles: the turn one (apex on the hinge
 *    stile) and the tilt one (apex on the bottom rail, where it is hinged
 *    when tilted). Both are dashed: tilt and turn opens inward.
 * A window casement opens outward (the model has no inward casement); a
 * door follows its swing. Model sides are as seen from OUTSIDE; the inside
 * view mirrors them and keeps the line style, so the key stays true.
 */

import Konva from 'konva';
import { LeafNode, RectMm } from '../../design-model';
import {
  COL,
  Parent,
  PxRect,
  RenderCtx,
  Side,
  insetPx,
  opposite,
  sashFacePx,
  screenSide,
  shadeColor,
} from './render-common';
import { drawPallaBars } from './render-bars';
import { drawGlass, drawSashFrame, sashColor } from './render-sash';

const DASH = [6, 4];
/** Height of a door lever above the floor. */
const DOOR_HANDLE_MM = 1050;

export function drawOpenableCasement(
  parent: Parent,
  leaf: LeafNode,
  r: PxRect,
  ctx: RenderCtx,
  isDoorLeaf: boolean
): void {
  // The rebate gap: the dark line between the outer frame and the sash.
  const gap = ctx.detail === 'tiny' ? 1 : Math.max(1.5, Math.min(3, ctx.px(4)));
  parent.add(
    new Konva.Rect({
      x: r.x,
      y: r.y,
      width: r.w,
      height: r.h,
      fill: shadeColor(ctx.color, -0.5),
      listening: false,
      name: 'sash-gap',
    })
  );
  const sash = insetPx(r, gap);
  const facePx = sashFacePx(ctx, leaf, isDoorLeaf ? 'door' : 'casement', sash);
  const glass = drawSashFrame(parent, sash, facePx, ctx.color, {
    name: 'sash-outline',
    attrs: { paneId: leaf.id },
  });
  drawGlass(parent, leaf, glass, ctx);
  drawPallaBars(parent, leaf.bars, sash, glass, ctx, { paneId: leaf.id, tone: sashColor(ctx.color) });

  const dir = (leaf.opening?.direction || 'Left').toLowerCase();
  const hinges = leaf.opening?.hingesType === '3D Hinges' ? 3 : 2;
  if (dir.startsWith('tilt')) {
    const turnSide = screenSide(dir.includes('right') ? 'right' : 'left', ctx.flip);
    drawEgress(parent, glass, turnSide, true, 'turn');
    drawEgress(parent, glass, 'bottom', true, 'tilt');
    drawHandleGlyph(parent, sash, facePx, opposite(turnSide), false, ctx);
    drawHingeMarks(parent, sash, turnSide, hinges, ctx);
    return;
  }
  const modelSide: Side =
    dir === 'right' ? 'right' : dir === 'top' ? 'top' : dir === 'bottom' ? 'bottom' : 'left';
  const side = screenSide(modelSide, ctx.flip);
  if (isDoorLeaf) {
    const inward = (ctx.design.door?.swing ?? 'In') === 'In';
    drawEgress(parent, glass, side, inward, 'turn');
    drawDoorSwing(parent, r, side, inward, ctx.design.door?.swing ?? 'In', ctx);
    drawHandleGlyph(parent, sash, facePx, opposite(side), true, ctx);
    drawHingeMarks(parent, sash, side, 3, ctx);
    return;
  }
  drawEgress(parent, glass, side, false, 'turn');
  drawHandleGlyph(parent, sash, facePx, opposite(side), false, ctx);
  drawHingeMarks(parent, sash, side, hinges, ctx);
}

/** Opening triangle over the glass: apex on the hinge side. */
function drawEgress(
  parent: Parent,
  r: PxRect,
  side: Side,
  dashed: boolean,
  motion: 'turn' | 'tilt'
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
    const line = new Konva.Line({
      points,
      stroke: COL.symbol,
      strokeWidth: 1.5,
      dash: dashed ? DASH : [],
      listening: false,
      name: 'opening-symbol',
    });
    line.setAttrs({ hingeSide: side, dashed, motion });
    parent.add(line);
  }
}

/**
 * Door swing: a quarter arc centred on the hinge-side bottom corner, from
 * the closed position along the sill up to the open position on the hinge
 * stile, with an IN / OUT tag.
 */
function drawDoorSwing(
  parent: Parent,
  r: PxRect,
  hingeSide: Side,
  dashed: boolean,
  swing: 'In' | 'Out',
  ctx: RenderCtx
): void {
  const left = hingeSide !== 'right';
  const radius = Math.max(8, Math.min(r.w * 0.86, r.h * 0.45));
  const cx = left ? r.x : r.x + r.w;
  const cy = r.y + r.h;
  const points: number[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = ((Math.PI / 2) * i) / 24;
    points.push(cx + (left ? 1 : -1) * radius * Math.cos(a), cy - radius * Math.sin(a));
  }
  const arc = new Konva.Line({
    points,
    stroke: COL.symbol,
    strokeWidth: 1.5,
    dash: dashed ? DASH : [],
    listening: false,
    name: 'door-swing',
  });
  arc.setAttrs({ hingeSide, dashed, swing });
  parent.add(arc);
  if (ctx.detail === 'tiny' || radius < 44) return;
  parent.add(
    new Konva.Text({
      x: left ? cx + radius * 0.5 : cx - radius * 0.5 - 30,
      y: cy - radius * 0.5 - 6,
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

/**
 * Handle on the sash band of the LOCK side: at mid height on a window, at
 * lever height above the floor on a door, mid span on a top or bottom rail.
 */
function drawHandleGlyph(
  parent: Parent,
  sash: PxRect,
  facePx: number,
  edge: Side,
  door: boolean,
  ctx: RenderCtx
): void {
  const { x, y, w, h } = sash;
  const tiny = ctx.detail === 'tiny';
  const len = Math.max(tiny ? 6 : 10, Math.min(24, Math.min(w, h) * 0.16));
  const thick = Math.max(2, Math.min(5, facePx * 0.45));
  const band = facePx / 2;
  const leverY = Math.max(y + h * 0.3, y + h - ctx.px(DOOR_HANDLE_MM));
  const midY = door ? leverY : y + h / 2;
  let rx: number, ry: number, rw: number, rh: number;
  switch (edge) {
    case 'right':
      rx = x + w - band - thick / 2;
      ry = midY - len / 2;
      rw = thick;
      rh = len;
      break;
    case 'top':
      rx = x + w / 2 - len / 2;
      ry = y + band - thick / 2;
      rw = len;
      rh = thick;
      break;
    case 'bottom':
      rx = x + w / 2 - len / 2;
      ry = y + h - band - thick / 2;
      rw = len;
      rh = thick;
      break;
    default:
      rx = x + band - thick / 2;
      ry = midY - len / 2;
      rw = thick;
      rh = len;
      break;
  }
  const glyph = new Konva.Rect({
    x: rx,
    y: ry,
    width: rw,
    height: rh,
    fill: '#4a4f55',
    stroke: '#2b2e33',
    strokeWidth: tiny ? 0.5 : 1,
    cornerRadius: Math.min(2, thick / 2),
    listening: false,
    name: 'handle-glyph',
  });
  glyph.setAttr('edge', edge);
  parent.add(glyph);
  if (door && (edge === 'left' || edge === 'right')) {
    const leverLen = Math.max(6, Math.min(20, w * 0.18));
    parent.add(
      new Konva.Rect({
        x: edge === 'right' ? rx - leverLen : rx + thick,
        y: ry + rh / 2 - 2,
        width: leverLen,
        height: tiny ? 2 : 4,
        fill: '#4a4f55',
        stroke: '#2b2e33',
        strokeWidth: tiny ? 0.5 : 1,
        cornerRadius: 2,
        listening: false,
        name: 'door-lever',
      })
    );
  }
}

/** Hinge knuckles on the hinge side, across the gap between frame and sash. */
function drawHingeMarks(
  parent: Parent,
  sash: PxRect,
  side: Side,
  count: number,
  ctx: RenderCtx
): void {
  const { x, y, w, h } = sash;
  const tiny = ctx.detail === 'tiny';
  const barrelLen = Math.max(tiny ? 4 : 8, Math.min(16, Math.min(w, h) * 0.12));
  const barrelW = Math.max(tiny ? 2 : 4, Math.min(7, Math.min(w, h) * 0.05));
  const alongIsX = side === 'top' || side === 'bottom';
  for (let i = 1; i <= count; i++) {
    // Near the ends of the hinge side, where hinges are fitted.
    const f = count === 1 ? 0.5 : 0.14 + (0.72 * (i - 1)) / (count - 1);
    let bcx: number, bcy: number;
    switch (side) {
      case 'right':
        bcx = x + w;
        bcy = y + h * f;
        break;
      case 'top':
        bcx = x + w * f;
        bcy = y;
        break;
      case 'bottom':
        bcx = x + w * f;
        bcy = y + h;
        break;
      default:
        bcx = x;
        bcy = y + h * f;
        break;
    }
    const mark = new Konva.Rect({
      x: bcx - (alongIsX ? barrelLen : barrelW) / 2,
      y: bcy - (alongIsX ? barrelW : barrelLen) / 2,
      width: alongIsX ? barrelLen : barrelW,
      height: alongIsX ? barrelW : barrelLen,
      fill: '#8a9097',
      stroke: '#3a3d42',
      strokeWidth: tiny ? 0.5 : 1,
      cornerRadius: barrelW / 2,
      listening: false,
      name: 'hinge-mark',
    });
    mark.setAttr('side', side);
    parent.add(mark);
  }
}

/**
 * Door threshold under the door node: Standard keeps the full sill profile
 * (outlined), Low replaces it with a thin strip at floor level, None removes
 * the sill and marks the floor line.
 */
export function drawDoorThreshold(
  parent: Parent,
  doorRect: RectMm,
  ctx: RenderCtx
): void {
  const door = ctx.design.door;
  if (!door) return;
  const frameH = ctx.design.frame.heightMm;
  const sillMm = frameH - (doorRect.yMm + doorRect.hMm);
  // A transom / light below the door means it has no sill of its own.
  if (sillMm <= 0 || sillMm > ctx.opts.frameFaceMm + 1) return;
  const r = ctx.rect({
    xMm: doorRect.xMm,
    yMm: doorRect.yMm + doorRect.hMm,
    wMm: doorRect.wMm,
    hMm: sillMm,
  });
  const base = { listening: false, name: 'door-threshold' };
  let node: Konva.Shape;
  if (door.threshold === 'Standard') {
    node = new Konva.Rect({
      ...base,
      x: r.x,
      y: r.y,
      width: r.w,
      height: r.h,
      stroke: '#555555',
      strokeWidth: 1.5,
    });
  } else {
    parent.add(
      new Konva.Rect({
        x: r.x,
        y: r.y - 0.5,
        width: r.w,
        height: r.h + 2,
        fill: '#ffffff',
        listening: false,
        name: 'door-threshold-gap',
      })
    );
    if (door.threshold === 'Low') {
      const stripH = Math.max(3, ctx.px(20));
      node = new Konva.Rect({
        ...base,
        x: r.x,
        y: r.y + r.h - stripH,
        width: r.w,
        height: stripH,
        fill: '#a8adb3',
        stroke: '#555555',
        strokeWidth: 1,
      });
    } else {
      node = new Konva.Line({
        ...base,
        points: [r.x, r.y + r.h, r.x + r.w, r.y + r.h],
        stroke: '#555555',
        strokeWidth: 1.5,
        dash: [4, 4],
      });
    }
  }
  node.setAttr('thresholdType', door.threshold);
  parent.add(node);
}
