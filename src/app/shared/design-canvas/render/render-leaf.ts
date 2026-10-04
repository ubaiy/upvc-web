/**
 * design-canvas renderer — one pane (leaf): glass with its tint, the
 * reflection, glazing bars, then the leaf's own content (sliding panels or
 * casement / door symbols) and the mm size label.
 */

import Konva from 'konva';
import { LeafNode } from '../../design-model';
import { drawOpenableCasement } from './render-casement';
import { COL, Parent, PxRect, RenderCtx, shadeColor } from './render-common';
import { drawSlidingLeaf } from './render-sliding';

export interface LeafDrawOpts {
  showLabel: boolean;
  /** Draw the label lower down (panes cut by a shaped head). */
  labelInside?: boolean;
  /** Door leaves get door hardware and the swing arc. */
  isDoorLeaf?: boolean;
}

export function drawLeaf(
  parent: Parent,
  leaf: LeafNode,
  r: PxRect,
  ctx: RenderCtx
): void {
  const tint = ctx.opts.glassTint;
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
    fillLinearGradientColorStops: tint
      ? [0, shadeColor(tint, 0.55), 1, tint]
      : [0, COL.glassTop, 1, COL.glassBottom],
  });
  glass.setAttrs({ paneId: leaf.id, tint: tint ?? null });
  parent.add(glass);
  drawGlassReflection(parent, r);
  drawGlazingBars(parent, r, ctx);
}

/** The leaf's symbols; drawn after the glass so they sit on top of it. */
export function drawLeafContent(
  parent: Parent,
  leaf: LeafNode,
  r: PxRect,
  ctx: RenderCtx,
  o: LeafDrawOpts
): void {
  if (leaf.category === 'Slidding' && leaf.slide) {
    drawSlidingLeaf(parent, leaf.slide, r, ctx);
  } else if (leaf.category === 'Casement' && leaf.casementType === 'Openable') {
    drawOpenableCasement(parent, leaf, r, ctx, !!o.isDoorLeaf);
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
  const wMm = Math.round(r.w / ctx.view.pxPerMm);
  const hMm = Math.round(r.h / ctx.view.pxPerMm);
  const label = new Konva.Text({
    text: `${wMm} × ${hMm} mm`,
    fontSize: 11,
    fill: COL.label,
    listening: false,
    name: 'pane-label',
  });
  const textW = label.width();
  const lx = r.x + (r.w - textW) / 2;
  const ly = inside ? r.y + r.h * 0.62 : r.y + 6;
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

function drawGlassReflection(parent: Parent, r: PxRect): void {
  const { x, y, w, h } = r;
  parent.add(
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

/** Glazing / Georgian bars from the document's glazing spec. */
function drawGlazingBars(parent: Parent, r: PxRect, ctx: RenderCtx): void {
  const { x, y, w, h } = r;
  const vBars = ctx.design.glazing.barsV;
  const hBars = ctx.design.glazing.barsH;
  const color = ctx.opts.profileColor;
  const barPx = 3;
  const fill = color && color !== '#ffffff' ? color : '#bfbfbf';
  const bar = (bx: number, by: number, bw: number, bh: number): void => {
    parent.add(
      new Konva.Rect({
        x: bx,
        y: by,
        width: bw,
        height: bh,
        fill,
        stroke: '#777777',
        strokeWidth: 0.5,
        listening: false,
        name: 'glazing-bar',
      })
    );
  };
  for (let i = 1; i <= vBars; i++) {
    bar(x + (w / (vBars + 1)) * i - barPx / 2, y, barPx, h);
  }
  for (let j = 1; j <= hBars; j++) {
    bar(x, y + (h / (hBars + 1)) * j - barPx / 2, w, barPx);
  }
}
