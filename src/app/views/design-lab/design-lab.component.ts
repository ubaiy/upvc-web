/**
 * Design Lab — dev-only playground for the standalone DesignCanvasComponent
 * (route /design-lab). Hosts the canvas with preset models and shows the
 * live WindowDesign JSON and the derived toPayload() output side by side,
 * so the owner and the integration agent can try every interaction without
 * touching the quotation screen. No API calls are made from this page.
 */

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  WindowDesign,
  createDesign,
  createLeaf,
  serialize,
  setLeafSpec,
  setSlide,
  splitPane,
  splitPaneEqualSash,
  toPayload,
} from 'src/app/shared/design-model';
import { DesignCanvasComponent } from 'src/app/shared/design-canvas/design-canvas.component';
import { CanvasSelection } from 'src/app/shared/design-canvas/canvas-view';

interface LabPreset {
  key: string;
  label: string;
  build: () => WindowDesign;
}

/**
 * Preset designs (id vocabulary of designer-architecture §1: casement frame
 * product 8, sliding 23, sash 12/31, mullion profile 55, colour 4, glass 1,
 * handles 3/5). Mirrors the design-model golden fixtures, rebuilt here
 * because the testing fixtures module imports zone.js/testing (test-only).
 */
const PRESETS: LabPreset[] = [
  {
    key: 'single-fixed',
    label: 'Single fixed',
    build: () =>
      createDesign({
        frame: { widthMm: 1500, heightMm: 1200, productId: 8, colorId: 4 },
        glazing: { glassId: 1 },
      }),
  },
  {
    key: 'two-sash-casement',
    label: '2-sash casement',
    build: () => {
      const base = createDesign({
        frame: { widthMm: 1500, heightMm: 1200, productId: 8, colorId: 4 },
        glazing: { glassId: 1 },
        root: createLeaf('p1', {
          casementType: 'Openable',
          sashId: 12,
          opening: { direction: 'Left', handleId: 3, hingesType: 'Friction' },
        }),
      });
      return splitPaneEqualSash(base, 'p1', 2);
    },
  },
  {
    key: 'sliding-3-track-mesh',
    label: '3-track sliding + mesh',
    build: () => {
      const base = createDesign({
        frame: { widthMm: 2400, heightMm: 1380, productId: 23, colorId: 4 },
        glazing: { glassId: 1 },
        root: createLeaf('p1', { sashId: 31 }),
      });
      return setSlide(base, 'p1', {
        tracks: '3 Track',
        mesh: true,
        panels: [
          { widthMm: 760, direction: 'Left' },
          { widthMm: 760, direction: 'Left' },
          { widthMm: 760, direction: 'Right' },
        ],
      });
    },
  },
  {
    key: 'mixed-mullion-transom',
    label: 'Mixed mullion + transom',
    build: () => {
      let d = createDesign({
        frame: { widthMm: 2400, heightMm: 1380, productId: 8, colorId: 4 },
        glazing: { glassId: 1 },
      });
      d = splitPane(d, 'p1', 'x', 900, {
        dividerProfileId: 55,
        dividerFaceMm: 60,
      });
      d = splitPane(d, 'p3', 'y', 600, {
        dividerProfileId: 55,
        dividerFaceMm: 60,
      });
      d = setLeafSpec(d, 'p4', {
        casementType: 'Openable',
        sashId: 12,
        opening: { direction: 'Top', handleId: 5, hingesType: 'Friction' },
      });
      return d;
    },
  },
];

@Component({
  selector: 'app-design-lab',
  standalone: true,
  imports: [CommonModule, FormsModule, DesignCanvasComponent],
  templateUrl: './design-lab.component.html',
  styleUrls: ['./design-lab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesignLabComponent {
  readonly presets = PRESETS;
  activePreset = PRESETS[0].key;
  readOnly = false;
  sidePanel: 'model' | 'payload' = 'model';

  model: WindowDesign = PRESETS[0].build();
  selection: CanvasSelection | null = null;

  modelJson = '';
  payloadJson = '';

  constructor() {
    this.refreshJson(this.model);
  }

  loadPreset(key: string): void {
    const preset = this.presets.find((p) => p.key === key);
    if (!preset) return;
    this.activePreset = key;
    this.model = preset.build();
    this.selection = null;
    this.refreshJson(this.model);
  }

  onModelChange(next: WindowDesign): void {
    this.refreshJson(next);
  }

  onSelectionChange(sel: CanvasSelection | null): void {
    this.selection = sel;
  }

  get selectionText(): string {
    if (!this.selection) return 'nothing selected';
    if (this.selection.type === 'frame') return 'whole window';
    if (this.selection.type === 'pane') return `pane ${this.selection.paneId}`;
    return `divider ${this.selection.index} of split ${this.selection.splitId}`;
  }

  private refreshJson(design: WindowDesign): void {
    this.modelJson = JSON.stringify(JSON.parse(serialize(design)), null, 2);
    try {
      this.payloadJson = JSON.stringify(toPayload(design), null, 2);
    } catch (err) {
      this.payloadJson = `toPayload() failed: ${String(err)}`;
    }
  }
}
