/**
 * DesignCanvasComponent — the interactive window-design canvas.
 *
 * A standalone component: input = WindowDesign (the canonical model from
 * src/app/shared/design-model), output = (modelChange)/(selectionChange).
 * Pure render-from-model (canvas-renderer.ts); every interaction routes
 * through the design-model's pure operations and lands in a DesignHistory
 * undo stack. All pointer math goes through canvas-view.ts, so hits and
 * pixels always agree with the drawing.
 *
 * This file owns the state, the history and the public API. The
 * interactions live in small controllers that work through CanvasHost:
 *   canvas-pointer.ts   select, drag divider / corner handle, palette, touch
 *   canvas-editor.ts    double-click → type exact mm
 *   canvas-keyboard.ts  shortcuts, status / aria text
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
  WindowDesign,
  layout,
} from '../design-model';
import * as cmd from './canvas-commands';
import { EditController } from './canvas-editor';
import { CanvasHost, DragState, EditState, PosPx } from './canvas-host';
import { ariaSummary, handleKeydown, selectionText } from './canvas-keyboard';
import { PointerController } from './canvas-pointer';
import {
  GlassTints,
  RenderGhost,
  RenderReadout,
  glassTintFor,
  renderDesign,
} from './canvas-renderer';
import {
  CanvasSelection,
  CanvasTool,
  ViewFrom,
  ViewTransform,
  ZOOM_MAX,
  ZOOM_MIN,
  anchoredView,
  computeView,
  mmFromPx,
} from './canvas-view';

@Component({
  selector: 'app-design-canvas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './design-canvas.component.html',
  styleUrls: ['./design-canvas.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesignCanvasComponent
  implements AfterViewInit, OnChanges, OnDestroy, CanvasHost
{
  /** The canonical design document. The component NEVER mutates it. */
  @Input() model!: WindowDesign;
  /** Read-only mode: select / zoom / pan only, no mutations. */
  @Input() readOnly = false;
  /** Outer frame profile face width (mm). */
  @Input() frameFaceMm = DEFAULT_FRAME_FACE_MM;
  /**
   * Side the elevation is drawn from. The model stores sides as seen from
   * outside; 'inside' mirrors the drawing (the model is untouched).
   */
  @Input() viewFrom: ViewFrom = 'outside';
  /** Glass colour per glass id (from the host's glass master data). */
  @Input() glassTints: GlassTints | null = null;
  /** Emits the NEW document after every committed change (incl. undo/redo). */
  @Output() modelChange = new EventEmitter<WindowDesign>();
  /** Emits whenever the selection changes. */
  @Output() selectionChange = new EventEmitter<CanvasSelection | null>();

  @ViewChild('wrapper', { static: true }) wrapperRef!: ElementRef<HTMLElement>;
  @ViewChild('canvasHost', { static: true })
  canvasHostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('editInput') editInputRef?: ElementRef<HTMLInputElement>;

  // --- view / interaction state (shared with the controllers) -----------
  zoom = 1;
  panX = 0;
  panY = 0;
  selection: CanvasSelection | null = null;
  armedTool: CanvasTool | null = null;
  edit: EditState | null = null;
  focused = false;
  drag: DragState | null = null;
  ghost: RenderGhost | null = null;
  readout: RenderReadout | null = null;
  spaceHeld = false;

  /** Frame clamps for the template's typed inputs. */
  readonly frameMinMm = FRAME_MIN_MM;
  readonly frameMaxMm = FRAME_MAX_MM;

  private history!: DesignHistory;
  private stage: Konva.Stage | null = null;
  private layer: Konva.Layer | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly pointer = new PointerController(
    this,
    () => this.canvasHostRef.nativeElement
  );
  private readonly editor = new EditController(this);

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
    return selectionText(this.displayDesign, this.currentLayout(), this.selection);
  }

  /** Screen-reader summary of the window structure (aria-label). */
  get ariaSummary(): string {
    return ariaSummary(this.displayDesign, this.currentLayout());
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
        return;
      }
    }
    if (
      changes['readOnly'] ||
      changes['frameFaceMm'] ||
      changes['viewFrom'] ||
      changes['glassTints']
    ) {
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

  currentLayout(): Layout {
    return layout(this.displayDesign, { frameFaceMm: this.frameFaceMm });
  }

  private viewFor(wMm: number, hMm: number, zoom: number, panX: number, panY: number): ViewTransform {
    return computeView(
      this.stage?.width() ?? 700,
      this.stage?.height() ?? 600,
      wMm,
      hMm,
      zoom,
      panX,
      panY,
      this.viewFrom === 'inside'
    );
  }

  currentView(): ViewTransform {
    const f = this.displayDesign.frame;
    if (this.drag?.kind === 'frame-handle') {
      // Resizing: keep the scale and pin the opposite corner on screen.
      const d = this.drag;
      return anchoredView(d.view0, d.corner, d.w0Mm, d.h0Mm, f.widthMm, f.heightMm);
    }
    return this.viewFor(f.widthMm, f.heightMm, this.zoom, this.panX, this.panY);
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
        profileColor: d.frame.profileColor ?? '#ffffff',
        glassTint: glassTintFor(d.glazing.glassId, this.glassTints),
        viewFrom: this.viewFrom,
      }
    );
    this.cdr.markForCheck();
  }

  /** Expose the Konva stage (screenshots / thumbnails / tests). */
  getStage(): Konva.Stage | null {
    return this.stage;
  }

  /* ------------------------------------------------------------------ */
  /* Commit / undo / redo                                                */
  /* ------------------------------------------------------------------ */

  commit(next: WindowDesign): void {
    if (next === this.history.present) return;
    this.history.push(next);
    this.afterModelChanged();
  }

  /**
   * Apply a document the HOST produced (a side-panel edit made with the
   * design-model operations on the latest emitted model). It becomes one
   * step on this canvas's undo stack and is emitted through (modelChange)
   * like any canvas edit. Selection is kept when it still resolves.
   */
  apply(next: WindowDesign): void {
    this.drag = null;
    this.ghost = null;
    this.readout = null;
    this.edit = null;
    this.commit(next);
  }

  private afterModelChanged(): void {
    // Drop / trim a selection that no longer resolves to a live node.
    this.setSelection(cmd.resolveSelection(this.history.present, this.selection));
    this.modelChange.emit(this.history.present);
    this.render();
  }

  setSelection(sel: CanvasSelection | null): void {
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
  zoomAt(pxX: number, pxY: number, factor: number): void {
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom * factor));
    if (z === this.zoom) return;
    const m = mmFromPx(this.currentView(), pxX, pxY);
    const f = this.displayDesign.frame;
    const noPan = this.viewFor(f.widthMm, f.heightMm, z, 0, 0);
    const x = noPan.mirrorWMm === undefined ? m.xMm : noPan.mirrorWMm - m.xMm;
    this.panX = pxX - x * noPan.pxPerMm - noPan.originX;
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
  /* DOM events → controllers                                            */
  /* ------------------------------------------------------------------ */

  eventPos(e: { clientX: number; clientY: number }): PosPx {
    const rect = this.canvasHostRef.nativeElement.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  focusCanvas(): void {
    this.wrapperRef.nativeElement.focus({ preventScroll: true });
  }

  focusEditSoon(): void {
    this.cdr.markForCheck();
    setTimeout(() => {
      this.editInputRef?.nativeElement.focus();
      this.editInputRef?.nativeElement.select();
    });
  }

  onPointerDown(e: PointerEvent): void {
    this.pointer.down(e);
  }

  onPointerMove(e: PointerEvent): void {
    this.pointer.move(e);
  }

  onPointerUp(e: PointerEvent): void {
    this.pointer.up(e);
  }

  onPointerCancel(e: PointerEvent): void {
    this.pointer.cancel(e);
  }

  onPaletteDown(e: PointerEvent, tool: CanvasTool): void {
    this.pointer.paletteDown(e, tool);
  }

  onPaletteMove(e: PointerEvent): void {
    this.pointer.paletteMove(e);
  }

  onPaletteUp(e: PointerEvent): void {
    this.pointer.paletteUp(e);
  }

  onDblClick(e: MouseEvent): void {
    this.editor.dblClick(e);
  }

  commitEdit(): void {
    this.editor.commit();
  }

  cancelEdit(): void {
    this.editor.cancel();
  }

  onKeydown(e: KeyboardEvent): void {
    handleKeydown(this, e);
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

  /* ------------------------------------------------------------------ */
  /* Commands (canvas-commands.ts)                                       */
  /* ------------------------------------------------------------------ */

  splitSelected(axis: 'x' | 'y'): void {
    cmd.splitSelected(this, axis);
  }

  trySplit(paneId: string, axis: 'x' | 'y', posMm: number): void {
    cmd.trySplit(this, paneId, axis, posMm);
  }

  equalizeSelected(): void {
    cmd.equalizeSelected(this);
  }

  deleteSelectedDivider(): void {
    cmd.deleteSelectedDivider(this);
  }

  onFrameSizeInput(which: 'w' | 'h', raw: string): void {
    cmd.setFrameSize(this, which, raw);
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
}
