/**
 * design-canvas renderer — render = f(model). Konva lives ONLY here and in
 * ./render/*.
 *
 * Draws a WindowDesign from the design-model `layout()` (all geometry in mm,
 * converted to px through the ViewTransform) onto one Konva layer. This file
 * orders the passes; the drawing itself is in ./render:
 *   render-frame    rect + shaped frames, dimension lines
 *   render-sash     a sash frame, glass with its gasket, own-glass marks
 *   render-leaf     one pane by what it is, pane labels
 *   render-casement the opening sash, its symbols, door swing + threshold
 *   render-sliding  shutters on their tracks, arrows, fly mesh
 *   render-legend   the key of the symbols (the saved picture)
 *   render-overlay  selection, sizes, ghost, handles, readout, focus ring
 *
 * The renderer attaches NO event handlers and holds NO state: the component
 * hit-tests pointer positions against the same layout (canvas-view.ts), so
 * what you see and what you hit can never disagree.
 */

import Konva from 'konva';
import {
  Layout,
  PointMm,
  WindowDesign,
  clipPanesToShape,
  findNode,
  isSplit,
  shapeOutline,
  walkLeaves,
} from '../design-model';
import { CanvasSelection, ViewTransform } from './canvas-view';
import { drawingKey } from './drawing-key';
import { drawDoorThreshold } from './render/render-casement';
import {
  COL,
  Parent,
  RenderCtx,
  RenderOpts,
  flatPx,
  makeCtx,
  shadeColor,
} from './render/render-common';
import {
  DRAW_ARC_SEGMENTS,
  drawBevelBands,
  drawFrameDimensions,
  drawOuterFrame,
  drawShapedFrame,
} from './render/render-frame';
import { drawLeaf, drawPaneLabel } from './render/render-leaf';
import { drawLegend } from './render/render-legend';
import {
  RenderGhost,
  RenderReadout,
  drawFocusRing,
  drawFrameHandles,
  drawGhost,
  drawReadout,
  drawSelection,
  drawSelectionSizes,
  drawViewBadge,
} from './render/render-overlay';

export { RenderGhost, RenderReadout } from './render/render-overlay';
export {
  DEFAULT_SASH_FACES,
  GlassTints,
  RenderOpts,
  SashFaces,
  glassTintFor,
  shadeColor,
} from './render/render-common';

export interface RenderUi {
  selection: CanvasSelection | null;
  ghost?: RenderGhost | null;
  readout?: RenderReadout | null;
  /** Draw the corner resize handles (hidden when read-only). */
  showFrameHandle: boolean;
  /** Visible keyboard-focus ring around the drawing. */
  focused?: boolean;
}

/** Group whose children are clipped to a mm polygon. */
function clipGroup(ctx: RenderCtx, polygon: PointMm[], name: string): Konva.Group {
  const pts = flatPx(ctx, polygon);
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

  const ctx = makeCtx(design, view, opts);
  const { widthMm, heightMm, shape } = design.frame;
  const frame = ctx.rect({ xMm: 0, yMm: 0, wMm: widthMm, hMm: heightMm });
  const shaped = shape.kind !== 'rect';

  // Frame. A shaped frame returns the daylight polygon everything inside
  // it is clipped to.
  let daylight: PointMm[] | null = null;
  let outline: PointMm[] | null = null;
  if (shaped) {
    daylight = drawShapedFrame(layer, ctx);
    outline = shapeOutline(shape, widthMm, heightMm, {
      arcSegments: DRAW_ARC_SEGMENTS,
    });
  } else {
    drawOuterFrame(layer, frame, ctx);
  }
  drawFrameDimensions(layer, frame, ctx);

  const inside: Parent =
    daylight && daylight.length >= 3
      ? clipGroup(ctx, daylight, 'daylight-clip')
      : layer;
  if (inside !== layer) layer.add(inside);

  // Sash bands around sashFramed REGIONS (a palla that was divided again).
  // A leaf draws its own sash, at its own face width.
  for (const [, nl] of lay.nodes) {
    if (nl.node.sashFramed && isSplit(nl.node)) {
      const r = ctx.rect(nl.rect);
      drawBevelBands(inside, r.x, r.y, r.w, r.h, ctx.facePx, ctx.color, 'sash-band');
    }
  }

  // Panes. In a shaped frame each pane is clipped to its real polygon and
  // a pane the shape removes entirely is not drawn.
  const clips = shaped
    ? new Map(
        clipPanesToShape(design, {
          frameFaceMm: opts.frameFaceMm,
          arcSegments: DRAW_ARC_SEGMENTS,
        }).map((c) => [c.leafId, c])
      )
    : null;
  const doorLeafIds = doorLeaves(design);
  const showLabels = isSplit(design.root);
  for (const l of lay.leaves) {
    const r = ctx.rect(l.rect);
    const clip = clips?.get(l.leaf.id);
    if (clips && (!clip || clip.polygonMm.length < 3 || clip.areaMm2 < 1)) continue;
    let parent: Parent = layer;
    if (clip?.clipped) {
      parent = clipGroup(ctx, clip.polygonMm, 'pane-clip');
      layer.add(parent);
    }
    drawLeaf(parent, l.leaf, r, ctx, { isDoorLeaf: doorLeafIds.has(l.leaf.id) });
    if (clip?.clipped) {
      layer.add(
        new Konva.Line({
          points: flatPx(ctx, clip.polygonMm),
          closed: true,
          stroke: COL.stroke,
          strokeWidth: 1,
          listening: false,
          name: 'pane-outline',
        })
      );
    }
    if (showLabels) drawPaneLabel(layer, l.leaf, r, ctx, !!clip?.clipped);
  }

  for (const d of lay.dividers) {
    const r = ctx.rect(d.rect);
    const bar = new Konva.Rect({
      x: r.x,
      y: r.y,
      width: Math.max(2, r.w),
      height: Math.max(2, r.h),
      fill: shadeColor(ctx.color, ctx.color === '#ffffff' ? -0.18 : -0.08),
      stroke: COL.stroke,
      strokeWidth: 1.5,
      listening: false,
      name: 'divider-bar',
    });
    bar.setAttrs({ splitId: d.split.id, dividerIndex: d.index });
    inside.add(bar);
  }

  if (design.door) {
    const doorNode = lay.nodes.get(design.door.doorNodeId);
    if (doorNode) drawDoorThreshold(layer, doorNode.rect, ctx);
  }

  if (opts.legend) {
    drawLegend(layer, drawingKey(design, opts.glassLabels), opts.stageWPx, opts.stageHPx);
  }

  drawSelection(layer, lay, ctx, ui.selection, frame, outline);
  drawSelectionSizes(layer, lay, ctx, ui.selection);
  drawGhost(layer, lay, ctx, ui.ghost ?? null);
  if (ui.showFrameHandle) drawFrameHandles(layer, frame, ctx);
  if (ui.readout) drawReadout(layer, ctx, ui.readout);
  drawViewBadge(layer, ctx);
  if (ui.focused) drawFocusRing(layer, ctx);

  layer.batchDraw();
}

/** Ids of the leaf / leaves that ARE the door (empty for windows). */
function doorLeaves(design: WindowDesign): Set<string> {
  const ids = new Set<string>();
  if (!design.door) return ids;
  const node = findNode(design.root, design.door.doorNodeId);
  if (node) walkLeaves(node).forEach((l) => ids.add(l.id));
  return ids;
}
