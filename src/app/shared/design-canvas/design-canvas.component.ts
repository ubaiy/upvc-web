/**
 * DesignCanvasComponent — the interactive window-design canvas.
 *
 * Phase 1 items 1.2–1.5 of docs/product/designer-architecture.md, built as a
 * NEW standalone component: input = WindowDesign (the canonical model from
 * src/app/shared/design-model), output = (modelChange)/(selectionChange).
 * Pure render-from-model (canvas-renderer.ts); every interaction routes
 * through the design-model's pure operations and lands in a DesignHistory
 * undo stack. All pointer math goes through canvas-view.ts, so hits and
 * pixels always agree with the drawing.
 *
 * Interactions: palette drag-to-split (or arm + click, or V/H keys), drag a
 * divider with snapping (equal division, 50 mm grid, sibling alignment) and
 * a live mm readout, double-click a dimension to type exact mm (locks it),
 * frame resize by typing and by the corner handle, undo/redo (toolbar +
 * Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z), zoom (wheel / pinch / buttons), pan
 * (space-drag / two-finger), fit-to-screen, keyboard pane selection (Tab)
 * and 1 mm / 10 mm divider nudges (arrows / Shift+arrows).
 */

import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import Konva from 'konva';
import {
  DEFAULT_FRAME_FACE_MM,
  DesignHistory,
  FRAME_MAX_MM,
  FRAME_MIN_MM,
  Layout,
  SplitNode,
  WindowDesign,
  effectiveFaceMm,
  equalize,
  findNode,
  findParent,
  isLeaf,
  isSplit,
  layout,
  moveDivider,
  removeDivider,
  resizeFrame,
  setDividerMm,
  setPaneSizeMm,
  snapDividerMm,
  splitPane,
  walkLeaves,
} from '../design-model';
import { RenderGhost, RenderReadout, renderDesign } from './canvas-renderer';
import {
  CanvasSelection,
  CanvasTool,
  HitResult,
  ViewTransform,
  ZOOM_MAX,
  ZOOM_MIN,
  computeView,
  hitTest,
  mmFromPx,
} from './canvas-view';

type DragState =
  | {
      kind: 'divider';
      splitId: string;
      index: number;
      axis: 'x' | 'y';
      preview: WindowDesign;
      moved: boolean;
    }
  | { kind: 'frame-handle'; preview: WindowDesign }
  | { kind: 'palette'; tool: CanvasTool; startX: number; startY: number; moved: boolean }
  | { kind: 'pan'; startX: number; startY: number; panX0: number; panY0: number };

interface EditState {
  kind: 'pane-size' | 'frame-w' | 'frame-h' | 'divider';
  paneId?: string;
  splitId?: string;
  index?: number;
  value: string;
  leftPx: number;
  topPx: number;
  label: string;
}

const GRID_MM = 50;
const NUDGE_MM = 1;
const NUDGE_BIG_MM = 10;

@Component({
  selector: 'app-design-canvas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './design-canvas.component.html',
  styleUrls: ['./design-canvas.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesignCanvasComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  /** The canonical design document. The component NEVER mutates it. */
  @Input() model!: WindowDesign;
  /** Read-only mode: select / zoom / pan only, no mutations. */
  @Input() readOnly = false;
  /** Outer frame profile face width (mm). */
  @Input() frameFaceMm = DEFAULT_FRAME_FACE_MM;
  /** Emits the NEW document after every committed change (incl. undo/redo). */
  @Output() modelChange = new EventEmitter<WindowDesign>();
  /** Emits whenever the selection changes. */
  @Output() selectionChange = new EventEmitter<CanvasSelection | null>();

  @ViewChild('wrapper', { static: true }) wrapperRef!: ElementRef<HTMLElement>;
  @ViewChild('canvasHost', { static: true })
  canvasHostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('editInput') editInputRef?: ElementRef<HTMLInputElement>;

  // --- view state -------------------------------------------------------
  zoom = 1;
  panX = 0;
  panY = 0;
  selection: CanvasSelection | null = null;
  armedTool: CanvasTool | null = null;
  edit: EditState | null = null;
  focused = false;

  private history!: DesignHistory;
  private stage: Konva.Stage | null = null;
  private layer: Konva.Layer | null = null;
  private drag: DragState | null = null;
  private ghost: RenderGhost | null = null;
  private readout: RenderReadout | null = null;
  private spaceHeld = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; midX: number; midY: number } | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  /** The committed present document. */
  get design(): WindowDesign {
    return this.history.present;
  }

  /** The document being displayed (drag preview wins while dragging). */
  get displayDesign(): WindowDesign {
    if (this.drag?.kind === 'divider' || this.drag?.kind === 'frame-handle') {
      return this.drag.preview;
    }
    return this.history.present;
  }

  get canUndo(): boolean {
    return !!this.history?.canUndo;
  }

  get canRedo(): boolean {
    return !!this.history?.canRedo;
  }

  get zoomPercent(): number {
    return Math.round(this.zoom * 100);
  }

  get frameWMm(): number {
    return Math.round(this.displayDesign.frame.widthMm);
  }

  get frameHMm(): number {
    return Math.round(this.displayDesign.frame.heightMm);
  }

  /** Selected pane size for the status bar ('' when nothing pane-like). */
  get selectedSizeText(): string {
    if (!this.selection) return '';
    if (this.selection.type === 'frame') {
      return `frame ${this.frameWMm} × ${this.frameHMm} mm`;
    }
    const lay = this.currentLayout();
    if (this.selection.type === 'pane') {
      const nl = lay.nodes.get(this.selection.paneId);
      if (!nl) return '';
      return `pane ${Math.round(nl.rect.wMm)} × ${Math.round(nl.rect.hMm)} mm`;
    }
    const sel = this.selection;
    const d = lay.dividers.find(
      (dv) => dv.split.id === sel.splitId && dv.index === sel.index
    );
    if (!d) return '';
    const pos = d.split.positionsMm[sel.index];
    return `${d.direction} divider @ ${Math.round(pos)} mm`;
  }

  /** Screen-reader summary of the window structure (aria-label). */
  get ariaSummary(): string {
    const d = this.displayDesign;
    const leaves = walkLeaves(d.root);
    const lay = this.currentLayout();
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
    return (
      `Window design canvas. Frame ${Math.round(d.frame.widthMm)} by ` +
      `${Math.round(d.frame.heightMm)} millimetres, ${leaves.length} pane` +
      `${leaves.length === 1 ? '' : 's'}. ${parts.join('; ')}. ` +
      'Tab selects panes, V or H splits the selected pane, arrow keys move a selected divider.'
    );
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['model'] && this.model) {
      if (!this.history || this.history.present !== this.model) {
        this.history = new DesignHistory(this.model);
        this.selection = null;
        this.drag = null;
        this.ghost = null;
        this.edit = null;
        this.render();
      }
    } else if (changes['readOnly'] || changes['frameFaceMm']) {
      this.render();
    }
  }

  ngAfterViewInit(): void {
    const host = this.canvasHostRef.nativeElement;
    this.stage = new Konva.Stage({
      container: host,
      width: Math.max(80, host.clientWidth),
      height: Math.max(80, host.clientHeight),
      listening: false,
    });
    this.layer = new Konva.Layer({ listening: false });
    this.stage.add(this.layer);

    this.resizeObserver = new ResizeObserver(() => this.onHostResize());
    this.resizeObserver.observe(host);
    this.render();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.stage?.destroy();
    this.stage = null;
    this.layer = null;
  }

  private onHostResize(): void {
    if (!this.stage) return;
    const host = this.canvasHostRef.nativeElement;
    const w = Math.max(80, host.clientWidth);
    const h = Math.max(80, host.clientHeight);
    if (w !== this.stage.width() || h !== this.stage.height()) {
      this.stage.width(w);
      this.stage.height(h);
      this.render();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */

  private currentLayout(): Layout {
    return layout(this.displayDesign, { frameFaceMm: this.frameFaceMm });
  }

  private currentView(): ViewTransform {
    const d = this.displayDesign;
    return computeView(
      this.stage?.width() ?? 700,
      this.stage?.height() ?? 600,
      d.frame.widthMm,
      d.frame.heightMm,
      this.zoom,
      this.panX,
      this.panY
    );
  }

  /** Full redraw from the (display) model. */
  render(): void {
    if (!this.layer || !this.stage || !this.history) return;
    const d = this.displayDesign;
    renderDesign(
      this.layer,
      d,
      this.currentLayout(),
      this.currentView(),
      {
        selection: this.selection,
        ghost: this.ghost,
        readout: this.readout,
        showFrameHandle: !this.readOnly,
        focused: this.focused,
      },
      {
        stageWPx: this.stage.width(),
        stageHPx: this.stage.height(),
        frameFaceMm: this.frameFaceMm,
        profileColor: this.displayDesign.frame.profileColor ?? '#ffffff',
      }
    );
    this.cdr.markForCheck();
  }

  /** Expose the Konva stage (screenshots / tests). */
  getStage(): Konva.Stage | null {
    return this.stage;
  }

  /* ------------------------------------------------------------------ */
  /* Commit / undo / redo                                                */
  /* ------------------------------------------------------------------ */

  private commit(next: WindowDesign): void {
    if (next === this.history.present) return;
    this.history.push(next);
    this.afterModelChanged();
  }

  private afterModelChanged(): void {
    this.validateSelection();
    this.modelChange.emit(this.history.present);
    this.render();
  }

  /** Drop selection that no longer resolves to a live node / divider. */
  private validateSelection(): void {
    if (!this.selection) return;
    const root = this.history.present.root;
    if (this.selection.type === 'pane') {
      const node = findNode(root, this.selection.paneId);
      if (!node || !isLeaf(node)) this.setSelection(null);
    } else if (this.selection.type === 'divider') {
      const node = findNode(root, this.selection.splitId);
      if (
        !node ||
        !isSplit(node) ||
        this.selection.index >= node.positionsMm.length
      ) {
        this.setSelection(null);
      }
    }
  }

  private setSelection(sel: CanvasSelection | null): void {
    const changed = JSON.stringify(sel) !== JSON.stringify(this.selection);
    this.selection = sel;
    if (changed) this.selectionChange.emit(sel);
  }

  undo(): void {
    if (this.history.undo()) this.afterModelChanged();
  }

  redo(): void {
    if (this.history.redo()) this.afterModelChanged();
  }

  /* ------------------------------------------------------------------ */
  /* Zoom / pan                                                          */
  /* ------------------------------------------------------------------ */

  zoomIn(): void {
    this.zoomAtCenter(1.2);
  }

  zoomOut(): void {
    this.zoomAtCenter(1 / 1.2);
  }

  fitToScreen(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.render();
  }

  private zoomAtCenter(factor: number): void {
    const w = this.stage?.width() ?? 700;
    const h = this.stage?.height() ?? 600;
    this.zoomAt(w / 2, h / 2, factor);
  }

  /** Zoom keeping the mm point under (pxX, pxY) stationary. */
  private zoomAt(pxX: number, pxY: number, factor: number): void {
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom * factor));
    if (z === this.zoom) return;
    const view = this.currentView();
    const m = mmFromPx(view, pxX, pxY);
    const d = this.displayDesign;
    const noPan = computeView(
      this.stage?.width() ?? 700,
      this.stage?.height() ?? 600,
      d.frame.widthMm,
      d.frame.heightMm,
      z,
      0,
      0
    );
    this.panX = pxX - m.xMm * noPan.pxPerMm - noPan.originX;
    this.panY = pxY - m.yMm * noPan.pxPerMm - noPan.originY;
    this.zoom = z;
    this.render();
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    const pos = this.eventPos(e);
    this.zoomAt(pos.x, pos.y, e.deltaY < 0 ? 1.1 : 1 / 1.1);
  }

  /* ------------------------------------------------------------------ */
  /* Pointer interaction                                                 */
  /* ------------------------------------------------------------------ */

  private eventPos(e: { clientX: number; clientY: number }): {
    x: number;
    y: number;
  } {
    const rect = this.canvasHostRef.nativeElement.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /** Hit tolerance in mm: ≥12 px for mouse, ≥24 px band for touch. */
  private tolMm(e: PointerEvent): number {
    const px = e.pointerType === 'touch' ? 24 : 12;
    return px / this.currentView().pxPerMm;
  }

  onPointerDown(e: PointerEvent): void {
    this.wrapperRef.nativeElement.focus({ preventScroll: true });
    const pos = this.eventPos(e);
    this.pointers.set(e.pointerId, pos);
    try {
      this.canvasHostRef.nativeElement.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events (tests) have no active pointer to capture.
    }

    if (this.pointers.size === 2) {
      // Two fingers: pinch zoom + pan; cancel any one-finger drag.
      const [a, b] = [...this.pointers.values()];
      this.pinch = {
        dist: Math.hypot(b.x - a.x, b.y - a.y),
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
      };
      this.drag = null;
      this.ghost = null;
      this.readout = null;
      this.render();
      return;
    }

    if (this.spaceHeld || e.button === 1) {
      this.drag = {
        kind: 'pan',
        startX: pos.x,
        startY: pos.y,
        panX0: this.panX,
        panY0: this.panY,
      };
      return;
    }

    const view = this.currentView();
    const mm = mmFromPx(view, pos.x, pos.y);
    const lay = this.currentLayout();
    const hit = hitTest(this.displayDesign, lay, mm, this.tolMm(e), {
      frameHandle: !this.readOnly,
    });

    if (this.armedTool && hit.kind === 'pane' && !this.readOnly) {
      this.performSplitAt(hit.paneId, this.armedTool, mm);
      this.armedTool = null;
      this.ghost = null;
      this.render();
      return;
    }

    switch (hit.kind) {
      case 'frame-handle':
        if (this.readOnly) break;
        this.drag = { kind: 'frame-handle', preview: this.history.present };
        break;
      case 'divider':
        this.setSelection({
          type: 'divider',
          splitId: hit.splitId,
          index: hit.index,
        });
        if (!this.readOnly) {
          this.drag = {
            kind: 'divider',
            splitId: hit.splitId,
            index: hit.index,
            axis: hit.axis,
            preview: this.history.present,
            moved: false,
          };
        }
        this.render();
        break;
      case 'pane':
        this.setSelection({ type: 'pane', paneId: hit.paneId });
        this.render();
        break;
      case 'frame':
        this.setSelection({ type: 'frame' });
        this.render();
        break;
      default:
        this.setSelection(null);
        this.drag = {
          kind: 'pan',
          startX: pos.x,
          startY: pos.y,
          panX0: this.panX,
          panY0: this.panY,
        };
        this.render();
        break;
    }
  }

  onPointerMove(e: PointerEvent): void {
    const pos = this.eventPos(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, pos);

    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      if (this.pinch.dist > 0 && dist > 0) {
        this.zoomAt(midX, midY, dist / this.pinch.dist);
      }
      this.panX += midX - this.pinch.midX;
      this.panY += midY - this.pinch.midY;
      this.pinch = { dist, midX, midY };
      this.render();
      return;
    }

    // Armed-tool hover ghost (no button down).
    if (!this.drag && this.armedTool && !this.readOnly) {
      this.updateGhost(this.armedTool, pos);
      this.render();
      return;
    }

    if (!this.drag) return;
    const view = this.currentView();
    const mm = mmFromPx(view, pos.x, pos.y);

    switch (this.drag.kind) {
      case 'pan':
        this.panX = this.drag.panX0 + (pos.x - this.drag.startX);
        this.panY = this.drag.panY0 + (pos.y - this.drag.startY);
        this.render();
        break;
      case 'divider': {
        const next = this.dividerPreview(
          this.drag.splitId,
          this.drag.index,
          mm
        );
        if (next) {
          this.drag.preview = next.design;
          this.drag.moved = true;
          this.readout = {
            xMm: mm.xMm,
            yMm: mm.yMm,
            text: `${Math.round(next.posMm)} mm`,
          };
          this.render();
        }
        break;
      }
      case 'frame-handle': {
        const w = Math.round(mm.xMm);
        const h = Math.round(mm.yMm);
        this.drag.preview = resizeFrame(this.history.present, w, h, {
          frameFaceMm: this.frameFaceMm,
        });
        this.readout = {
          xMm: mm.xMm,
          yMm: mm.yMm,
          text: `${Math.round(this.drag.preview.frame.widthMm)} × ${Math.round(this.drag.preview.frame.heightMm)} mm`,
        };
        this.render();
        break;
      }
      default:
        break;
    }
  }

  onPointerUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = null;
    this.readout = null;

    if (drag.kind === 'divider' && drag.moved) {
      this.commit(drag.preview);
      return;
    }
    if (drag.kind === 'frame-handle') {
      this.commit(drag.preview);
      return;
    }
    this.render();
  }

  onPointerCancel(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    this.pinch = null;
    this.drag = null;
    this.readout = null;
    this.ghost = null;
    this.render();
  }

  /* ------------------------------------------------------------------ */
  /* Divider move + snapping                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Preview of moving a divider so its centreline tracks the pointer,
   * snapped to equal-division, the 50 mm grid and sibling-divider
   * alignment (design-model snapDividerMm).
   */
  private dividerPreview(
    splitId: string,
    index: number,
    mm: { xMm: number; yMm: number }
  ): { design: WindowDesign; posMm: number } | null {
    const present = this.history.present;
    const node = findNode(present.root, splitId);
    if (!node || !isSplit(node)) return null;
    const lay = layout(present, { frameFaceMm: this.frameFaceMm });
    const nl = lay.nodes.get(splitId);
    if (!nl) return null;
    const origin = node.axis === 'x' ? nl.content.xMm : nl.content.yMm;
    const span = node.axis === 'x' ? nl.content.wMm : nl.content.hMm;
    const raw = (node.axis === 'x' ? mm.xMm : mm.yMm) - origin;
    const snapped = this.snapPosition(node, span, index, raw, lay, origin);
    return {
      design: moveDivider(present, splitId, index, snapped, {
        frameFaceMm: this.frameFaceMm,
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
      toleranceMm: 8 / this.currentView().pxPerMm + 4,
      siblingPositionsMm: siblings,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Palette: drag to split / arm / split selected                       */
  /* ------------------------------------------------------------------ */

  onPaletteDown(e: PointerEvent, tool: CanvasTool): void {
    if (this.readOnly) return;
    e.preventDefault();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events (tests) have no active pointer to capture.
    }
    const pos = this.eventPos(e);
    this.drag = {
      kind: 'palette',
      tool,
      startX: pos.x,
      startY: pos.y,
      moved: false,
    };
  }

  onPaletteMove(e: PointerEvent): void {
    if (this.drag?.kind !== 'palette') return;
    const pos = this.eventPos(e);
    if (
      Math.hypot(pos.x - this.drag.startX, pos.y - this.drag.startY) > 5
    ) {
      this.drag.moved = true;
    }
    this.updateGhost(this.drag.tool, pos);
    this.render();
  }

  onPaletteUp(e: PointerEvent): void {
    if (this.drag?.kind !== 'palette') return;
    const drag = this.drag;
    this.drag = null;
    const pos = this.eventPos(e);
    if (!drag.moved) {
      // Click (no drag): toggle armed mode — next click on a pane splits it.
      this.armedTool = this.armedTool === drag.tool ? null : drag.tool;
      this.ghost = null;
      this.render();
      return;
    }
    const view = this.currentView();
    const mm = mmFromPx(view, pos.x, pos.y);
    const hit = hitTest(this.displayDesign, this.currentLayout(), mm, 0.1);
    if (hit.kind === 'pane') {
      this.performSplitAt(hit.paneId, drag.tool, mm);
    }
    this.ghost = null;
    this.render();
  }

  private updateGhost(
    tool: CanvasTool,
    pos: { x: number; y: number }
  ): void {
    const view = this.currentView();
    const mm = mmFromPx(view, pos.x, pos.y);
    const lay = this.currentLayout();
    const hit = hitTest(this.displayDesign, lay, mm, 0.1);
    if (hit.kind !== 'pane') {
      this.ghost = null;
      return;
    }
    const nl = lay.nodes.get(hit.paneId);
    if (!nl) {
      this.ghost = null;
      return;
    }
    const axis = tool === 'split-x' ? 'x' : 'y';
    const raw =
      axis === 'x' ? mm.xMm - nl.content.xMm : mm.yMm - nl.content.yMm;
    const span = axis === 'x' ? nl.content.wMm : nl.content.hMm;
    this.ghost = {
      paneId: hit.paneId,
      axis,
      posMm: Math.min(span, Math.max(0, raw)),
    };
  }

  private performSplitAt(
    paneId: string,
    tool: CanvasTool,
    mm: { xMm: number; yMm: number }
  ): void {
    const lay = this.currentLayout();
    const nl = lay.nodes.get(paneId);
    if (!nl) return;
    const axis = tool === 'split-x' ? 'x' : 'y';
    // Whole millimetres only: a dropped divider never lands on a fraction.
    const pos = Math.round(
      axis === 'x' ? mm.xMm - nl.content.xMm : mm.yMm - nl.content.yMm
    );
    this.trySplit(paneId, axis, pos);
  }

  /** Split the selected pane at its midpoint (keyboard / dblclick path). */
  splitSelected(axis: 'x' | 'y'): void {
    if (this.readOnly) return;
    if (this.selection?.type !== 'pane') return;
    const lay = this.currentLayout();
    const nl = lay.nodes.get(this.selection.paneId);
    if (!nl) return;
    const span = axis === 'x' ? nl.content.wMm : nl.content.hMm;
    this.trySplit(this.selection.paneId, axis, span / 2);
  }

  private trySplit(paneId: string, axis: 'x' | 'y', posMm: number): void {
    try {
      const next = splitPane(this.history.present, paneId, axis, posMm, {
        frameFaceMm: this.frameFaceMm,
        dividerFaceMm: this.frameFaceMm,
      });
      this.commit(next);
      // The split reuses the pane's id for the split node; select its first
      // child leaf so the selection stays on a pane.
      const node = findNode(this.history.present.root, paneId);
      if (node && isSplit(node)) {
        const first = walkLeaves(node.children[0])[0];
        if (first) this.setSelection({ type: 'pane', paneId: first.id });
      }
    } catch {
      // Pane too small to split — leave the model untouched.
    }
  }

  /* ------------------------------------------------------------------ */
  /* Toolbar operations                                                  */
  /* ------------------------------------------------------------------ */

  equalizeSelected(): void {
    if (this.readOnly) return;
    const splitId = this.contextSplitId();
    if (!splitId) return;
    this.commit(
      equalize(this.history.present, splitId, { frameFaceMm: this.frameFaceMm })
    );
  }

  deleteSelectedDivider(): void {
    if (this.readOnly) return;
    if (this.selection?.type !== 'divider') return;
    const { splitId, index } = this.selection;
    this.commit(
      removeDivider(this.history.present, splitId, index, {
        frameFaceMm: this.frameFaceMm,
      })
    );
  }

  /** The split the current selection refers to (for equalize). */
  private contextSplitId(): string | null {
    if (!this.selection) return null;
    const root = this.history.present.root;
    if (this.selection.type === 'divider') return this.selection.splitId;
    if (this.selection.type === 'pane') {
      const parent = findParent(root, this.selection.paneId);
      return parent?.id ?? null;
    }
    return isSplit(root) ? root.id : null;
  }

  onFrameSizeInput(which: 'w' | 'h', raw: string): void {
    if (this.readOnly) return;
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    const d = this.history.present;
    const next = resizeFrame(
      d,
      which === 'w' ? v : d.frame.widthMm,
      which === 'h' ? v : d.frame.heightMm,
      { frameFaceMm: this.frameFaceMm }
    );
    this.commit(next);
  }

  /* ------------------------------------------------------------------ */
  /* Double-click → typed exact mm                                       */
  /* ------------------------------------------------------------------ */

  onDblClick(e: MouseEvent): void {
    if (this.readOnly) return;
    const pos = this.eventPos(e);
    const view = this.currentView();
    const mm = mmFromPx(view, pos.x, pos.y);
    const lay = this.currentLayout();
    const hit = hitTest(this.displayDesign, lay, mm, 12 / view.pxPerMm, {
      frameHandle: false,
    });
    if (hit.kind === 'divider') {
      this.openDividerEditor(hit.splitId, hit.index, pos);
      return;
    }
    if (hit.kind === 'pane') {
      this.openPaneSizeEditor(hit.paneId, pos);
      return;
    }
    // Below the frame = overall width dimension; left of it = height.
    const d = this.displayDesign;
    if (mm.yMm > d.frame.heightMm && mm.xMm > -60 / view.pxPerMm) {
      this.openFrameEditor('frame-w', pos);
    } else if (mm.xMm < 0) {
      this.openFrameEditor('frame-h', pos);
    }
  }

  private openPaneSizeEditor(
    paneId: string,
    pos: { x: number; y: number }
  ): void {
    const present = this.history.present;
    const parent = findParent(present.root, paneId);
    if (!parent) {
      // Un-split root pane: typing its size = typing the frame size.
      this.openFrameEditor('frame-w', pos);
      return;
    }
    const lay = this.currentLayout();
    const nl = lay.nodes.get(paneId);
    if (!nl) return;
    const sizeMm =
      parent.axis === 'x' ? Math.round(nl.rect.wMm) : Math.round(nl.rect.hMm);
    this.edit = {
      kind: 'pane-size',
      paneId,
      value: String(sizeMm),
      leftPx: pos.x,
      topPx: pos.y,
      label:
        parent.axis === 'x' ? 'Pane width (mm)' : 'Pane height (mm)',
    };
    this.focusEditSoon();
  }

  private openDividerEditor(
    splitId: string,
    index: number,
    pos: { x: number; y: number }
  ): void {
    const node = findNode(this.history.present.root, splitId);
    if (!node || !isSplit(node)) return;
    this.edit = {
      kind: 'divider',
      splitId,
      index,
      value: String(Math.round(node.positionsMm[index])),
      leftPx: pos.x,
      topPx: pos.y,
      label: 'Divider position (mm)',
    };
    this.focusEditSoon();
  }

  private openFrameEditor(
    kind: 'frame-w' | 'frame-h',
    pos: { x: number; y: number }
  ): void {
    const d = this.history.present;
    this.edit = {
      kind,
      value: String(
        Math.round(kind === 'frame-w' ? d.frame.widthMm : d.frame.heightMm)
      ),
      leftPx: pos.x,
      topPx: pos.y,
      label: kind === 'frame-w' ? 'Frame width (mm)' : 'Frame height (mm)',
    };
    this.focusEditSoon();
  }

  private focusEditSoon(): void {
    this.cdr.markForCheck();
    setTimeout(() => {
      this.editInputRef?.nativeElement.focus();
      this.editInputRef?.nativeElement.select();
    });
  }

  commitEdit(): void {
    const edit = this.edit;
    if (!edit) return;
    this.edit = null;
    const v = Number(edit.value);
    if (!Number.isFinite(v) || v <= 0) {
      this.render();
      return;
    }
    const present = this.history.present;
    try {
      switch (edit.kind) {
        case 'pane-size':
          // Typed exact pane mm: moves the adjacent divider AND locks it.
          this.commit(
            setPaneSizeMm(present, edit.paneId as string, v, {
              frameFaceMm: this.frameFaceMm,
            })
          );
          break;
        case 'divider':
          this.commit(
            setDividerMm(
              present,
              edit.splitId as string,
              edit.index as number,
              v,
              { frameFaceMm: this.frameFaceMm }
            )
          );
          break;
        case 'frame-w':
          this.commit(
            resizeFrame(present, v, present.frame.heightMm, {
              frameFaceMm: this.frameFaceMm,
            })
          );
          break;
        case 'frame-h':
          this.commit(
            resizeFrame(present, present.frame.widthMm, v, {
              frameFaceMm: this.frameFaceMm,
            })
          );
          break;
      }
    } catch {
      this.render();
    }
    this.wrapperRef.nativeElement.focus({ preventScroll: true });
  }

  cancelEdit(): void {
    this.edit = null;
    this.render();
    this.wrapperRef.nativeElement.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------------ */
  /* Keyboard                                                            */
  /* ------------------------------------------------------------------ */

  onKeydown(e: KeyboardEvent): void {
    if (this.edit) return; // the inline editor handles its own keys

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (this.readOnly) return;
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      if (!this.readOnly) this.redo();
      return;
    }

    switch (e.key) {
      case 'Tab':
        e.preventDefault();
        this.cyclePane(e.shiftKey ? -1 : 1);
        return;
      case 'Escape':
        this.armedTool = null;
        this.ghost = null;
        this.setSelection(null);
        this.render();
        return;
      case ' ':
        this.spaceHeld = true;
        e.preventDefault();
        return;
      case '+':
      case '=':
        this.zoomIn();
        return;
      case '-':
        this.zoomOut();
        return;
      case '0':
        this.fitToScreen();
        return;
      default:
        break;
    }

    if (this.readOnly) return;

    switch (e.key) {
      case 'v':
      case 'V':
        this.splitSelected('x');
        return;
      case 'h':
      case 'H':
        this.splitSelected('y');
        return;
      case 'e':
      case 'E':
        this.equalizeSelected();
        return;
      case 'Delete':
      case 'Backspace':
        this.deleteSelectedDivider();
        return;
      case 'ArrowLeft':
        this.nudgeDivider('x', -(e.shiftKey ? NUDGE_BIG_MM : NUDGE_MM), e);
        return;
      case 'ArrowRight':
        this.nudgeDivider('x', e.shiftKey ? NUDGE_BIG_MM : NUDGE_MM, e);
        return;
      case 'ArrowUp':
        this.nudgeDivider('y', -(e.shiftKey ? NUDGE_BIG_MM : NUDGE_MM), e);
        return;
      case 'ArrowDown':
        this.nudgeDivider('y', e.shiftKey ? NUDGE_BIG_MM : NUDGE_MM, e);
        return;
      default:
        return;
    }
  }

  onKeyup(e: KeyboardEvent): void {
    if (e.key === ' ') this.spaceHeld = false;
  }

  onFocus(): void {
    this.focused = true;
    this.render();
  }

  onBlur(): void {
    this.focused = false;
    this.spaceHeld = false;
    this.render();
  }

  /** Move the selected divider by `deltaMm` (keyboard 1 mm / 10 mm path). */
  private nudgeDivider(
    axis: 'x' | 'y',
    deltaMm: number,
    e: KeyboardEvent
  ): void {
    if (this.selection?.type !== 'divider') return;
    const node = findNode(this.history.present.root, this.selection.splitId);
    if (!node || !isSplit(node) || node.axis !== axis) return;
    e.preventDefault();
    const pos = node.positionsMm[this.selection.index] + deltaMm;
    this.commit(
      moveDivider(
        this.history.present,
        this.selection.splitId,
        this.selection.index,
        pos,
        { frameFaceMm: this.frameFaceMm }
      )
    );
  }

  /** Tab / Shift+Tab pane cycling. */
  private cyclePane(step: 1 | -1): void {
    const leaves = walkLeaves(this.history.present.root);
    if (!leaves.length) return;
    let idx = -1;
    if (this.selection?.type === 'pane') {
      const sel = this.selection;
      idx = leaves.findIndex((l) => l.id === sel.paneId);
    }
    const next =
      ((idx + step) % leaves.length + leaves.length) % leaves.length;
    this.setSelection({ type: 'pane', paneId: leaves[next].id });
    this.render();
  }

  /** Programmatic pane selection (host pages / tests). */
  selectPane(paneId: string | null): void {
    this.setSelection(paneId ? { type: 'pane', paneId } : null);
    this.render();
  }

  armTool(tool: CanvasTool | null): void {
    this.armedTool = tool;
    this.ghost = null;
    this.render();
  }

  /** Frame clamps for the template's typed inputs. */
  readonly frameMinMm = FRAME_MIN_MM;
  readonly frameMaxMm = FRAME_MAX_MM;
}
