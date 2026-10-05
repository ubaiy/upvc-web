/**
 * Design3dComponent — the Angular host of the 3D view. It takes a
 * WindowDesign document and shows it; it never edits the document and
 * keeps no geometry of its own. The whole of design-3d (three.js included)
 * is loaded only when a host imports this file with a dynamic import().
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
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { WindowDesign } from '../design-model';
import { DesignScene, OrbitBenchmark, SceneInfo, webglAvailable } from './scene';
import { SNAPSHOT_HEIGHT_PX, SNAPSHOT_WIDTH_PX, lookOf, scenePicture } from './snapshot';
import { buildWindowParts } from './window-parts';

export interface Design3dTimings {
  /** From `startedAt` (the tap that asked for 3D) to the first drawn frame. */
  firstFrameMs: number | null;
  /** Building the parts and the buffers of the window on screen. */
  buildMs: number;
  /** Of the frame that first showed this window. */
  triangles: number;
  drawCalls: number;
}

@Component({
  selector: 'app-design-3d',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="d3-stage" #stage>
      <canvas #canvas class="d3-canvas" role="img" aria-label="3D view of the window. Drag to turn it, pinch or scroll to zoom."></canvas>
      <p class="d3-notice" *ngIf="unavailable" role="status">3D is not available on this device.</p>
    </div>
    <div class="d3-bar" *ngIf="!unavailable">
      <label class="d3-open">
        <span>Open</span>
        <input
          type="range"
          min="0"
          max="90"
          step="1"
          data-d3="open"
          [value]="openDeg"
          [disabled]="!canOpen"
          (input)="onOpen($event)"
        />
        <output>{{ openLabel }}</output>
      </label>
      <button type="button" data-d3="fit" (click)="fit()">Fit</button>
      <button type="button" data-d3="picture" (click)="takePicture()">Picture</button>
      <a *ngIf="picture" [href]="picture" download="window-3d.png" data-d3="download">Download PNG</a>
    </div>
    <p class="d3-stats" *ngIf="timings" data-d3="stats">
      {{ timings.triangles }} triangles, {{ timings.drawCalls }} draw calls, built in {{ timings.buildMs | number: '1.0-1' }} ms<ng-container
        *ngIf="timings.firstFrameMs !== null"
        >, first frame {{ timings.firstFrameMs | number: '1.0-0' }} ms after the tap</ng-container
      >
    </p>
    <figure class="d3-picture" *ngIf="picture">
      <img [src]="picture" [attr.width]="pictureWidth" [attr.height]="pictureHeight" alt="3D picture of the window" />
      <figcaption>{{ pictureWidth }} × {{ pictureHeight }} px, on white</figcaption>
    </figure>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
      }
      .d3-stage {
        position: relative;
        width: 100%;
        aspect-ratio: 4 / 3;
        min-height: 240px;
        border: 1px solid #d6dbe1;
        border-radius: 6px;
        overflow: hidden;
        background: #eef1f4;
      }
      .d3-canvas {
        display: block;
        width: 100%;
        height: 100%;
        touch-action: none;
        cursor: grab;
      }
      .d3-notice {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        margin: 0;
        padding: 16px;
        text-align: center;
        color: #3c4044;
        background: #eef1f4;
      }
      .d3-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 12px;
        font-size: 13px;
      }
      .d3-open {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1 1 180px;
        margin: 0;
      }
      .d3-open input {
        flex: 1;
        min-width: 80px;
      }
      .d3-open output {
        min-width: 3.2em;
        font-variant-numeric: tabular-nums;
      }
      .d3-bar button {
        min-height: 32px;
        padding: 4px 12px;
        border: 1px solid #b9c0c8;
        border-radius: 4px;
        background: #fff;
        color: #1f2933;
      }
      .d3-bar button:focus-visible,
      .d3-bar a:focus-visible {
        outline: 2px solid #1d4ed8;
        outline-offset: 2px;
      }
      .d3-stats {
        margin: 0;
        font-size: 12px;
        color: #52606d;
        font-variant-numeric: tabular-nums;
      }
      .d3-picture {
        margin: 0;
      }
      .d3-picture img {
        display: block;
        width: 100%;
        height: auto;
        border: 1px solid #d6dbe1;
        background: #fff;
      }
      .d3-picture figcaption {
        font-size: 12px;
        color: #52606d;
      }
    `,
  ],
})
export class Design3dComponent implements OnChanges, AfterViewInit, OnDestroy {
  @ViewChild('canvas') private canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('stage') private stageRef?: ElementRef<HTMLElement>;

  /** The document to show. The view never changes it. */
  @Input() design: WindowDesign | null = null;
  /** Tint (hex) of the design's glass; the host knows its glass list. */
  @Input() glassTint: string | null | undefined = null;
  /** Lab only: show the window twice, round a 90° corner with a post (thrown away after P0). */
  @Input() cornerDemo = false;
  /** performance.now() of the tap that asked for 3D; null = not timed. */
  @Input() startedAt: number | null = null;
  /** Outer frame face width, the value the 2D canvas is given. */
  @Input() frameFaceMm: number | undefined;
  @Output() readonly ready = new EventEmitter<Design3dTimings>();

  unavailable = false;
  openDeg = 0;
  canOpen = false;
  openLabel = '0°';
  picture = '';
  timings: Design3dTimings | null = null;
  readonly pictureWidth = SNAPSHOT_WIDTH_PX;
  readonly pictureHeight = SNAPSHOT_HEIGHT_PX;

  private scene: DesignScene | null = null;
  private observer: ResizeObserver | null = null;
  private firstFrameMs: number | null = null;
  private drawn = false;

  constructor(
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['cornerDemo']) this.scene?.setCornerDemo(this.cornerDemo === true);
    // One rebuild for a change of document, glass tint and face together.
    if (changes['design'] || changes['glassTint'] || changes['frameFaceMm']) this.rebuild();
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef?.nativeElement;
    const stage = this.stageRef?.nativeElement;
    if (!canvas || !stage) return;
    if (!webglAvailable()) {
      this.fail();
      return;
    }
    // Orbit and drawing stay outside Angular: turning the window runs no change detection.
    this.zone.runOutsideAngular(() => {
      try {
        const scene = new DesignScene(canvas);
        this.scene = scene;
        scene.setCornerDemo(this.cornerDemo === true);
        scene.resize(stage.clientWidth, stage.clientHeight);
        this.observer = new ResizeObserver(() => scene.resize(stage.clientWidth, stage.clientHeight));
        this.observer.observe(stage);
      } catch {
        this.scene = null;
      }
    });
    if (!this.scene) {
      this.fail();
      return;
    }
    this.rebuild();
    // The view was already checked once: check it again with what the build found.
    this.cdr.detectChanges();
  }

  private fail(): void {
    this.unavailable = true;
    this.cdr.detectChanges();
  }

  /** The frame that first shows a newly built window: read what it cost. */
  private afterFrame(buildMs: number): void {
    const scene = this.scene;
    if (!scene) return;
    scene.onFrame = null;
    if (!this.drawn) {
      this.drawn = true;
      this.firstFrameMs = this.startedAt === null ? null : performance.now() - this.startedAt;
    }
    const info = scene.info();
    this.zone.run(() => {
      this.timings = { firstFrameMs: this.firstFrameMs, buildMs, triangles: info.triangles, drawCalls: info.drawCalls };
      this.ready.emit(this.timings);
      this.cdr.markForCheck();
    });
  }

  private rebuild(): void {
    const scene = this.scene;
    const design = this.design;
    if (!scene || !design) return;
    const t0 = performance.now();
    const parts = buildWindowParts(design, { frameFaceMm: this.frameFaceMm });
    this.zone.runOutsideAngular(() => scene.setParts(parts, lookOf(design, this.glassTint)));
    const buildMs = performance.now() - t0;
    scene.onFrame = () => this.afterFrame(buildMs);
    this.canOpen = scene.movers > 0;
    if (!this.canOpen && this.openDeg) {
      this.openDeg = 0;
      scene.setOpen(0);
    }
    this.picture = '';
    this.updateOpenLabel();
    this.cdr.markForCheck();
  }

  private updateOpenLabel(): void {
    // Hinged sashes read in degrees (the limit of a side-hung sash is 90°); shutters in per cent.
    const hinged = (this.scene?.hingedMovers ?? 0) > 0;
    this.openLabel = hinged ? `${this.openDeg}°` : `${Math.round((this.openDeg / 90) * 100)}%`;
  }

  onOpen(event: Event): void {
    this.openDeg = Number((event.target as HTMLInputElement).value) || 0;
    this.updateOpenLabel();
    this.scene?.setOpen(this.openDeg / 90);
  }

  /** 0 = closed … 1 = fully open (for hosts and tests). */
  setOpen(t: number): void {
    this.openDeg = Math.round(Math.min(1, Math.max(0, t)) * 90);
    this.updateOpenLabel();
    this.scene?.setOpen(this.openDeg / 90);
    this.cdr.markForCheck();
  }

  fit(): void {
    this.scene?.fit();
  }

  /** The PNG of the window as it stands (1600 × 1200 on white). */
  takePicture(): string {
    this.picture = this.scene ? scenePicture(this.scene) : '';
    this.cdr.markForCheck();
    return this.picture;
  }

  info(): SceneInfo | null {
    return this.scene?.info() ?? null;
  }

  benchmark(frames?: number): Promise<OrbitBenchmark | null> {
    return this.scene ? this.zone.runOutsideAngular(() => (this.scene as DesignScene).orbitBenchmark(frames)) : Promise.resolve(null);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.scene?.dispose();
    this.scene = null;
  }
}
