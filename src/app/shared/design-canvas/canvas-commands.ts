/**
 * design-canvas — toolbar / keyboard commands on the selection: split a
 * pane, equalize, delete a divider, type the frame size. Each is a no-op in
 * read-only mode and commits at most one undo step.
 */

import {
  WindowDesign,
  equalize,
  findNode,
  findParent,
  isLeaf,
  isSplit,
  removeDivider,
  resizeFrame,
  splitPane,
  walkLeaves,
} from '../design-model';
import { CanvasHost } from './canvas-host';
import { CanvasSelection } from './canvas-view';
import { shapeRemovesAPane } from './design-edit-ops';

/** Split the selected pane at its midpoint (keyboard / dblclick path). */
export function splitSelected(h: CanvasHost, axis: 'x' | 'y'): void {
  if (h.readOnly) return;
  if (h.selection?.type !== 'pane') return;
  const nl = h.currentLayout().nodes.get(h.selection.paneId);
  if (!nl) return;
  const span = axis === 'x' ? nl.content.wMm : nl.content.hMm;
  trySplit(h, h.selection.paneId, axis, span / 2);
}

export function trySplit(
  h: CanvasHost,
  paneId: string,
  axis: 'x' | 'y',
  posMm: number
): void {
  const opts = { frameFaceMm: h.frameFaceMm };
  try {
    const next = splitPane(h.design, paneId, axis, posMm, {
      ...opts,
      dividerFaceMm: h.frameFaceMm,
    });
    // In a shaped frame, refuse a split that leaves a pane with no glass.
    if (shapeRemovesAPane(next, opts)) return;
    h.commit(next);
    // The split reuses the pane's id for the split node; select its first
    // child leaf so the selection stays on a pane.
    const node = findNode(h.design.root, paneId);
    if (node && isSplit(node)) {
      const first = walkLeaves(node.children[0])[0];
      if (first) h.setSelection({ type: 'pane', paneId: first.id });
    }
  } catch {
    // Pane too small to split — leave the model untouched.
  }
}

/** The split the current selection refers to (for equalize). */
function contextSplitId(h: CanvasHost): string | null {
  const sel = h.selection;
  if (!sel) return null;
  const root = h.design.root;
  if (sel.type === 'divider') return sel.splitId;
  if (sel.type === 'pane') return findParent(root, sel.paneId)?.id ?? null;
  return isSplit(root) ? root.id : null;
}

export function equalizeSelected(h: CanvasHost): void {
  if (h.readOnly) return;
  const splitId = contextSplitId(h);
  if (!splitId) return;
  h.commit(equalize(h.design, splitId, { frameFaceMm: h.frameFaceMm }));
}

export function deleteSelectedDivider(h: CanvasHost): void {
  if (h.readOnly) return;
  if (h.selection?.type !== 'divider') return;
  const { splitId, index } = h.selection;
  h.commit(removeDivider(h.design, splitId, index, { frameFaceMm: h.frameFaceMm }));
}

export function setFrameSize(h: CanvasHost, which: 'w' | 'h', raw: string): void {
  if (h.readOnly) return;
  const v = Number(raw);
  if (!Number.isFinite(v)) return;
  const d = h.design;
  h.commit(
    resizeFrame(
      d,
      which === 'w' ? v : d.frame.widthMm,
      which === 'h' ? v : d.frame.heightMm,
      { frameFaceMm: h.frameFaceMm }
    )
  );
}

/**
 * The selection as it still resolves in `design`: unchanged when valid,
 * null when its node / divider is gone, trimmed when only its sliding panel
 * index no longer exists.
 */
export function resolveSelection(
  design: WindowDesign,
  sel: CanvasSelection | null
): CanvasSelection | null {
  if (!sel || sel.type === 'frame') return sel;
  if (sel.type === 'pane') {
    const node = findNode(design.root, sel.paneId);
    if (!node || !isLeaf(node)) return null;
    if (
      sel.panelIndex !== undefined &&
      sel.panelIndex >= (node.slide?.panels.length ?? 0)
    ) {
      return { type: 'pane', paneId: sel.paneId };
    }
    return sel;
  }
  const node = findNode(design.root, sel.splitId);
  if (!node || !isSplit(node) || sel.index >= node.positionsMm.length) return null;
  return sel;
}
