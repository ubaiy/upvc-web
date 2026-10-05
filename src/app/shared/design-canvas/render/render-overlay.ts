/**
 * design-canvas renderer — UI overlays drawn on top of the design:
 * selection highlight, split ghost, the four corner resize handles, the
 * drag readout, the keyboard-focus ring and the inside/outside view badge.
 */

import Konva from 'konva';
import { Layout, PointMm, isLeaf, slideLayout } from '../../design-model';
import { CanvasSelection, selectedPaneIds } from '../canvas-view';
import {
  COL,
  Parent,
  PxRect,
  RenderCtx,
  SashKind,
  flatPx,
  sashFacePx,
} from './render-common';
import { slidePanelRectPx } from './render-sliding';

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

export function drawSelection(
  parent: Parent,
  lay: Layout,
  ctx: RenderCtx,
  selection: CanvasSelection | null,
  frame: PxRect,
  outline: PointMm[] | null
): void {
  if (!selection) return;
  const base = {
    stroke: COL.selectStroke,
    strokeWidth: 2.5,
    listening: false,
    name: 'selection-highlight',
  };
  if (selection.type === 'frame' && outline) {
    parent.add(new Konva.Line({ ...base, points: flatPx(ctx, outline), closed: true }));
    return;
  }
  let rect: PxRect | null = null;
  if (selection.type === 'frame') {
    rect = frame;
  } else if (selection.type === 'pane' && selectedPaneIds(selection).length > 1) {
    // Several panes: each one highlighted, the one picked last more strongly.
    for (const id of selectedPaneIds(selection)) {
      const nl = lay.nodes.get(id);
      if (!nl) continue;
      const r = ctx.rect(nl.rect);
      const hl = new Konva.Rect({
        ...base,
        x: r.x,
        y: r.y,
        width: Math.max(3, r.w),
        height: Math.max(3, r.h),
        fill: COL.select,
        strokeWidth: id === selection.paneId ? 2.5 : 1.75,
      });
      hl.setAttrs({ paneId: id, primary: id === selection.paneId });
      parent.add(hl);
    }
    return;
  } else if (selection.type === 'pane') {
    const nl = lay.nodes.get(selection.paneId);
    if (nl) {
      rect = ctx.rect(nl.rect);
      const node = nl.node;
      if (selection.panelIndex !== undefined && isLeaf(node) && node.slide) {
        const pr = slidePanelRectPx(node.slide, rect, ctx, selection.panelIndex);
        if (pr) {
          const hl = new Konva.Rect({
            ...base,
            x: pr.x,
            y: pr.y,
            width: pr.w,
            height: pr.h,
            fill: COL.select,
            name: 'panel-highlight',
          });
          hl.setAttr('panelIndex', selection.panelIndex);
          parent.add(
            new Konva.Rect({
              ...base,
              x: rect.x,
              y: rect.y,
              width: rect.w,
              height: rect.h,
              strokeWidth: 1.5,
              dash: [5, 4],
            })
          );
          parent.add(hl);
          return;
        }
      }
    }
  } else {
    const d = lay.dividers.find(
      (dv) => dv.split.id === selection.splitId && dv.index === selection.index
    );
    if (d) rect = ctx.rect(d.rect);
  }
  if (!rect) return;
  parent.add(
    new Konva.Rect({
      ...base,
      x: rect.x,
      y: rect.y,
      width: Math.max(3, rect.w),
      height: Math.max(3, rect.h),
      fill: selection.type === 'frame' ? undefined : COL.select,
    })
  );
}

/**
 * Sash and glass sizes of the selected leaf: the shutter of a slider that
 * was picked, or the sash of an opening pane. Glass is the SIGHT size (what
 * shows between the sash bands); the cut size comes from the cutting list.
 */
export function drawSelectionSizes(
  parent: Parent,
  lay: Layout,
  ctx: RenderCtx,
  selection: CanvasSelection | null
): void {
  if (!selection || selection.type !== 'pane' || selection.paneIds) return;
  if (ctx.detail === 'tiny') return;
  const nl = lay.nodes.get(selection.paneId);
  if (!nl || !isLeaf(nl.node)) return;
  const leaf = nl.node;
  const r = ctx.rect(nl.rect);
  const isDoor = !!ctx.design.door && ctx.design.productType === 'Door';
  let at: PxRect = r;
  let sashW = nl.rect.wMm;
  const sashH = nl.rect.hMm;
  let kind: SashKind;
  if (leaf.category === 'Slidding' && leaf.slide) {
    const index = selection.panelIndex ?? (leaf.slide.panels.length === 1 ? 0 : undefined);
    if (index === undefined) return;
    const panel = slideLayout(leaf.slide, nl.rect.wMm).panels[index];
    const pr = slidePanelRectPx(leaf.slide, r, ctx, index);
    if (!panel || !pr) return;
    at = pr;
    sashW = panel.widthMm;
    kind = 'sliding';
  } else if (leaf.casementType === 'Openable') {
    kind = isDoor ? 'door' : 'casement';
  } else {
    return;
  }
  const faceMm = sashFacePx(ctx, leaf, kind, at) / ctx.view.pxPerMm;
  const mm = (w: number, h: number): string => `${Math.round(w)} × ${Math.round(h)}`;
  const text = new Konva.Text({
    text: `Sash ${mm(sashW, sashH)}\nGlass ${mm(sashW - 2 * faceMm, sashH - 2 * faceMm)}`,
    fontSize: ctx.detail === 'full' ? 11 : 9,
    lineHeight: 1.25,
    padding: 4,
    fill: '#ffffff',
    align: 'center',
  });
  const label = new Konva.Label({
    x: at.x + at.w / 2 - text.width() / 2,
    y: at.y + at.h * 0.68 - text.height() / 2,
    listening: false,
    name: 'leaf-sizes',
  });
  label.setAttrs({
    paneId: leaf.id,
    panelIndex: selection.panelIndex ?? null,
    sashWMm: Math.round(sashW),
    sashHMm: Math.round(sashH),
    glassWMm: Math.round(sashW - 2 * faceMm),
    glassHMm: Math.round(sashH - 2 * faceMm),
  });
  label.add(new Konva.Tag({ fill: '#111827', cornerRadius: 3, opacity: 0.88 }));
  label.add(text);
  parent.add(label);
}

export function drawGhost(
  parent: Parent,
  lay: Layout,
  ctx: RenderCtx,
  ghost: RenderGhost | null
): void {
  if (!ghost) return;
  const nl = lay.nodes.get(ghost.paneId);
  if (!nl) return;
  const c = nl.content;
  const a =
    ghost.axis === 'x'
      ? ctx.pt(c.xMm + ghost.posMm, c.yMm)
      : ctx.pt(c.xMm, c.yMm + ghost.posMm);
  const b =
    ghost.axis === 'x'
      ? ctx.pt(c.xMm + ghost.posMm, c.yMm + c.hMm)
      : ctx.pt(c.xMm + c.wMm, c.yMm + ghost.posMm);
  parent.add(
    new Konva.Line({
      points: [a.x, a.y, b.x, b.y],
      stroke: COL.ghost,
      strokeWidth: 3,
      dash: [8, 5],
      listening: false,
      name: 'ghost-line',
    })
  );
  parent.add(
    new Konva.Text({
      x: Math.min(a.x, b.x) + 6,
      y: a.y - 16,
      text: `${Math.round(ghost.posMm)} mm`,
      fontSize: 11,
      fill: COL.ghost,
      listening: false,
      name: 'ghost-label',
    })
  );
}

/** One square handle on each corner of the frame's bounding box. */
export function drawFrameHandles(parent: Parent, frame: PxRect, ctx: RenderCtx): void {
  const hs = 9;
  const corners: [string, number, number][] = [
    ['nw', frame.x, frame.y],
    ['ne', frame.x + frame.w, frame.y],
    ['sw', frame.x, frame.y + frame.h],
    ['se', frame.x + frame.w, frame.y + frame.h],
  ];
  for (const [screenCorner, x, y] of corners) {
    const handle = new Konva.Rect({
      x: x - hs / 2,
      y: y - hs / 2,
      width: hs,
      height: hs,
      fill: '#ffffff',
      stroke: COL.selectStroke,
      strokeWidth: 1.5,
      listening: false,
      name: 'frame-handle',
    });
    // The MODEL corner this handle resizes (west/east swap when mirrored).
    const we = screenCorner[1] === 'w' ? 'w' : 'e';
    const modelWe = ctx.flip ? (we === 'w' ? 'e' : 'w') : we;
    handle.setAttr('corner', screenCorner[0] + modelWe);
    parent.add(handle);
  }
}

export function drawReadout(
  parent: Parent,
  ctx: RenderCtx,
  readout: RenderReadout
): void {
  const p = ctx.pt(readout.xMm, readout.yMm);
  const label = new Konva.Label({
    x: p.x + 12,
    y: p.y - 26,
    listening: false,
    name: 'drag-readout',
  });
  label.add(
    new Konva.Tag({
      fill: '#111827',
      cornerRadius: 3,
      pointerDirection: 'down',
      pointerWidth: 6,
      pointerHeight: 5,
    })
  );
  label.add(
    new Konva.Text({ text: readout.text, fontSize: 12, padding: 5, fill: '#ffffff' })
  );
  parent.add(label);
}

export function drawFocusRing(parent: Parent, ctx: RenderCtx): void {
  parent.add(
    new Konva.Rect({
      x: 1.5,
      y: 1.5,
      width: ctx.opts.stageWPx - 3,
      height: ctx.opts.stageHPx - 3,
      stroke: COL.selectStroke,
      strokeWidth: 2,
      dash: [6, 4],
      listening: false,
      name: 'focus-ring',
      opacity: 0.7,
    })
  );
}

/** "Viewed from inside" tag, drawn only for the non-default view. */
export function drawViewBadge(parent: Parent, ctx: RenderCtx): void {
  if ((ctx.opts.viewFrom ?? 'outside') === 'outside') return;
  const label = new Konva.Label({ x: 8, y: 8, listening: false, name: 'view-badge' });
  label.add(new Konva.Tag({ fill: '#fff4e5', stroke: '#e8590c', strokeWidth: 1, cornerRadius: 3 }));
  label.add(
    new Konva.Text({
      text: 'Viewed from inside (mirrored)',
      fontSize: 11,
      padding: 4,
      fill: '#9a3412',
    })
  );
  parent.add(label);
}
