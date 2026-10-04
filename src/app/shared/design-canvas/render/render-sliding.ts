/**
 * design-canvas renderer — a sliding leaf from the model's slideLayout():
 * one rail per track, each panel on its track, interlock bands, a direction
 * arrow per moving panel, a FIX marker on fixed panels, per-panel mm and the
 * fly-mesh hatch.
 */

import Konva from 'konva';
import { SlideSpec, TRACK_COUNTS, slideLayout } from '../../design-model';
import { COL, Parent, PxRect, RenderCtx } from './render-common';

const TRACK_STEP_PX = 3; // depth offset per track
const RAIL_H_PX = 3;

/** Screen rect of panel `index` of a sliding leaf drawn in `r`. */
export function slidePanelRectPx(
  slide: SlideSpec,
  r: PxRect,
  ctx: RenderCtx,
  index: number
): PxRect | null {
  const daylightWMm = r.w / ctx.view.pxPerMm;
  const p = slideLayout(slide, daylightWMm).panels[index];
  if (!p) return null;
  const trackCount = TRACK_COUNTS[slide.tracks];
  const depth = p.track * TRACK_STEP_PX;
  const xMm = ctx.flip ? daylightWMm - p.xMm - p.widthMm : p.xMm;
  return {
    x: r.x + xMm * ctx.view.pxPerMm,
    y: r.y + 3 + depth,
    w: p.widthMm * ctx.view.pxPerMm,
    h: Math.max(10, r.h - 6 - 2 * depth - trackCount * 4),
  };
}

export function drawSlidingLeaf(
  parent: Parent,
  slide: SlideSpec,
  r: PxRect,
  ctx: RenderCtx
): void {
  const ppm = ctx.view.pxPerMm;
  const daylightWMm = r.w / ppm;
  const sl = slideLayout(slide, daylightWMm);
  const trackCount = TRACK_COUNTS[slide.tracks];
  const flipX = (xMm: number, wMm: number): number =>
    r.x + (ctx.flip ? daylightWMm - xMm - wMm : xMm) * ppm;

  // Track channels: thin rails along the bottom of the opening.
  for (let t = 0; t < trackCount; t++) {
    parent.add(
      new Konva.Rect({
        x: r.x + 2,
        y: r.y + r.h - 6 - t * (RAIL_H_PX + 2),
        width: r.w - 4,
        height: RAIL_H_PX,
        fill: '#9aa0a6',
        stroke: '#6b7280',
        strokeWidth: 0.5,
        listening: false,
        name: 'track-line',
      })
    );
  }

  for (const il of sl.interlocks) {
    if (il.widthMm <= 0) continue;
    parent.add(
      new Konva.Rect({
        x: flipX(il.xMm, il.widthMm),
        y: r.y + 3,
        width: Math.max(2, il.widthMm * ppm),
        height: Math.max(10, r.h - 6 - trackCount * 4),
        fill: 'rgba(60, 64, 72, 0.22)',
        listening: false,
        name: 'slide-interlock',
      })
    );
  }

  sl.panels.forEach((p) => {
    const pr = slidePanelRectPx(slide, r, ctx, p.index) as PxRect;
    const panel = new Konva.Rect({
      x: pr.x + 1,
      y: pr.y,
      width: Math.max(4, pr.w - 2),
      height: pr.h,
      stroke: '#555555',
      strokeWidth: 3,
      fill: 'rgba(255,255,255,0.06)',
      listening: false,
      name: 'slide-panel',
    });
    panel.setAttrs({ panelIndex: p.index, track: p.track, fixed: p.fixed });
    parent.add(panel);

    const cy = pr.y + pr.h / 2;
    if (p.fixed) {
      parent.add(
        new Konva.Text({
          x: pr.x,
          y: cy - 7,
          width: Math.max(10, pr.w),
          align: 'center',
          text: 'FIX',
          fontSize: 13,
          fontStyle: 'bold',
          fill: COL.symbol,
          listening: false,
          name: 'slide-fixed',
        })
      );
    } else {
      // Direction arrow at mid height (mirrored with the view).
      const slidesRight = (p.direction === 'Right') !== ctx.flip;
      const margin = Math.max(8, pr.w * 0.22);
      const xL = pr.x + margin;
      const xR = pr.x + pr.w - margin;
      const arrow = new Konva.Arrow({
        points: slidesRight ? [xL, cy, xR, cy] : [xR, cy, xL, cy],
        stroke: COL.symbol,
        fill: COL.symbol,
        strokeWidth: 2,
        pointerLength: 9,
        pointerWidth: 9,
        listening: false,
        name: 'slide-arrow',
      });
      arrow.setAttrs({ panelIndex: p.index, pointsRight: slidesRight });
      parent.add(arrow);
    }

    parent.add(
      new Konva.Text({
        x: pr.x,
        y: r.y + r.h - 6 - trackCount * 5 - 14,
        width: Math.max(10, pr.w),
        align: 'center',
        text: `${Math.round(p.widthMm)}`,
        fontSize: 10,
        fill: COL.label,
        listening: false,
        name: 'slide-panel-label',
      })
    );
  });

  if (sl.mesh) {
    drawFlyMesh(
      parent,
      flipX(sl.mesh.xMm, sl.mesh.widthMm),
      r.y + 2,
      sl.mesh.widthMm * ppm,
      r.h - 4
    );
  }
}

function drawFlyMesh(parent: Parent, x: number, y: number, w: number, h: number): void {
  if (w <= 0 || h <= 0) return;
  const mesh = new Konva.Group({ listening: false, name: 'fly-mesh' });
  mesh.setAttr('xPx', x);
  const step = 7;
  const hair = (points: number[]): void => {
    mesh.add(
      new Konva.Line({
        points,
        stroke: COL.mesh,
        strokeWidth: 0.5,
        opacity: 0.6,
        listening: false,
      })
    );
  };
  for (let mx = x + step; mx < x + w; mx += step) hair([mx, y, mx, y + h]);
  for (let my = y + step; my < y + h; my += step) hair([x, my, x + w, my]);
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
  parent.add(mesh);
}
