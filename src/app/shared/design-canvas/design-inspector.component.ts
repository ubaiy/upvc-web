/**
 * DesignInspectorComponent — the property panel that goes beside the
 * canvas. It edits what cannot be dragged: frame shape and its parameters,
 * glass and glazing bars, the selected pane's type (fixed / openable /
 * sliding), opening direction, the sliding set-up (tracks, panels, fly
 * mesh, per-panel direction / fixed / width) and the door (leaves, hinge
 * side, swing, threshold, side and top lights).
 *
 * It never mutates: every edit builds a NEW WindowDesign with the
 * design-model operations, checks the invariants and emits it through
 * (designChange). The host passes that to `canvas.apply(next)` so the edit
 * joins the canvas undo stack.
 */

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DEFAULT_FRAME_FACE_MM,
  FrameShapeKind,
  Id,
  LeafNode,
  MESH_TRACKS,
  ThresholdType,
  TrackType,
  TriangleShape,
  WindowDesign,
  addDoorSideLight,
  addDoorTopLight,
  allowedPanelCounts,
  checkInvariants,
  findNode,
  isLeaf,
  makeDoor,
  setDoorSpec,
  setFrameShape,
  setFrameSpec,
  setGlazing,
  setLeafSpec,
  setSlideMesh,
  setSlidePanel,
  setSlidePanelCount,
  setSlidePanelWidthMm,
  setSlideTracks,
} from '../design-model';
import { CanvasSelection } from './canvas-view';
import {
  PaneKind,
  leafWidthMm,
  paneKindOf,
  setArchRise,
  setOpeningDirection,
  setPaneKind,
  setShapeKind,
  setTrapezoidHeights,
} from './design-edit-ops';

export interface GlassOption {
  id: Id;
  label: string;
}

export interface ColorOption {
  label: string;
  hex: string;
}

@Component({
  selector: 'app-design-inspector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './design-inspector.component.html',
  styleUrls: ['./design-inspector.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesignInspectorComponent {
  /** The latest document (what the canvas last emitted). */
  @Input() design!: WindowDesign;
  @Input() selection: CanvasSelection | null = null;
  @Input() frameFaceMm = DEFAULT_FRAME_FACE_MM;
  @Input() glassOptions: GlassOption[] = [];
  @Input() colorOptions: ColorOption[] = [];
  @Input() readOnly = false;
  /** Which groups to draw: everything, the window-level ones, or the selected pane's. */
  @Input() show: 'all' | 'window' | 'pane' = 'all';
  /** Track types on offer (the host limits them to what its catalogue prices). */
  @Input() trackOptions: TrackType[] = ['2 Track', '2.5 Track', '3 Track', '4 Track'];
  /**
   * Hardware of the selected pane. These are master-data ids, so the host
   * supplies the lists for that pane; an empty list hides the field.
   */
  @Input() handleOptions: GlassOption[] = [];
  @Input() hingeOptions: string[] = [];
  @Input() sashOptions: GlassOption[] = [];
  /** The edited document; pass it to `canvas.apply(next)`. */
  @Output() designChange = new EventEmitter<WindowDesign>();

  /** Why the last edit was refused ('' when it went through). */
  problem = '';

  readonly shapeKinds: { kind: FrameShapeKind; label: string }[] = [
    { kind: 'rect', label: 'Rectangle' },
    { kind: 'arch-top', label: 'Arch top' },
    { kind: 'circle', label: 'Circle' },
    { kind: 'triangle', label: 'Triangle' },
    { kind: 'trapezoid', label: 'Trapezoid' },
  ];
  readonly paneKinds: { kind: PaneKind; label: string }[] = [
    { kind: 'fixed', label: 'Fixed glass' },
    { kind: 'openable', label: 'Openable casement' },
    { kind: 'sliding', label: 'Sliding' },
  ];
  readonly directions = [
    'Left',
    'Right',
    'Top',
    'Bottom',
    'Tilt & Turn Left',
    'Tilt & Turn Right',
  ];
  /** The offered tracks, plus the pane's own if the catalogue no longer lists it. */
  get trackTypes(): TrackType[] {
    const own = this.leaf?.slide?.tracks;
    return own && !this.trackOptions.includes(own)
      ? [...this.trackOptions, own]
      : this.trackOptions;
  }
  readonly thresholds: ThresholdType[] = ['Standard', 'Low', 'None'];
  readonly apexes: TriangleShape['apex'][] = ['isosceles', 'left', 'right'];

  private get opts(): { frameFaceMm: number } {
    return { frameFaceMm: this.frameFaceMm };
  }

  /** The selected leaf, or null. */
  get leaf(): LeafNode | null {
    if (this.selection?.type !== 'pane') return null;
    const node = findNode(this.design.root, this.selection.paneId);
    return node && isLeaf(node) ? node : null;
  }

  get paneKind(): PaneKind | null {
    return this.leaf ? paneKindOf(this.leaf) : null;
  }

  get selectedPanel(): number | null {
    return this.selection?.type === 'pane' && this.selection.panelIndex !== undefined
      ? this.selection.panelIndex
      : null;
  }

  get panelCounts(): number[] {
    return this.leaf?.slide ? allowedPanelCounts(this.leaf.slide.tracks) : [];
  }

  get meshAllowed(): boolean {
    return !!this.leaf?.slide && MESH_TRACKS.includes(this.leaf.slide.tracks);
  }

  round(v: number): number {
    return Math.round(v);
  }

  /** Run one edit; refuse it (with a reason) if it throws or breaks an invariant. */
  private run(edit: (d: WindowDesign) => WindowDesign): void {
    if (this.readOnly) return;
    try {
      const next = edit(this.design);
      const problems = checkInvariants(next, this.opts);
      if (problems.length) {
        this.problem = problems[0];
        return;
      }
      this.problem = '';
      if (next !== this.design) this.designChange.emit(next);
    } catch (err) {
      this.problem = err instanceof Error ? err.message : String(err);
    }
  }

  /* ---------------- frame ---------------- */

  onShapeKind(kind: FrameShapeKind): void {
    this.run((d) => setShapeKind(d, kind, this.opts));
  }

  onRise(raw: string): void {
    this.run((d) => setArchRise(d, Number(raw), this.opts));
  }

  onApex(apex: TriangleShape['apex']): void {
    this.run((d) => setFrameShape(d, { kind: 'triangle', apex }, this.opts));
  }

  onTrapezoid(side: 'left' | 'right', raw: string): void {
    this.run((d) => {
      const s = d.frame.shape;
      if (s.kind !== 'trapezoid') return d;
      const v = Number(raw);
      return setTrapezoidHeights(
        d,
        side === 'left' ? v : s.leftHeightMm,
        side === 'right' ? v : s.rightHeightMm,
        this.opts
      );
    });
  }

  onGlass(raw: string): void {
    const match = this.glassOptions.find((g) => String(g.id) === raw);
    this.run((d) => setGlazing(d, { glassId: match ? match.id : null }));
  }

  onBars(which: 'barsV' | 'barsH', raw: string): void {
    const n = Math.min(6, Math.max(0, Math.round(Number(raw) || 0)));
    this.run((d) => setGlazing(d, { [which]: n }));
  }

  onColor(hex: string): void {
    this.run((d) => setFrameSpec(d, { profileColor: hex || null }));
  }

  /* ---------------- selected pane ---------------- */

  onPaneKind(kind: PaneKind): void {
    const id = this.leaf?.id;
    if (id) this.run((d) => setPaneKind(d, id, kind, this.opts));
  }

  onDirection(direction: string): void {
    const id = this.leaf?.id;
    if (id) this.run((d) => setOpeningDirection(d, id, direction));
  }

  onHandle(raw: string): void {
    const leaf = this.leaf;
    const match = this.handleOptions.find((h) => String(h.id) === raw);
    if (!leaf?.opening || !match) return;
    const opening = { ...leaf.opening, handleId: match.id };
    this.run((d) => setLeafSpec(d, leaf.id, { opening }));
  }

  onHinges(hingesType: string): void {
    const leaf = this.leaf;
    if (!leaf?.opening) return;
    const opening = { ...leaf.opening, hingesType };
    this.run((d) => setLeafSpec(d, leaf.id, { opening }));
  }

  onSash(raw: string): void {
    const id = this.leaf?.id;
    const match = this.sashOptions.find((s) => String(s.id) === raw);
    if (id && match) this.run((d) => setLeafSpec(d, id, { sashId: match.id }));
  }

  onTracks(tracks: TrackType): void {
    const id = this.leaf?.id;
    if (id) {
      this.run((d) => setSlideTracks(d, id, tracks, leafWidthMm(d, id, this.opts)));
    }
  }

  onPanelCount(raw: string): void {
    const id = this.leaf?.id;
    if (id) {
      this.run((d) =>
        setSlidePanelCount(d, id, Number(raw), leafWidthMm(d, id, this.opts))
      );
    }
  }

  onMesh(on: boolean): void {
    const id = this.leaf?.id;
    if (id) this.run((d) => setSlideMesh(d, id, on));
  }

  onMeshPosition(position: 'Left' | 'Right'): void {
    const id = this.leaf?.id;
    if (id) this.run((d) => setSlideMesh(d, id, true, position));
  }

  onPanelDirection(index: number, direction: 'Left' | 'Right'): void {
    const id = this.leaf?.id;
    if (id) this.run((d) => setSlidePanel(d, id, index, { direction }));
  }

  onPanelFixed(index: number, fixed: boolean): void {
    const id = this.leaf?.id;
    if (id) this.run((d) => setSlidePanel(d, id, index, { fixed }));
  }

  onPanelWidth(index: number, raw: string): void {
    const id = this.leaf?.id;
    if (id) this.run((d) => setSlidePanelWidthMm(d, id, index, Number(raw)));
  }

  /* ---------------- door ---------------- */

  onMakeDoor(leaves: 1 | 2): void {
    const id = this.leaf?.id;
    if (!id) {
      this.problem = 'Select the pane that becomes the door first.';
      return;
    }
    this.run((d) =>
      makeDoor(d, id, { leaves, swing: 'In', threshold: 'Standard', ...this.opts })
    );
  }

  onDoorSide(openingSide: 'Left' | 'Right'): void {
    this.run((d) => setDoorSpec(d, { openingSide }));
  }

  onDoorSwing(swing: 'In' | 'Out'): void {
    this.run((d) => setDoorSpec(d, { swing }));
  }

  onThreshold(threshold: ThresholdType): void {
    this.run((d) => setDoorSpec(d, { threshold }));
  }

  onSideLight(side: 'left' | 'right'): void {
    this.run((d) =>
      addDoorSideLight(d, side, 400, { ...this.opts, dividerFaceMm: this.frameFaceMm })
    );
  }

  onTopLight(): void {
    this.run((d) =>
      addDoorTopLight(d, 300, { ...this.opts, dividerFaceMm: this.frameFaceMm })
    );
  }

  /** Back to a window: the door leaves stay as openable casements. */
  onRemoveDoor(): void {
    this.run((d) => {
      const next: WindowDesign = { ...d, productType: 'Window' };
      delete next.door;
      return next;
    });
  }
}
