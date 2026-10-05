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
