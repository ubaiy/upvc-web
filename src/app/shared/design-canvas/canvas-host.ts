/**
 * design-canvas — the contract between DesignCanvasComponent (the host) and
 * its interaction controllers (pointer, inline editor, keyboard). The
 * component owns the state; controllers read and write it through this
 * interface so each stays a small, separately readable file.
 */

import { Layout, WindowDesign } from '../design-model';
import { RenderGhost, RenderReadout } from './canvas-renderer';
import {
  CanvasSelection,
  CanvasTool,
  FrameCorner,
  PointMm,
  ViewTransform,
} from './canvas-view';

export type DragState =
  | {
      kind: 'divider';
      splitId: string;
      index: number;
      axis: 'x' | 'y';
      preview: WindowDesign;
      moved: boolean;
    }
  | {
      kind: 'frame-handle';
      corner: FrameCorner;
      /** View and frame size when the drag started (the drag's fixed frame of reference). */
      view0: ViewTransform;
      w0Mm: number;
      h0Mm: number;
      preview: WindowDesign;
    }
  | {
      kind: 'bar';
      paneId: string;
      panelIndex?: number;
      index: number;
      axis: 'x' | 'y';
      preview: WindowDesign;
      moved: boolean;
    }
  | { kind: 'palette'; tool: CanvasTool; startX: number; startY: number; moved: boolean }
  | { kind: 'pan'; startX: number; startY: number; panX0: number; panY0: number };

export type EditKind =
  | 'pane-size'
  | 'frame-w'
  | 'frame-h'
  | 'divider'
  | 'panel-width'
  | 'shape-rise'
  | 'shape-left-h'
  | 'shape-right-h';

export interface EditState {
  kind: EditKind;
  paneId?: string;
  splitId?: string;
  index?: number;
  value: string;
  leftPx: number;
  topPx: number;
  label: string;
}

export interface PosPx {
  x: number;
  y: number;
}

export interface CanvasHost {
  readonly readOnly: boolean;
  readonly frameFaceMm: number;
  /** The committed present document. */
  readonly design: WindowDesign;
  /** The document being displayed (a drag preview wins while dragging). */
  readonly displayDesign: WindowDesign;

  zoom: number;
  panX: number;
  panY: number;
  selection: CanvasSelection | null;
  armedTool: CanvasTool | null;
  edit: EditState | null;
  drag: DragState | null;
  ghost: RenderGhost | null;
  readout: RenderReadout | null;
  spaceHeld: boolean;

  currentLayout(): Layout;
  currentView(): ViewTransform;
  render(): void;
  commit(next: WindowDesign): void;
  setSelection(sel: CanvasSelection | null): void;
  eventPos(e: { clientX: number; clientY: number }): PosPx;
  zoomAt(pxX: number, pxY: number, factor: number): void;
  focusCanvas(): void;
  focusEditSoon(): void;
  trySplit(paneId: string, axis: 'x' | 'y', posMm: number): void;
  /** Divide what a split tool targets at `p` (a palla, or the pane when `whole`). */
  splitAt(paneId: string, axis: 'x' | 'y', p: PointMm, whole: boolean): void;

  undo(): void;
  redo(): void;
  zoomIn(): void;
  zoomOut(): void;
  fitToScreen(): void;
  splitSelected(axis: 'x' | 'y'): boolean;
  equalizeSelected(): void;
  deleteSelectedDivider(): void;
}

export const GRID_MM = 50;
export const NUDGE_MM = 1;
export const NUDGE_BIG_MM = 10;
