/**
 * design-canvas — inline "type exact mm" editor controller. A double-click
 * opens a small input over the canvas for: a pane size (moves and locks the
 * adjacent divider), a divider position, a sliding panel width, the frame
 * width / height, the arch rise and the trapezoid jamb heights.
 */

import {
  findNode,
  findParent,
  isLeaf,
  isSplit,
  resizeFrame,
  setDividerMm,
  setPaneSizeMm,
  setSlidePanelWidthMm,
} from '../design-model';
import { CanvasHost, EditKind, PosPx } from './canvas-host';
import { hitTest, mmFromPx, rectPxFromMm, slidePanelAt } from './canvas-view';
import { setArchRise, setTrapezoidHeights } from './design-edit-ops';

export class EditController {
  constructor(private readonly host: CanvasHost) {}

  private open(
    kind: EditKind,
    value: number,
    pos: PosPx,
    label: string,
    extra?: { paneId?: string; splitId?: string; index?: number }
  ): void {
    this.host.edit = {
      kind,
      value: String(Math.round(value)),
      leftPx: pos.x,
      topPx: pos.y,
      label,
      ...extra,
    };
    this.host.focusEditSoon();
  }

  dblClick(e: MouseEvent): void {
    const h = this.host;
    if (h.readOnly) return;
    const pos = h.eventPos(e);
    const view = h.currentView();
    const mm = mmFromPx(view, pos.x, pos.y);
    const lay = h.currentLayout();
    const hit = hitTest(h.displayDesign, lay, mm, 12 / view.pxPerMm, {
      frameHandle: false,
    });
    if (hit.kind === 'divider') {
      const node = findNode(h.design.root, hit.splitId);
      if (!node || !isSplit(node)) return;
      this.open('divider', node.positionsMm[hit.index], pos, 'Divider position (mm)', {
        splitId: hit.splitId,
        index: hit.index,
      });
      return;
    }
    if (hit.kind === 'pane') {
      this.openPane(hit.paneId, pos, mm);
      return;
    }
    this.openOutside(pos);
  }

  private openPane(paneId: string, pos: PosPx, mm: { xMm: number; yMm: number }): void {
    const h = this.host;
    const nl = h.currentLayout().nodes.get(paneId);
    if (!nl) return;
    if (isLeaf(nl.node) && nl.node.slide) {
      const panel = slidePanelAt(nl.node, nl.rect, mm);
      if (panel !== null) {
        this.open('panel-width', nl.node.slide.panels[panel].widthMm, pos,
          `Panel ${panel + 1} width (mm)`, { paneId, index: panel });
        return;
      }
    }
    const parent = findParent(h.design.root, paneId);
    if (!parent) {
      // Un-split root pane: typing its size = typing the frame size.
      this.open('frame-w', h.design.frame.widthMm, pos, 'Frame width (mm)');
      return;
    }
    const alongX = parent.axis === 'x';
    this.open('pane-size', alongX ? nl.rect.wMm : nl.rect.hMm, pos,
      alongX ? 'Pane width (mm)' : 'Pane height (mm)', { paneId });
  }

  /** Outside the frame: the dimension lines (below, left, right). */
  private openOutside(pos: PosPx): void {
    const h = this.host;
    const d = h.design;
    const view = h.currentView();
    const f = rectPxFromMm(view, {
      xMm: 0,
      yMm: 0,
      wMm: h.displayDesign.frame.widthMm,
      hMm: h.displayDesign.frame.heightMm,
    });
    const shape = d.frame.shape;
    const mirrored = view.mirrorWMm !== undefined;
    if (pos.y > f.y + f.h && pos.x > f.x - 60) {
      this.open('frame-w', d.frame.widthMm, pos, 'Frame width (mm)');
    } else if (pos.x < f.x || pos.x > f.x + f.w) {
      const screenLeft = pos.x < f.x;
      if (shape.kind === 'trapezoid') {
        // The jamb on that side of the screen (sides swap when mirrored).
        const modelLeft = screenLeft !== mirrored;
        this.open(
          modelLeft ? 'shape-left-h' : 'shape-right-h',
          modelLeft ? shape.leftHeightMm : shape.rightHeightMm,
          pos,
          `${modelLeft ? 'Left' : 'Right'} jamb height (mm)`
        );
      } else if (screenLeft) {
        this.open('frame-h', d.frame.heightMm, pos, 'Frame height (mm)');
      } else if (shape.kind === 'arch-top') {
        this.open('shape-rise', shape.riseMm, pos, 'Arch rise (mm)');
      }
    }
  }

  commit(): void {
    const h = this.host;
    const edit = h.edit;
    if (!edit) return;
    h.edit = null;
    const v = Number(edit.value);
    if (!Number.isFinite(v) || v <= 0) {
      h.render();
      return;
    }
    const present = h.design;
    const opts = { frameFaceMm: h.frameFaceMm };
    const shape = present.frame.shape;
    try {
      switch (edit.kind) {
        case 'pane-size':
          // Typed exact pane mm: moves the adjacent divider AND locks it.
          h.commit(setPaneSizeMm(present, edit.paneId as string, v, opts));
          break;
        case 'divider':
          h.commit(
            setDividerMm(present, edit.splitId as string, edit.index as number, v, opts)
          );
          break;
        case 'panel-width':
          h.commit(
            setSlidePanelWidthMm(present, edit.paneId as string, edit.index as number, v)
          );
          break;
        case 'frame-w':
          h.commit(resizeFrame(present, v, present.frame.heightMm, opts));
          break;
        case 'frame-h':
          h.commit(resizeFrame(present, present.frame.widthMm, v, opts));
          break;
        case 'shape-rise':
          h.commit(setArchRise(present, v, opts));
          break;
        case 'shape-left-h':
        case 'shape-right-h':
          if (shape.kind === 'trapezoid') {
            const left = edit.kind === 'shape-left-h';
            h.commit(
              setTrapezoidHeights(
                present,
                left ? v : shape.leftHeightMm,
                left ? shape.rightHeightMm : v,
                opts
              )
            );
          }
          break;
      }
    } catch {
      h.render();
    }
    h.focusCanvas();
  }

  cancel(): void {
    this.host.edit = null;
    this.host.render();
    this.host.focusCanvas();
  }
}
