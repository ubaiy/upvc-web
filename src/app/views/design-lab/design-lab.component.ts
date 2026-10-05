/**
 * Design Lab — dev-only playground for the standalone design canvas (route
 * /design-lab, enabled by `environment.designLab`). Hosts the canvas with
 * the inspector panel, a template picker (built-in presets plus saved
 * templates) and the live WindowDesign JSON and toPayload() output, so the
 * owner and the integration agent can try every window type without
 * touching the quotation screen.
 *
 * It is also the reference for how a host wires the pieces together:
 * canvas (modelChange) → keep the latest document; inspector
 * (designChange) → canvas.apply(next), so panel edits share the canvas
 * undo stack.
 */

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ComponentRef,
  OnDestroy,
  OnInit,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DesignTemplate,
  WindowDesign,
  createTemplate,
  fromTemplateRow,
  instantiateTemplate,
  serialize,
  toPayload,
  toTemplateRequest,
} from 'src/app/shared/design-model';
import { DesignCanvasComponent } from 'src/app/shared/design-canvas/design-canvas.component';
import { DesignInspectorComponent } from 'src/app/shared/design-canvas/design-inspector.component';
import { CanvasSelection, ViewFrom } from 'src/app/shared/design-canvas/canvas-view';
// Type only: the 3D view (and three.js with it) is loaded when the 3D button is pressed.
import type { Design3dComponent } from 'src/app/shared/design-3d/design-3d.component';
import { DesignTemplateStore } from './design-template-store.service';
import {
  LAB_COLORS,
  LAB_GLASS,
  LAB_GLASS_TINTS,
  LAB_PRESETS,
  LabPreset,
  PRESET_GROUPS,
  PresetGroup,
} from './lab-presets';

interface SavedTemplate {
  id: number;
  template: DesignTemplate;
  sizeText: string;
}

@Component({
  selector: 'app-design-lab',
  standalone: true,
  imports: [CommonModule, FormsModule, DesignCanvasComponent, DesignInspectorComponent],
  templateUrl: './design-lab.component.html',
  styleUrls: ['./design-lab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesignLabComponent implements OnInit, OnDestroy {
  @ViewChild(DesignCanvasComponent) canvas?: DesignCanvasComponent;
  @ViewChild('view3d', { read: ViewContainerRef, static: true }) view3dHost?: ViewContainerRef;

  // --- 3D prototype (super system P0): lives only in this lab ------------
  show3d = false;
  loading3d = false;
  view3dNote = '';
  /** Throwaway corner demo of the prototype (roadmap P0, item 5). */
  corner3d = false;
  /** Result of "Measure": frames per second while the window turns once (for the phone test of the log). */
  measure3d = '';
  private view3d: ComponentRef<Design3dComponent> | null = null;

  readonly groups = PRESET_GROUPS;
  readonly glassOptions = LAB_GLASS;
  readonly glassTints = LAB_GLASS_TINTS;
  readonly colorOptions = LAB_COLORS;

  activePreset = LAB_PRESETS[0].key;
  readOnly = false;
  viewFrom: ViewFrom = 'outside';
  sidePanel: 'props' | 'model' | 'payload' = 'props';

  /** Bound to the canvas; a NEW object here resets the canvas history. */
  model: WindowDesign = LAB_PRESETS[0].build();
  /** The latest document the canvas emitted (what the inspector edits). */
  current: WindowDesign = this.model;
  selection: CanvasSelection | null = null;

  modelJson = '';
  payloadJson = '';
  payloadOk = true;

  // --- templates ---------------------------------------------------------
  saved: SavedTemplate[] = [];
  templateName = '';
  templateTags = '';
  preserveLocks = false;
  /** Optional size to place a template at; blank = its own size. */
  placeW = '';
  placeH = '';
  templateMessage = '';

  constructor(
    private readonly store: DesignTemplateStore,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.refreshJson(this.model);
  }

  get storeMode(): 'api' | 'local' {
    return this.store.mode;
  }

  ngOnInit(): void {
    void this.reloadTemplates();
  }

  ngOnDestroy(): void {
    this.close3d();
  }

  /* ------------------------------------------------------------------ */
  /* 3D view, loaded on demand                                           */
  /* ------------------------------------------------------------------ */

  async toggle3d(): Promise<void> {
    if (this.show3d) {
      this.close3d();
      return;
    }
    const startedAt = performance.now();
    this.show3d = true;
    this.loading3d = true;
    this.view3dNote = '';
    try {
      const { Design3dComponent } = await import('src/app/shared/design-3d/design-3d.component');
      if (this.show3d && this.view3dHost && !this.view3d) {
        const ref = this.view3dHost.createComponent(Design3dComponent);
        ref.setInput('startedAt', startedAt);
        ref.setInput('cornerDemo', this.corner3d);
        this.view3d = ref;
        this.sync3d(this.current);
        // Handle for the measuring script of the prototype log (dev lab only).
        (window as unknown as { labView3d?: Design3dComponent }).labView3d = ref.instance;
      }
    } catch (err) {
      this.show3d = false;
      this.view3dNote = `3D could not be loaded: ${this.text(err)}`;
    }
    this.loading3d = false;
    this.cdr.markForCheck();
  }

  setCorner3d(on: boolean): void {
    this.corner3d = on;
    this.view3d?.setInput('cornerDemo', on);
  }

  /** Turn the window once and say how fast it drew: the figure the go / no-go needs from a real phone. */
  async measure3dTurn(): Promise<void> {
    const view = this.view3d?.instance;
    if (!view) return;
    this.measure3d = 'measuring…';
    const r = await view.benchmark(180);
    this.measure3d = r
      ? `${r.fps.toFixed(0)} frames a second (mean ${r.meanFrameMs.toFixed(1)} ms, worst ${r.worstFrameMs.toFixed(0)} ms)`
      : '';
    this.cdr.markForCheck();
  }

  private close3d(): void {
    this.measure3d = '';
    this.view3d?.destroy();
    this.view3d = null;
    this.show3d = false;
    this.loading3d = false;
    delete (window as unknown as { labView3d?: Design3dComponent }).labView3d;
  }

  /** The 3D view shows the same document as the canvas, nothing of its own. */
  private sync3d(design: WindowDesign): void {
    if (!this.view3d) return;
    this.view3d.setInput('glassTint', this.glassTints[String(design.glazing.glassId)] ?? null);
    this.view3d.setInput('design', design);
  }

  presetsOf(group: PresetGroup): LabPreset[] {
    return LAB_PRESETS.filter((p) => p.group === group);
  }

  /* ------------------------------------------------------------------ */
  /* Loading a design                                                    */
  /* ------------------------------------------------------------------ */

  private load(design: WindowDesign, key: string): void {
    this.activePreset = key;
    this.model = design;
    this.current = design;
    this.selection = null;
    this.refreshJson(design);
    this.sync3d(design);
  }

  /** A built-in preset is a template too: it can be placed at any size. */
  loadPreset(key: string): void {
    const preset = LAB_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    const template = createTemplate(preset.build(), preset.label, { tags: preset.tags });
    this.place(template, key);
  }

  useSaved(item: SavedTemplate): void {
    this.place(item.template, `saved-${item.id}`);
  }

  private place(template: DesignTemplate, key: string): void {
    const w = Number(this.placeW) || template.design.frame.widthMm;
    const h = Number(this.placeH) || template.design.frame.heightMm;
    try {
      const { design, warnings } = instantiateTemplate(template, w, h);
      this.templateMessage = warnings.length ? `Placed with notes: ${warnings.join('; ')}` : '';
      this.load(design, key);
    } catch (err) {
      this.templateMessage = `Cannot place "${template.name}" at ${w} × ${h} mm: ${this.text(err)}`;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Canvas + inspector wiring                                           */
  /* ------------------------------------------------------------------ */

  onModelChange(next: WindowDesign): void {
    this.current = next;
    this.refreshJson(next);
    this.sync3d(next);
  }

  onSelectionChange(sel: CanvasSelection | null): void {
    this.selection = sel;
  }

  /** Inspector edit → one step on the canvas undo stack. */
  onInspectorChange(next: WindowDesign): void {
    this.canvas?.apply(next);
  }

  get selectionText(): string {
    const s = this.selection;
    if (!s) return 'nothing selected';
    if (s.type === 'frame') return 'whole window';
    if (s.type === 'pane') {
      return s.panelIndex === undefined
        ? `pane ${s.paneId}`
        : `pane ${s.paneId}, panel ${s.panelIndex + 1}`;
    }
    return `divider ${s.index} of split ${s.splitId}`;
  }

  private refreshJson(design: WindowDesign): void {
    this.modelJson = JSON.stringify(JSON.parse(serialize(design)), null, 2);
    try {
      this.payloadJson = JSON.stringify(toPayload(design), null, 2);
      this.payloadOk = true;
    } catch (err) {
      this.payloadJson = `toPayload() failed: ${String(err)}`;
      this.payloadOk = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Saved templates                                                     */
  /* ------------------------------------------------------------------ */

  private text(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  async reloadTemplates(): Promise<void> {
    try {
      const rows = await this.store.list();
      this.saved = rows.map((row) => {
        const template = fromTemplateRow(row);
        const f = template.design.frame;
        return {
          id: row.id ?? 0,
          template,
          sizeText: `${Math.round(f.widthMm)} × ${Math.round(f.heightMm)} mm`,
        };
      });
    } catch (err) {
      this.saved = [];
      this.templateMessage = `Saved templates could not be loaded: ${this.text(err)}`;
    }
    this.cdr.markForCheck();
  }

  async saveTemplate(): Promise<void> {
    const name = this.templateName.trim();
    if (!name) {
      this.templateMessage = 'Give the template a name first.';
      return;
    }
    // A small PNG of the drawing for the picker card.
    const stage = this.canvas?.getStage();
    const thumb = stage ? stage.toDataURL({ pixelRatio: 0.25, mimeType: 'image/png' }) : '';
    const template = createTemplate(this.current, name, {
      tags: this.templateTags.split(','),
      resizeRule: this.preserveLocks ? 'preserve-locks' : 'proportional',
      thumbnail: thumb ? { kind: 'dataUrl', value: thumb } : { kind: 'none' },
    });
    try {
      await this.store.add(toTemplateRequest(template));
      this.templateName = '';
      this.templateTags = '';
      this.templateMessage = `Saved "${name}".`;
      await this.reloadTemplates();
    } catch (err) {
      this.templateMessage = `Could not save: ${this.text(err)}`;
      this.cdr.markForCheck();
    }
  }

  async deleteSaved(item: SavedTemplate): Promise<void> {
    try {
      await this.store.remove(item.id);
      this.templateMessage = `Deleted "${item.template.name}".`;
      await this.reloadTemplates();
    } catch (err) {
      this.templateMessage = `Could not delete: ${this.text(err)}`;
      this.cdr.markForCheck();
    }
  }
}
