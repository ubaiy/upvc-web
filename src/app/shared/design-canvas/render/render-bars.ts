/**
 * design-canvas renderer — the bars ONE palla carries (design-model
 * palla.ts): drawn inside its sash frame, over its glass, in the sash's own
 * tone, so they read as part of that sash and not of the outer frame.
 */

import Konva from 'konva';
import { PALLA_BAR_FACE_MM, PallaBars } from '../../design-model';
import { COL, Parent, PxRect, RenderCtx } from './render-common';

export interface PallaBarOpts {
  paneId: string;
  panelIndex?: number;
  /** Fill of the bar: the tone of the sash that carries it. */
  tone: string;
}

/**
 * Bars of a palla whose outer screen rect is `outer` and whose glass sits
 * in `glass`. The centreline is at the stored fraction of the OUTER rect
 * (what the hit test uses); the bar runs from glass edge to glass edge.
 */
export function drawPallaBars(
  parent: Parent,
  bars: PallaBars | undefined,
  outer: PxRect,
  glass: PxRect,
  ctx: RenderCtx,
  o: PallaBarOpts
): void {
  if (!bars) return;
  const face = Math.max(2, ctx.px(PALLA_BAR_FACE_MM));
  bars.at.forEach((at, index) => {
    // Model fractions run from the model-left edge: mirrored with the view.
    const f = bars.axis === 'x' && ctx.flip ? 1 - at : at;
    const bar = new Konva.Rect(
      bars.axis === 'x'
        ? { x: outer.x + f * outer.w - face / 2, y: glass.y, width: face, height: glass.h }
        : { x: glass.x, y: outer.y + f * outer.h - face / 2, width: glass.w, height: face }
    );
    bar.setAttrs({
      fill: o.tone,
      stroke: COL.stroke,
      strokeWidth: ctx.detail === 'tiny' ? 0.5 : 1,
      listening: false,
      name: 'palla-bar',
      paneId: o.paneId,
      panelIndex: o.panelIndex ?? null,
      barIndex: index,
      axis: bars.axis,
    });
    parent.add(bar);
  });
}

export interface PallaPartLabelOpts {
  paneId: string;
  panelIndex?: number;
  /** Depth of the palla's top rail on screen: the first label sits below it. */
  railPx: number;
}

/**
 * The mm size of every part of a divided palla, each on its own white pill
 * (the look of a pane's size label). A part runs from the palla's edge, or
 * from the face of a bar, to the next one: the same reading as the panes on
 * the two sides of a frame divider.
 */
export function drawPallaPartLabels(
  parent: Parent,
  bars: PallaBars | undefined,
  outer: PxRect,
  ctx: RenderCtx,
  o: PallaPartLabelOpts
): void {
  if (!bars || ctx.detail === 'tiny') return;
  const alongX = bars.axis === 'x';
  const flipped = alongX && ctx.flip;
  const face = Math.max(2, ctx.px(PALLA_BAR_FACE_MM));
  const span = alongX ? outer.w : outer.h;
  const cuts = bars.at.map((at) => (flipped ? 1 - at : at) * span).sort((a, b) => a - b);
  const edges = [0, ...cuts, span];
  const last = edges.length - 2;
  const compact = ctx.detail === 'compact';
  for (let i = 0; i <= last; i++) {
    const from = edges[i] + (i === 0 ? 0 : face / 2);
    const to = edges[i + 1] - (i === last ? 0 : face / 2);
    const part: PxRect = alongX
      ? { x: outer.x + from, y: outer.y, w: to - from, h: outer.h }
      : { x: outer.x, y: outer.y + from, w: outer.w, h: to - from };
    const wMm = Math.round(part.w / ctx.view.pxPerMm);
    const hMm = Math.round(part.h / ctx.view.pxPerMm);
    const label = new Konva.Text({
      text: compact ? `${wMm} × ${hMm}` : `${wMm} × ${hMm} mm`,
      fontSize: compact ? 9 : 11,
      fill: COL.label,
      listening: false,
      name: 'palla-part-label',
    });
    const textW = label.width();
    // A label wider than its part would run into the next one: left out.
    if (textW + 10 > part.w || label.height() + 14 > part.h) continue;
    const lx = part.x + (part.w - textW) / 2;
    // Under the top rail; a part below a bar starts on the glass already.
    const ly = part.y + 6 + (alongX || i === 0 ? o.railPx : 0);
    label.position({ x: lx, y: ly });
    label.setAttrs({
      paneId: o.paneId,
      panelIndex: o.panelIndex ?? null,
      part: flipped ? last - i : i,
      wMm,
      hMm,
    });
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
        name: 'palla-part-label-bg',
      })
    );
    parent.add(label);
  }
}
