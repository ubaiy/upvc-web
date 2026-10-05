/**
 * design-canvas — keyboard handling: undo / redo, pane cycling (Tab), split
 * (V / H), equalize (E), delete divider, 1 mm / 10 mm divider nudges, zoom
 * (+ / - / 0), space-to-pan and Escape. Also the text the status bar and
 * screen readers get for the current design and selection.
 */

import {
  Layout,
  WindowDesign,
  findNode,
  isSplit,
  moveDivider,
  pallaBarLayouts,
  walkLeaves,
} from '../design-model';
import { CanvasHost, NUDGE_BIG_MM, NUDGE_MM } from './canvas-host';
import { CanvasSelection } from './canvas-view';

export function handleKeydown(h: CanvasHost, e: KeyboardEvent): void {
  if (h.edit) return; // the inline editor handles its own keys

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (h.readOnly) return;
    if (e.shiftKey) h.redo();
    else h.undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    if (!h.readOnly) h.redo();
    return;
  }

  switch (e.key) {
    case 'Tab':
      e.preventDefault();
      cyclePane(h, e.shiftKey ? -1 : 1);
      return;
    case 'Escape':
      h.armedTool = null;
      h.ghost = null;
      h.setSelection(null);
      h.render();
      return;
    case ' ':
      h.spaceHeld = true;
      e.preventDefault();
      return;
    case '+':
    case '=':
      h.zoomIn();
      return;
    case '-':
      h.zoomOut();
      return;
    case '0':
      h.fitToScreen();
      return;
    default:
      break;
  }

  if (h.readOnly) return;

  const step = e.shiftKey ? NUDGE_BIG_MM : NUDGE_MM;
  switch (e.key) {
    case 'v':
    case 'V':
      h.splitSelected('x');
      return;
    case 'h':
    case 'H':
      h.splitSelected('y');
      return;
    case 'e':
    case 'E':
      h.equalizeSelected();
      return;
    case 'Delete':
    case 'Backspace':
      h.deleteSelectedDivider();
      return;
    case 'ArrowLeft':
      nudgeDivider(h, 'x', -step, e);
      return;
    case 'ArrowRight':
      nudgeDivider(h, 'x', step, e);
      return;
    case 'ArrowUp':
      nudgeDivider(h, 'y', -step, e);
      return;
    case 'ArrowDown':
      nudgeDivider(h, 'y', step, e);
      return;
    default:
      return;
  }
}

/** Move the selected divider by `deltaMm` (keyboard 1 mm / 10 mm path). */
function nudgeDivider(
  h: CanvasHost,
  axis: 'x' | 'y',
  deltaMm: number,
  e: KeyboardEvent
): void {
  const sel = h.selection;
  if (sel?.type !== 'divider') return;
  const node = findNode(h.design.root, sel.splitId);
  if (!node || !isSplit(node) || node.axis !== axis) return;
  e.preventDefault();
  h.commit(
    moveDivider(h.design, sel.splitId, sel.index, node.positionsMm[sel.index] + deltaMm, {
      frameFaceMm: h.frameFaceMm,
    })
  );
}

/** Tab / Shift+Tab pane cycling. */
function cyclePane(h: CanvasHost, step: 1 | -1): void {
  const leaves = walkLeaves(h.design.root);
  if (!leaves.length) return;
  let idx = -1;
  const sel = h.selection;
  if (sel?.type === 'pane') idx = leaves.findIndex((l) => l.id === sel.paneId);
  const next = ((idx + step) % leaves.length + leaves.length) % leaves.length;
  h.setSelection({ type: 'pane', paneId: leaves[next].id });
  h.render();
}

/** Selected item size for the status bar ('' when nothing is selected). */
export function selectionText(
  d: WindowDesign,
  lay: Layout,
  sel: CanvasSelection | null
): string {
  if (!sel) return '';
  if (sel.type === 'frame') {
    return `frame ${Math.round(d.frame.widthMm)} × ${Math.round(d.frame.heightMm)} mm`;
  }
  if (sel.type === 'pane') {
    const nl = lay.nodes.get(sel.paneId);
    if (!nl) return '';
    const panel = sel.panelIndex === undefined ? '' : `, panel ${sel.panelIndex + 1}`;
    return `pane ${Math.round(nl.rect.wMm)} × ${Math.round(nl.rect.hMm)} mm${panel}`;
  }
  if (sel.type === 'bar') {
    const b = pallaBarLayouts(lay).find(
      (x) => x.paneId === sel.paneId && x.panelIndex === sel.panelIndex && x.index === sel.index
    );
    if (!b) return '';
    const at =
      b.axis === 'x'
        ? b.rect.xMm + b.rect.wMm / 2 - b.palla.xMm
        : b.rect.yMm + b.rect.hMm / 2 - b.palla.yMm;
    const where = sel.panelIndex === undefined ? 'sash' : `shutter ${sel.panelIndex + 1}`;
    return `${b.axis === 'x' ? 'vertical' : 'horizontal'} bar of the ${where} @ ${Math.round(at)} mm`;
  }
  const dv = lay.dividers.find(
    (x) => x.split.id === sel.splitId && x.index === sel.index
  );
  if (!dv) return '';
  return `${dv.direction} divider @ ${Math.round(dv.split.positionsMm[sel.index])} mm`;
}

/** Screen-reader summary of the window structure (aria-label). */
export function ariaSummary(d: WindowDesign, lay: Layout): string {
  const leaves = walkLeaves(d.root);
  const parts = leaves.map((l, i) => {
    const r = lay.nodes.get(l.id)?.rect;
    const size = r ? `${Math.round(r.wMm)} by ${Math.round(r.hMm)} mm` : '';
    const kind =
      l.category === 'Slidding'
        ? `sliding (${l.slide?.tracks ?? ''}, ${l.slide?.panels.length ?? 0} panels${l.slide?.mesh ? ', fly mesh' : ''})`
        : l.casementType === 'Openable'
          ? `openable ${l.opening?.direction ?? ''}`
          : 'fixed';
    return `pane ${i + 1}: ${kind} ${size}`;
  });
  const what = d.productType === 'Door' ? 'Door' : 'Window';
  const shape =
    d.frame.shape.kind === 'rect' ? '' : ` ${d.frame.shape.kind} shaped frame,`;
  return (
    `${what} design canvas.${shape} Frame ${Math.round(d.frame.widthMm)} by ` +
    `${Math.round(d.frame.heightMm)} millimetres, ${leaves.length} pane` +
    `${leaves.length === 1 ? '' : 's'}. ${parts.join('; ')}. ` +
    'Tab selects panes, V or H splits the selected pane, arrow keys move a selected divider.'
  );
}
