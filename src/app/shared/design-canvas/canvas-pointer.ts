/**
 * design-canvas — pointer interaction controller: select, drag a divider
 * with snapping, drag a corner handle to resize the frame, palette
 * drag-to-split with a live ghost, pan (space / middle button / empty
 * canvas) and the touch gestures (pinch zoom + two-finger pan).
 */

import {
  Layout,
  SplitNode,
  WindowDesign,
  findNode,
  isLeaf,
  isSplit,
  layout,
  moveDivider,
  resizeFrame,
  snapDividerMm,
} from '../design-model';
import { CanvasHost, GRID_MM, PosPx } from './canvas-host';
import {
  CanvasTool,
  PointMm,
  hitTest,
  mmFromPx,
  slidePanelAt,
} from './canvas-view';

export class PointerController {
  private pointers = new Map<number, PosPx>();
  private pinch: { dist: number; midX: number; midY: number } | null = null;

  constructor(
    private readonly host: CanvasHost,
    private readonly captureTarget: () => HTMLElement
  ) {}

  /** Hit tolerance in mm: ≥12 px for mouse, ≥24 px band for touch. */
  private tolMm(e: PointerEvent): number {
    const px = e.pointerType === 'touch' ? 24 : 12;
    return px / this.host.currentView().pxPerMm;
  }

  private capture(el: HTMLElement, pointerId: number): void {
    try {
      el.setPointerCapture(pointerId);
    } catch {
      // Synthetic events (tests) have no active pointer to capture.
    }
  }

  private startPan(pos: PosPx): void {
    const h = this.host;
    h.drag = { kind: 'pan', startX: pos.x, startY: pos.y, panX0: h.panX, panY0: h.panY };
  }

  down(e: PointerEvent): void {
    const h = this.host;
    h.focusCanvas();
    const pos = h.eventPos(e);
    this.pointers.set(e.pointerId, pos);
    this.capture(this.captureTarget(), e.pointerId);

    if (this.pointers.size === 2) {
      // Two fingers: pinch zoom + pan; cancel any one-finger drag.
      const [a, b] = [...this.pointers.values()];
      this.pinch = {
        dist: Math.hypot(b.x - a.x, b.y - a.y),
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
      };
      h.drag = null;
      h.ghost = null;
      h.readout = null;
      h.render();
      return;
    }

    if (h.spaceHeld || e.button === 1) {
      this.startPan(pos);
      return;
    }

    const view = h.currentView();
    const mm = mmFromPx(view, pos.x, pos.y);
    const lay = h.currentLayout();
    const hit = hitTest(h.displayDesign, lay, mm, this.tolMm(e), {
      frameHandle: !h.readOnly,
    });

    if (h.armedTool && hit.kind === 'pane' && !h.readOnly) {
      this.splitAt(hit.paneId, h.armedTool, mm);
      h.armedTool = null;
      h.ghost = null;
      h.render();
      return;
    }

    switch (hit.kind) {
      case 'frame-handle':
        if (h.readOnly) break;
        h.drag = {
          kind: 'frame-handle',
          corner: hit.corner,
          view0: view,
          w0Mm: h.design.frame.widthMm,
          h0Mm: h.design.frame.heightMm,
          preview: h.design,
        };
        break;
      case 'divider':
        h.setSelection({ type: 'divider', splitId: hit.splitId, index: hit.index });
        if (!h.readOnly) {
          h.drag = {
            kind: 'divider',
            splitId: hit.splitId,
            index: hit.index,
            axis: hit.axis,
            preview: h.design,
            moved: false,
          };
        }
        h.render();
        break;
      case 'pane': {
        const nl = lay.nodes.get(hit.paneId);
        const panel =
          nl && isLeaf(nl.node) ? slidePanelAt(nl.node, nl.rect, mm) : null;
        h.setSelection(
          panel === null
            ? { type: 'pane', paneId: hit.paneId }
            : { type: 'pane', paneId: hit.paneId, panelIndex: panel }
        );
        h.render();
        break;
      }
      case 'frame':
        h.setSelection({ type: 'frame' });
        h.render();
        break;
      default:
        h.setSelection(null);
        this.startPan(pos);
        h.render();
        break;
    }
  }

  move(e: PointerEvent): void {
    const h = this.host;
    const pos = h.eventPos(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, pos);

    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      if (this.pinch.dist > 0 && dist > 0) {
        // Scale about where the fingers WERE, then follow them: the content
        // under the fingers stays under them (no drift on a pure pan).
        h.zoomAt(this.pinch.midX, this.pinch.midY, dist / this.pinch.dist);
      }
      h.panX += midX - this.pinch.midX;
      h.panY += midY - this.pinch.midY;
      this.pinch = { dist, midX, midY };
      h.render();
      return;
    }

    // Armed-tool hover ghost (no button down).
    if (!h.drag && h.armedTool && !h.readOnly) {
      this.updateGhost(h.armedTool, pos);
      h.render();
      return;
    }

    const drag = h.drag;
    if (!drag) return;

    switch (drag.kind) {
      case 'pan':
        h.panX = drag.panX0 + (pos.x - drag.startX);
        h.panY = drag.panY0 + (pos.y - drag.startY);
        h.render();
        break;
      case 'divider': {
        const mm = mmFromPx(h.currentView(), pos.x, pos.y);
        const next = this.dividerPreview(drag.splitId, drag.index, mm);
        if (next) {
          drag.preview = next.design;
          drag.moved = true;
          h.readout = { xMm: mm.xMm, yMm: mm.yMm, text: `${Math.round(next.posMm)} mm` };
          h.render();
        }
        break;
      }
      case 'frame-handle': {
        // Measured in the drag-start view, so the handle follows the pointer.
        const mm = mmFromPx(drag.view0, pos.x, pos.y);
        const east = drag.corner[1] === 'e';
        const south = drag.corner[0] === 's';
        const w = Math.round(east ? mm.xMm : drag.w0Mm - mm.xMm);
        const hh = Math.round(south ? mm.yMm : drag.h0Mm - mm.yMm);
        try {
          drag.preview = resizeFrame(h.design, w, hh, { frameFaceMm: h.frameFaceMm });
        } catch {
          break; // keep the last valid preview
        }
        const f = drag.preview.frame;
        h.readout = {
          xMm: east ? f.widthMm : 0,
          yMm: south ? f.heightMm : 0,
          text: `${Math.round(f.widthMm)} × ${Math.round(f.heightMm)} mm`,
        };
        h.render();
        break;
      }
      default:
        break;
    }
  }

  up(e: PointerEvent): void {
    const h = this.host;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const drag = h.drag;
    if (!drag) return;
    h.drag = null;
    h.readout = null;

    if (drag.kind === 'divider' && drag.moved) {
      h.commit(drag.preview);
      return;
    }
    if (drag.kind === 'frame-handle') {
      h.commit(drag.preview);
      // commit() is a no-op for an unmoved handle; redraw either way.
      h.render();
      return;
    }
    h.render();
  }

  cancel(e: PointerEvent): void {
    const h = this.host;
    this.pointers.delete(e.pointerId);
    this.pinch = null;
    h.drag = null;
    h.readout = null;
    h.ghost = null;
    h.render();
  }

  /* ---------------- divider move + snapping ---------------- */

  /**
   * Preview of moving a divider so its centreline tracks the pointer,
   * snapped to equal-division, the 50 mm grid and sibling-divider
   * alignment (design-model snapDividerMm).
   */
  private dividerPreview(
    splitId: string,
    index: number,
    mm: PointMm
  ): { design: WindowDesign; posMm: number } | null {
    const h = this.host;
    const present = h.design;
    const node = findNode(present.root, splitId);
    if (!node || !isSplit(node)) return null;
    const lay = layout(present, { frameFaceMm: h.frameFaceMm });
    const nl = lay.nodes.get(splitId);
    if (!nl) return null;
    const origin = node.axis === 'x' ? nl.content.xMm : nl.content.yMm;
    const span = node.axis === 'x' ? nl.content.wMm : nl.content.hMm;
    const raw = (node.axis === 'x' ? mm.xMm : mm.yMm) - origin;
    const snapped = this.snapPosition(node, span, index, raw, lay, origin);
    return {
      design: moveDivider(present, splitId, index, snapped, {
        frameFaceMm: h.frameFaceMm,
      }),
      posMm: snapped,
    };
  }

  private snapPosition(
    split: SplitNode,
    spanMm: number,
    index: number,
    rawMm: number,
    lay: Layout,
    originMm: number
  ): number {
    // Sibling alignment targets: centrelines of OTHER dividers running the
    // same direction, converted into this split's local coordinates.
    const direction = split.axis === 'x' ? 'vertical' : 'horizontal';
    const siblings: number[] = [];
    for (const d of lay.dividers) {
      if (d.direction !== direction) continue;
      if (d.split.id === split.id && d.index === index) continue;
      const centre =
        direction === 'vertical'
          ? d.rect.xMm + d.rect.wMm / 2
          : d.rect.yMm + d.rect.hMm / 2;
      siblings.push(centre - originMm);
    }
    return snapDividerMm(split, spanMm, index, rawMm, {
      gridMm: GRID_MM,
      toleranceMm: 8 / this.host.currentView().pxPerMm + 4,
      siblingPositionsMm: siblings,
    });
  }

  /* ---------------- palette: drag to split / arm ---------------- */

  paletteDown(e: PointerEvent, tool: CanvasTool): void {
    const h = this.host;
    if (h.readOnly) return;
    e.preventDefault();
    this.capture(e.target as HTMLElement, e.pointerId);
    const pos = h.eventPos(e);
    h.drag = { kind: 'palette', tool, startX: pos.x, startY: pos.y, moved: false };
  }

  paletteMove(e: PointerEvent): void {
    const h = this.host;
    if (h.drag?.kind !== 'palette') return;
    const pos = h.eventPos(e);
    if (Math.hypot(pos.x - h.drag.startX, pos.y - h.drag.startY) > 5) {
      h.drag.moved = true;
    }
    this.updateGhost(h.drag.tool, pos);
    h.render();
  }

  paletteUp(e: PointerEvent): void {
    const h = this.host;
    if (h.drag?.kind !== 'palette') return;
    const drag = h.drag;
    h.drag = null;
    const pos = h.eventPos(e);
    if (!drag.moved) {
      // Click (no drag): toggle armed mode — next click on a pane splits it.
      h.armedTool = h.armedTool === drag.tool ? null : drag.tool;
      h.ghost = null;
      h.render();
      return;
    }
    const mm = mmFromPx(h.currentView(), pos.x, pos.y);
    const hit = hitTest(h.displayDesign, h.currentLayout(), mm, 0.1);
    if (hit.kind === 'pane') this.splitAt(hit.paneId, drag.tool, mm);
    h.ghost = null;
    h.render();
  }

  private updateGhost(tool: CanvasTool, pos: PosPx): void {
    const h = this.host;
    const mm = mmFromPx(h.currentView(), pos.x, pos.y);
    const lay = h.currentLayout();
    const hit = hitTest(h.displayDesign, lay, mm, 0.1);
    const nl = hit.kind === 'pane' ? lay.nodes.get(hit.paneId) : undefined;
    if (hit.kind !== 'pane' || !nl) {
      h.ghost = null;
      return;
    }
    const axis = tool === 'split-x' ? 'x' : 'y';
    const raw = axis === 'x' ? mm.xMm - nl.content.xMm : mm.yMm - nl.content.yMm;
    const span = axis === 'x' ? nl.content.wMm : nl.content.hMm;
    h.ghost = { paneId: hit.paneId, axis, posMm: Math.min(span, Math.max(0, raw)) };
  }

  private splitAt(paneId: string, tool: CanvasTool, mm: PointMm): void {
    const nl = this.host.currentLayout().nodes.get(paneId);
    if (!nl) return;
    const axis = tool === 'split-x' ? 'x' : 'y';
    // Whole millimetres only: a dropped divider never lands on a fraction.
    const pos = Math.round(
      axis === 'x' ? mm.xMm - nl.content.xMm : mm.yMm - nl.content.yMm
    );
    this.host.trySplit(paneId, axis, pos);
  }
}
