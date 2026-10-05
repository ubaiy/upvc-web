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
  pallaBarsOf,
  removeDivider,
  removePallaBar,
  resizeFrame,
  splitPalla,
  splitPane,
  walkLeaves,
} from '../design-model';
import { CanvasHost } from './canvas-host';
import { CanvasSelection, PointMm, SplitTarget, splitTargetOf } from './canvas-view';
import { shapeRemovesAPane } from './design-edit-ops';

/**
 * Divide what is selected, in the middle (toolbar click / keyboard): the
 * selected palla gets a bar of its own, selected fixed glass a frame
 * divider, and with the FRAME selected an undivided window is divided as a
 * whole. False when the selection names nothing to divide.
 */
export function splitSelected(h: CanvasHost, axis: 'x' | 'y'): boolean {
  if (h.readOnly) return false;
  const sel = h.selection;
  const lay = h.currentLayout();
  if (sel?.type === 'frame') {
    const root = h.design.root;
    if (!isLeaf(root)) return false;
    const nl = lay.nodes.get(root.id);
    if (!nl) return false;
    return trySplit(h, root.id, axis, (axis === 'x' ? nl.content.wMm : nl.content.hMm) / 2);
  }
  if (sel?.type !== 'pane' || sel.paneIds) return false;
  const target = splitTargetOf(lay, sel.paneId, { panelIndex: sel.panelIndex });
  if (!target) return false;
  if (!target.palla) {
    const span = axis === 'x' ? target.rect.wMm : target.rect.hMm;
    return trySplit(h, sel.paneId, axis, span / 2);
  }
  return tryPallaBar(h, target, axis, null);
}

/** Divide what a split tool targets at point `p` (armed click / palette drop). */
export function splitAt(
  h: CanvasHost,
  paneId: string,
  axis: 'x' | 'y',
  p: PointMm,
  whole: boolean
): boolean {
  if (h.readOnly) return false;
  const target = splitTargetOf(h.currentLayout(), paneId, { p, whole });
  if (!target) return false;
  const raw = axis === 'x' ? p.xMm - target.rect.xMm : p.yMm - target.rect.yMm;
  // Whole millimetres only: a dropped divider never lands on a fraction.
  if (!target.palla) return trySplit(h, paneId, axis, Math.round(raw));
  const span = axis === 'x' ? target.rect.wMm : target.rect.hMm;
  return tryPallaBar(h, target, axis, Math.round(raw) / span);
}

/**
 * Add a bar to ONE palla at fraction `at`; null = the middle of its largest
 * part, so a second click halves what is left instead of stacking bars.
 */
function tryPallaBar(
  h: CanvasHost,
  target: SplitTarget,
  axis: 'x' | 'y',
  at: number | null
): boolean {
  const ref = { paneId: target.paneId, panelIndex: target.panelIndex };
  const node = findNode(h.design.root, target.paneId);
  if (!node || !isLeaf(node)) return false;
  let where = at;
  if (where === null) {
    const edges = [0, ...(pallaBarsOf(node, target.panelIndex)?.at ?? []), 1];
    where = 0.5;
    let widest = 0;
    for (let i = 1; i < edges.length; i++) {
      if (edges[i] - edges[i - 1] > widest + 1e-9) {
        widest = edges[i] - edges[i - 1];
        where = (edges[i] + edges[i - 1]) / 2;
      }
    }
  }
  try {
    h.commit(splitPalla(h.design, ref, axis, where, { frameFaceMm: h.frameFaceMm }));
    // The palla stays the selection: it is still one sash / one shutter.
    h.setSelection(
      target.panelIndex === undefined
        ? { type: 'pane', paneId: target.paneId }
        : { type: 'pane', paneId: target.paneId, panelIndex: target.panelIndex }
    );
    return true;
  } catch {
    // Too small, or it already carries bars the other way: model untouched.
    return false;
  }
}

/**
 * The line by the tools: what the armed tool, or a click on a tool, will
 * divide. '' when there is nothing to say.
 */
export function toolHint(h: CanvasHost): string {
  if (h.readOnly) return '';
  const lay = h.currentLayout();
  if (h.armedTool) {
    const bar = h.armedTool === 'split-x' ? 'Vertical' : 'Horizontal';
    const over = h.ghost
      ? splitTargetOf(lay, h.ghost.paneId, { panelIndex: h.ghost.panelIndex, whole: h.ghost.whole })
      : null;
    const crossed = over ? barsAcross(h, over, h.armedTool === 'split-x' ? 'x' : 'y') : '';
    if (over && crossed) {
      return `${bar} divider: ${over.label} already has ${crossed} bars. Remove them first (pick a bar, Delete), or Alt+click for a frame divider across the pane.`;
    }
    return over
      ? `${bar} divider: click to divide ${over.label}. Alt+click puts a frame divider across the pane. Esc cancels.`
      : `${bar} divider: pick the palla to divide (it is outlined under the pointer). Esc cancels.`;
  }
  const sel = h.selection;
  if (sel?.type === 'frame') {
    return isLeaf(h.design.root)
      ? 'Split / Transom will divide the WHOLE window with a frame divider.'
      : 'The window is already divided: pick one palla, then Split or Transom.';
  }
  if (sel?.type === 'pane' && !sel.paneIds) {
    const target = splitTargetOf(lay, sel.paneId, { panelIndex: sel.panelIndex });
    if (!target) return 'Pick one shutter of the slider: Split or Transom then divides that shutter only.';
    const has = barsAcross(h, target, 'x') || barsAcross(h, target, 'y');
    if (has) {
      // A palla carries bars one way: say which tool still works on it.
      const [more, other] = has === 'vertical' ? ['Split', 'Transom'] : ['Transom', 'Split'];
      return `${more} adds another bar to ${target.label} only. ${other} needs its ${has} bars removed first (pick a bar, Delete).`;
    }
    return `Split / Transom will divide ${target.label} only.`;
  }
  if (sel?.type === 'bar') return 'Drag the bar to move it. Delete removes it.';
  return '';
}

/** 'vertical' / 'horizontal' when the palla already has bars that a bar along `axis` would cross. */
function barsAcross(h: CanvasHost, target: SplitTarget, axis: 'x' | 'y'): string {
  if (!target.palla) return '';
  const node = findNode(h.design.root, target.paneId);
  const bars = node && isLeaf(node) ? pallaBarsOf(node, target.panelIndex) : undefined;
  if (!bars || bars.axis === axis) return '';
  return bars.axis === 'x' ? 'vertical' : 'horizontal';
}

export function trySplit(
  h: CanvasHost,
  paneId: string,
  axis: 'x' | 'y',
  posMm: number
): boolean {
  const opts = { frameFaceMm: h.frameFaceMm };
  try {
    const next = splitPane(h.design, paneId, axis, posMm, {
      ...opts,
      dividerFaceMm: h.frameFaceMm,
    });
    // In a shaped frame, refuse a split that leaves a pane with no glass.
    if (shapeRemovesAPane(next, opts)) return false;
    h.commit(next);
    // The split reuses the pane's id for the split node; select its first
    // child leaf so the selection stays on a pane.
    const node = findNode(h.design.root, paneId);
    if (node && isSplit(node)) {
      const first = walkLeaves(node.children[0])[0];
      if (first) h.setSelection({ type: 'pane', paneId: first.id });
    }
    return true;
  } catch {
    // Pane too small to split — leave the model untouched.
    return false;
  }
}

/** The split the current selection refers to (for equalize). */
function contextSplitId(h: CanvasHost): string | null {
  const sel = h.selection;
  if (!sel) return null;
  const root = h.design.root;
  if (sel.type === 'divider') return sel.splitId;
  if (sel.type === 'pane' || sel.type === 'bar') return findParent(root, sel.paneId)?.id ?? null;
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
  if (h.selection?.type === 'bar') {
    // A palla's own bar: its two parts become one again.
    const { paneId, panelIndex, index } = h.selection;
    try {
      h.commit(removePallaBar(h.design, { paneId, panelIndex }, index));
      h.setSelection(
        panelIndex === undefined ? { type: 'pane', paneId } : { type: 'pane', paneId, panelIndex }
      );
    } catch {
      // The bar is already gone.
    }
    return;
  }
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
    if (sel.paneIds) {
      // Several panes: keep the ones that are still panes.
      const live = sel.paneIds.filter((id) => {
        const n = findNode(design.root, id);
        return !!n && isLeaf(n);
      });
      if (live.length === sel.paneIds.length && node && isLeaf(node)) return sel;
      if (!live.length) return null;
      const primary = live.includes(sel.paneId) ? sel.paneId : live[live.length - 1];
      return live.length > 1
        ? { type: 'pane', paneId: primary, paneIds: live }
        : { type: 'pane', paneId: primary };
    }
    if (!node || !isLeaf(node)) return null;
    if (
      sel.panelIndex !== undefined &&
      sel.panelIndex >= (node.slide?.panels.length ?? 0)
    ) {
      return { type: 'pane', paneId: sel.paneId };
    }
    return sel;
  }
  if (sel.type === 'bar') {
    const leaf = findNode(design.root, sel.paneId);
    if (!leaf || !isLeaf(leaf)) return null;
    const bars = pallaBarsOf(leaf, sel.panelIndex);
    if (bars && sel.index < bars.at.length) return sel;
    // The bar is gone (undo, delete): fall back to its palla.
    return resolveSelection(
      design,
      sel.panelIndex === undefined
        ? { type: 'pane', paneId: sel.paneId }
        : { type: 'pane', paneId: sel.paneId, panelIndex: sel.panelIndex }
    );
  }
  const node = findNode(design.root, sel.splitId);
  if (!node || !isSplit(node) || sel.index >= node.positionsMm.length) return null;
  return sel;
}
