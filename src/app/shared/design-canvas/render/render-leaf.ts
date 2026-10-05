/**
 * design-canvas renderer — one pane (leaf), by what it is:
 *  - fixed glass: the glass in the frame with its bead line, nothing else;
 *  - an opening sash: the sash frame inside the outer frame and its symbols
 *    (render-casement);
 *  - a sliding leaf: its shutters on their tracks (render-sliding);
 * and the mm size label.
 */

import Konva from 'konva';
import { LeafNode } from '../../design-model';
import { drawOpenableCasement } from './render-casement';
import { COL, Parent, PxRect, RenderCtx, insetPx, shadeColor } from './render-common';
import { drawPallaBars } from './render-bars';
import { drawGlass, drawSashFrame, sashColor } from './render-sash';
import { drawSlidingLeaf } from './render-sliding';

export interface LeafDrawOpts {
  /** Door leaves get door hardware and the swing arc. */
  isDoorLeaf?: boolean;
}

/** Depth of the glazing bead that holds fixed glass, mm. */
const BEAD_MM = 18;

export function drawLeaf(
  parent: Parent,
  leaf: LeafNode,
  r: PxRect,
  ctx: RenderCtx,
  o: LeafDrawOpts = {}
): void {
  if (leaf.category === 'Slidding' && leaf.slide) {
    drawSlidingLeaf(parent, leaf, leaf.slide, r, ctx);
    return;
  }
  if (leaf.category === 'Casement' && leaf.casementType === 'Openable') {
    drawOpenableCasement(parent, leaf, r, ctx, !!o.isDoorLeaf);
    return;
  }
  // Fixed glass. A fixed palla keeps the sash band it was drawn with.
  const glass = leaf.sashFramed
    ? drawSashFrame(parent, r, ctx.facePx, ctx.color, { name: 'sash-band' })
    : r;
  drawGlass(parent, leaf, glass, ctx);
  drawPallaBars(parent, leaf.bars, r, glass, ctx, { paneId: leaf.id, tone: sashColor(ctx.color) });
  const bead = Math.max(2, Math.min(ctx.px(BEAD_MM), Math.min(glass.w, glass.h) * 0.12));
  if (ctx.detail !== 'tiny' && glass.w > 4 * bead && glass.h > 4 * bead) {
    const b = insetPx(glass, bead);
    parent.add(
      new Konva.Rect({
        x: b.x,
        y: b.y,
        width: b.w,
        height: b.h,
        stroke: shadeColor(COL.stroke, 0.35),
        strokeWidth: 0.75,
        listening: false,
        name: 'bead-line',
      })
    );
  }
}

/** mm size label on a white pill so bands and symbols never cross it. */
export function drawPaneLabel(
  parent: Parent,
  leaf: LeafNode,
  r: PxRect,
  ctx: RenderCtx,
  inside: boolean
): void {
  if (ctx.detail === 'tiny') return;
  const wMm = Math.round(r.w / ctx.view.pxPerMm);
  const hMm = Math.round(r.h / ctx.view.pxPerMm);
  const compact = ctx.detail === 'compact';
  const label = new Konva.Text({
    text: compact ? `${wMm} × ${hMm}` : `${wMm} × ${hMm} mm`,
    fontSize: compact ? 9 : 11,
    fill: COL.label,
    listening: false,
    name: 'pane-label',
  });
  const textW = label.width();
  // A label wider than its pane would run into the neighbours: left out.
  if (textW + 10 > r.w || label.height() + 14 > r.h) return;
  const lx = r.x + (r.w - textW) / 2;
  // Below the top rail of a sash, so it sits on the glass.
  const framed = leaf.category === 'Slidding' || leaf.casementType === 'Openable';
  const rail = framed ? Math.min(ctx.px(64), r.h * 0.16) : 0;
  const ly = inside ? r.y + r.h * 0.62 : r.y + 6 + rail;
  label.position({ x: lx, y: ly });
  label.setAttrs({ paneId: leaf.id, wMm, hMm });
  parent.add(
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
  parent.add(label);
}
