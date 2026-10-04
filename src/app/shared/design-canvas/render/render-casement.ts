/**
 * design-canvas renderer — openable casement and door symbology: sash
 * outline, egress chevrons (side-hung, top-hung, bottom-hung, tilt & turn),
 * hinge marks, handle glyph, the door swing arc and the door threshold.
 *
 * Conventions (documented in the phase-8 log):
 *  - A chevron's apex sits on the HINGE side. Solid = turn, dashed = tilt.
 *  - Model sides are as seen from OUTSIDE; the inside view mirrors them.
 *  - Door swing arc and chevron: solid when the leaf opens TOWARDS the
 *    viewer, dashed when it opens away (Out seen from outside = solid).
 */

import Konva from 'konva';
import { LeafNode, RectMm } from '../../design-model';
import {
  COL,
  Parent,
  PxRect,
  RenderCtx,
  Side,
  opposite,
  screenSide,
} from './render-common';

const DASH = [6, 4];

export function drawOpenableCasement(
  parent: Parent,
  leaf: LeafNode,
  r: PxRect,
  ctx: RenderCtx,
  isDoorLeaf: boolean
): void {
  const inset = Math.max(
    3,
    Math.round(ctx.opts.frameFaceMm * ctx.view.pxPerMm * 0.55)
  );
  parent.add(
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
  const hinges = leaf.opening?.hingesType === '3D Hinges' ? 3 : 2;
  if (dir.startsWith('tilt')) {
    const turnSide = screenSide(dir.includes('right') ? 'right' : 'left', ctx.flip);
    drawEgress(parent, r, turnSide, false);
    drawEgress(parent, r, 'top', true);
    drawHandleGlyph(parent, r, opposite(turnSide), false);
    drawHingeMarks(parent, r, turnSide, hinges);
    return;
  }
  const modelSide: Side =
    dir === 'right' ? 'right' : dir === 'top' ? 'top' : dir === 'bottom' ? 'bottom' : 'left';
  const side = screenSide(modelSide, ctx.flip);
  if (isDoorLeaf) {
    const towards = doorOpensTowardsViewer(ctx);
    drawEgress(parent, r, side, !towards);
    drawDoorSwing(parent, r, side, !towards, ctx.design.door?.swing ?? 'In');
    drawHandleGlyph(parent, r, opposite(side), true);
    drawHingeMarks(parent, r, side, 3);
    return;
  }
  drawEgress(parent, r, side, false);
  drawHandleGlyph(parent, r, opposite(side), false);
  drawHingeMarks(parent, r, side, hinges);
}

function doorOpensTowardsViewer(ctx: RenderCtx): boolean {
  const out = (ctx.design.door?.swing ?? 'In') === 'Out';
  return out === ((ctx.opts.viewFrom ?? 'outside') === 'outside');
}

/** Egress chevron: apex on the hinge side. */
function drawEgress(parent: Parent, r: PxRect, side: Side, dashed: boolean): void {
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
    line.setAttrs({ hingeSide: side, dashed });
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
  swing: 'In' | 'Out'
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

/** Lever-bar handle centred on `edge`; a door lever sits on a backplate. */
function drawHandleGlyph(parent: Parent, r: PxRect, edge: Side, door: boolean): void {
  const { x, y, w, h } = r;
  const len = Math.max(12, Math.min(22, Math.min(w, h) * 0.2));
  const thick = 5;
  const pad = 4;
  // Door levers sit about 1 m above the floor: 45% up from the bottom.
  const midY = door ? y + h * 0.55 : y + h / 2;
  let rx: number, ry: number, rw: number, rh: number;
  switch (edge) {
    case 'right':
      rx = x + w - pad - thick;
      ry = midY - len / 2;
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
    strokeWidth: 1,
    cornerRadius: 2,
    listening: false,
    name: 'handle-glyph',
  });
  glyph.setAttr('edge', edge);
  parent.add(glyph);
  if (door && (edge === 'left' || edge === 'right')) {
    const leverLen = Math.max(10, Math.min(20, w * 0.18));
    parent.add(
      new Konva.Rect({
        x: edge === 'right' ? rx - leverLen : rx + thick,
        y: ry + rh / 2 - 2,
        width: leverLen,
        height: 4,
        fill: '#4a4f55',
        stroke: '#2b2e33',
        strokeWidth: 1,
        cornerRadius: 2,
        listening: false,
        name: 'door-lever',
      })
    );
  }
}

/** Hinge knuckles flush on the hinge stile. */
function drawHingeMarks(parent: Parent, r: PxRect, side: Side, count: number): void {
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
    parent.add(
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
