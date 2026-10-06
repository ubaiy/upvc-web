/**
 * Plan editor — the footprint of a structure drawn from nothing (card T169).
 *
 * A grid in top view, the front at the bottom. With no plan yet the user
 * clicks corners (snap to the 100 mm grid, to right and 45° angles and to the
 * first corner; a side that would cross the outline is shown red and refused;
 * the length of the side can be typed). With a plan he drags a corner or a
 * side, types the length of a side, adds or removes a corner and says what
 * each side is: a wall, open, or against the existing building.
 *
 * It holds no document: it sends plans out, the designer keeps them.
 */

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  crossedSide,
  distP,
  moveCorner,
  moveSide,
  orientPlan,
  PLAN_GRID,
  PLAN_MAX,
  PLAN_MAX_CORNERS,
  PLAN_MIN_SIDE,
  planProblem,
  pointAtLength,
  Pt,
  READY_PLANS,
  regularPolygonPlan,
  removeCorner,
  setSideLength,
  sideFrame,
  sideLength,
  Snap,
  snapCorner,
  splitSide,
} from '../../shared/structure-model';

export interface PlanChange {
  plan: Pt[];
  /** One letter a side: 'w' wall, 'o' open, 'h' against the existing building. */
  walls: string;
}

interface Drag {
  kind: 'corner' | 'side';
  index: number;
  base: Pt[];
  from: Pt;
  moved: boolean;
}

const STATE_LABEL: Record<string, string> = { w: 'Wall', o: 'Open side', h: 'Against the existing wall' };

@Component({
  selector: 'app-plan-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pe-bar" *ngIf="!plan">
      <strong>Draw the plan</strong>
      <span class="pe-muted">{{ drawHint }}</span>
      <span class="pe-spacer"></span>
      <label class="pe-len" *ngIf="draft.length">
        <span>Length of this side</span>
        <input type="number" inputmode="numeric" [min]="minSide" [max]="maxSide" step="10" [(ngModel)]="typed" (keydown.enter)="addTyped()" placeholder="mm" data-plan="typed" aria-label="Length of the side being drawn, in mm" />
        <span class="pe-unit">mm</span>
        <button type="button" class="pe-btn" (click)="addTyped()" [disabled]="!typed">Add</button>
      </label>
      <button type="button" class="pe-btn" (click)="undoCorner()" [disabled]="!draft.length" data-plan="undo-corner">Undo corner</button>
      <button type="button" class="pe-btn pe-btn--primary" (click)="close()" [disabled]="draft.length < 3" data-plan="close">Close the shape</button>
    </div>
    <div class="pe-bar pe-bar--ready" *ngIf="!plan">
      <span class="pe-muted">Or take a ready plan and change it:</span>
      <button type="button" class="pe-btn" *ngFor="let r of ready" (click)="useReady(r.plan)" [attr.data-ready]="r.key">{{ r.label }}</button>
      <span class="pe-round">
        <button type="button" class="pe-btn" (click)="useRound()" data-ready="round">Round / regular</button>
        <input type="number" min="3" max="32" step="1" [(ngModel)]="roundSides" aria-label="Number of sides" data-plan="round-sides" /><span class="pe-unit">sides</span>
        <input type="number" min="1000" max="20000" step="100" [(ngModel)]="roundDiameter" aria-label="Diameter in mm" data-plan="round-diameter" /><span class="pe-unit">mm across</span>
      </span>
    </div>

    <svg #svg class="pe-svg" [attr.viewBox]="viewBox" [class.is-drawing]="!plan" (pointermove)="onMove($event)" (pointerdown)="onDown($event)" (pointerup)="onUp($event)" (pointerleave)="onLeave()" role="img" aria-label="Plan of the structure, seen from above; the front is at the bottom">
      <defs>
        <pattern id="pe-minor" [attr.width]="grid" [attr.height]="grid" patternUnits="userSpaceOnUse"><path [attr.d]="'M ' + grid + ' 0 L 0 0 0 ' + grid" fill="none" class="pe-grid-minor" [attr.stroke-width]="u * 0.08" /></pattern>
        <pattern id="pe-major" [attr.width]="grid * 10" [attr.height]="grid * 10" patternUnits="userSpaceOnUse"><rect [attr.width]="grid * 10" [attr.height]="grid * 10" fill="url(#pe-minor)" /><path [attr.d]="'M ' + grid * 10 + ' 0 L 0 0 0 ' + grid * 10" fill="none" class="pe-grid-major" [attr.stroke-width]="u * 0.16" /></pattern>
      </defs>
      <rect [attr.x]="box.x" [attr.y]="box.y" [attr.width]="box.w" [attr.height]="box.h" fill="url(#pe-major)" />
      <text class="pe-front" [attr.x]="box.x + box.w / 2" [attr.y]="box.y + box.h - u * 1.2" [attr.font-size]="u * 2.2" text-anchor="middle">FRONT · one square = 1 m</text>

      <!-- A closed plan. -->
      <ng-container *ngIf="shown as pts">
        <polygon *ngIf="plan" class="pe-floor" [attr.points]="points(pts)" />
        <g *ngFor="let p of pts; let i = index">
          <ng-container *ngIf="plan || i < pts.length - 1">
            <line class="pe-side" [class.is-open]="state(i) === 'o'" [class.is-house]="state(i) === 'h'" [class.is-on]="plan && selectedSide === i" [class.is-bad]="badSide === i" [attr.x1]="p[0]" [attr.y1]="p[1]" [attr.x2]="next(pts, i)[0]" [attr.y2]="next(pts, i)[1]" [attr.stroke-width]="u * (state(i) === 'h' ? 1.1 : 0.7)" />
            <line *ngIf="plan" class="pe-hit" [attr.data-side]="i" [attr.x1]="p[0]" [attr.y1]="p[1]" [attr.x2]="next(pts, i)[0]" [attr.y2]="next(pts, i)[1]" [attr.stroke-width]="u * 3" />
            <text class="pe-size" [attr.x]="label(pts, i)[0]" [attr.y]="label(pts, i)[1]" [attr.font-size]="u * 2" text-anchor="middle" dominant-baseline="middle"><tspan *ngIf="plan" class="pe-no">{{ i + 1 }} · </tspan>{{ length(pts, i) }}</text>
          </ng-container>
        </g>
        <ng-container *ngIf="plan">
          <circle *ngFor="let p of pts; let i = index" class="pe-corner" [class.is-on]="selectedCorner === i" [attr.data-corner]="i" [attr.cx]="p[0]" [attr.cy]="p[1]" [attr.r]="u * 1.1" [attr.stroke-width]="u * 0.3" />
        </ng-container>
      </ng-container>

      <!-- The side being drawn. -->
      <ng-container *ngIf="!plan">
        <circle *ngFor="let p of draft; let i = index" class="pe-corner" [class.is-first]="i === 0" [attr.cx]="p[0]" [attr.cy]="p[1]" [attr.r]="u * (i === 0 ? 1.4 : 0.9)" [attr.stroke-width]="u * 0.3" />
        <ng-container *ngIf="cursor as c">
          <line *ngIf="draft.length" class="pe-rubber" [class.is-bad]="badSide >= 0 || tooShort" [attr.x1]="last[0]" [attr.y1]="last[1]" [attr.x2]="c.point[0]" [attr.y2]="c.point[1]" [attr.stroke-width]="u * 0.6" />
          <circle class="pe-cursor" [class.is-close]="c.kind === 'close'" [attr.cx]="c.point[0]" [attr.cy]="c.point[1]" [attr.r]="u * 0.8" [attr.stroke-width]="u * 0.25" />
          <text *ngIf="draft.length" class="pe-size pe-size--live" [attr.x]="c.point[0] + u * 2" [attr.y]="c.point[1] - u * 2" [attr.font-size]="u * 2.2">{{ rubberLength }} mm{{ c.kind === 'close' ? ' · closes the shape' : '' }}</text>
        </ng-container>
      </ng-container>
    </svg>

    <p class="pe-note" *ngIf="note" role="status" data-plan="note">{{ note }}</p>

    <!-- What is selected on a closed plan. -->
    <div class="pe-bar pe-bar--sel" *ngIf="plan as pts">
      <ng-container *ngIf="selectedSide >= 0 && selectedSide < pts.length; else cornerOrHint">
        <strong>Wall {{ selectedSide + 1 }}</strong>
        <label class="pe-len">
          <span>Length</span>
          <input type="number" inputmode="numeric" [min]="minSide" [max]="maxSide" step="10" [value]="length(pts, selectedSide)" (change)="typeLength($any($event.target).value)" data-plan="side-length" aria-label="Length of this side in mm" />
          <span class="pe-unit">mm</span>
        </label>
        <span class="pe-seg" role="group" aria-label="What this side is">
          <button type="button" *ngFor="let k of stateKeys" [class.is-on]="state(selectedSide) === k" (click)="setState(k)" [attr.data-state]="k">{{ stateLabel[k] }}</button>
        </span>
        <button type="button" class="pe-btn" (click)="addCorner()" [disabled]="pts.length >= maxCorners" data-plan="add-corner">Add a corner</button>
      </ng-container>
      <ng-template #cornerOrHint>
        <ng-container *ngIf="selectedCorner >= 0 && selectedCorner < pts.length; else hint">
          <strong>Corner {{ selectedCorner + 1 }}</strong>
          <span class="pe-muted">Drag it; it keeps to the 100 mm grid.</span>
          <button type="button" class="pe-btn" (click)="dropCorner()" [disabled]="pts.length <= 3" data-plan="remove-corner">Remove this corner</button>
        </ng-container>
        <ng-template #hint><span class="pe-muted">Drag a corner or a side. Tap a side to type its length, open it, put it against the house, or add a corner.</span></ng-template>
      </ng-template>
    </div>
  `,
  styles: [
    `
      :host { display: flex; flex-direction: column; gap: 6px; min-height: 0; color: var(--sd-ink, #1c2430); }
      .pe-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; }
      .pe-spacer { flex: 1; }
      .pe-btn { height: 32px; padding: 0 12px; border: 1px solid #c3ccd6; border-radius: 6px; background: #fff; color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
      .pe-btn:hover:not(:disabled) { background: #f1f5f9; }
      .pe-btn:disabled { opacity: 0.5; cursor: default; }
      .pe-btn--primary { background: #1f4f82; border-color: #1f4f82; color: #fff; }
      .pe-btn--primary:hover:not(:disabled) { background: #173e68; }
      .pe-seg { display: inline-flex; border: 1px solid #c3ccd6; border-radius: 6px; overflow: hidden; }
      .pe-seg button { height: 30px; padding: 0 10px; border: 0; border-right: 1px solid #c3ccd6; background: #fff; color: inherit; font: inherit; cursor: pointer; }
      .pe-seg button:last-child { border-right: 0; }
      .pe-seg button.is-on { background: #1f4f82; color: #fff; }
      .pe-btn:focus-visible, .pe-seg button:focus-visible, .pe-len input:focus-visible, .pe-round input:focus-visible { outline: 2px solid #2f7cc8; outline-offset: 1px; }
      .pe-muted { color: #5c6875; }
      .pe-len, .pe-round { display: inline-flex; align-items: center; gap: 6px; }
      .pe-len input, .pe-round input { width: 84px; height: 32px; padding: 0 8px; border: 1px solid #c3ccd6; border-radius: 6px; font: inherit; background: #fff; color: inherit; }
      .pe-round input { width: 68px; }
      .pe-unit { color: #5c6875; font-size: 12px; }
      .pe-svg { flex: 1; min-height: 220px; width: 100%; background: #fbfcfd; border: 1px solid #d5dce4; border-radius: 8px; touch-action: none; user-select: none; }
      .pe-svg.is-drawing { cursor: crosshair; }
      .pe-grid-minor { stroke: #e3e8ee; }
      .pe-grid-major { stroke: #c4ced9; }
      .pe-front { fill: #8894a1; letter-spacing: 0.08em; }
      .pe-floor { fill: rgba(47, 124, 200, 0.1); stroke: none; }
      .pe-side { stroke: #1f4f82; stroke-linecap: round; pointer-events: none; }
      .pe-side.is-open { stroke: #6f8fb0; stroke-dasharray: 2 3; stroke-dashoffset: 0; vector-effect: none; }
      .pe-side.is-house { stroke: #7a5a2b; }
      .pe-side.is-on { stroke: #e07a10; }
      .pe-side.is-bad, .pe-rubber.is-bad { stroke: #d12f2f; }
      .pe-hit { stroke: transparent; cursor: move; }
      .pe-size { fill: #1c2430; paint-order: stroke; stroke: #fbfcfd; stroke-width: 0.35em; stroke-linejoin: round; pointer-events: none; font-weight: 600; }
      .pe-no { fill: #5c6875; font-weight: 400; }
      .pe-size--live { fill: #1f4f82; }
      .pe-corner { fill: #fff; stroke: #1f4f82; cursor: grab; }
      .pe-corner.is-first { fill: #dff0e3; stroke: #1f8a3b; }
      .pe-corner.is-on { fill: #e07a10; stroke: #8a4a05; }
      .pe-rubber { stroke: #2f7cc8; stroke-dasharray: 3 2; pointer-events: none; }
      .pe-cursor { fill: #2f7cc8; stroke: #fff; pointer-events: none; }
      .pe-cursor.is-close { fill: #1f8a3b; }
      .pe-note { margin: 0; padding: 6px 10px; border-radius: 6px; background: #fdecec; color: #8f1d1d; font-size: 13px; }
    `,
  ],
})
export class PlanEditorComponent implements OnChanges {
  /** The closed plan being changed; null while a new one is drawn. */
  @Input() plan: Pt[] | null = null;
  @Input() walls = '';
  /** A new plan was closed. */
  @Output() drawn = new EventEmitter<Pt[]>();
  /** A corner or a side is being dragged. */
  @Output() preview = new EventEmitter<PlanChange>();
  /** A change is finished: one step of the history. */
  @Output() changed = new EventEmitter<PlanChange>();

  readonly ready = READY_PLANS;
  readonly grid = PLAN_GRID;
  readonly minSide = PLAN_MIN_SIDE;
  readonly maxSide = PLAN_MAX;
  readonly maxCorners = PLAN_MAX_CORNERS;
  readonly stateKeys = ['w', 'o', 'h'];
  readonly stateLabel = STATE_LABEL;

  draft: Pt[] = [];
  cursor: Snap | null = null;
  /** The side shown red: the one a new side would cross, or the one a change would break. */
  badSide = -1;
  tooShort = false;
  typed: number | null = null;
  note = '';
  roundSides = 12;
  roundDiameter = 4000;
  selectedSide = -1;
  selectedCorner = -1;
  box = { x: -1500, y: -1500, w: 10000, h: 7500 };
  /** The plan as it is while a drag is going on. */
  private live: Pt[] | null = null;
  private drag: Drag | null = null;
  private noteTimer = 0;

  @ViewChild('svg', { static: true }) private svg!: ElementRef<SVGSVGElement>;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngOnChanges(): void {
    if (this.drag) return;
    this.live = null;
    this.fitView();
  }

  /** One hundredth of the width of the view, mm: the unit of line widths and letters. */
  get u(): number {
    return this.box.w / 100;
  }

  get viewBox(): string {
    return `${this.box.x} ${this.box.y} ${this.box.w} ${this.box.h}`;
  }

  /** The corners drawn: the closed plan, or the chain so far. */
  get shown(): Pt[] | null {
    return this.plan ? this.live ?? this.plan : this.draft.length ? this.draft : null;
  }

  get last(): Pt {
    return this.draft[this.draft.length - 1];
  }

  get rubberLength(): number {
    return this.cursor && this.draft.length ? Math.round(distP(this.last, this.cursor.point)) : 0;
  }

  get drawHint(): string {
    if (!this.draft.length) return 'Click where the first corner goes.';
    if (this.draft.length < 3) return 'Click the next corner, or type the length of the side and press Enter.';
    return 'Click the next corner, or the green first corner to close the shape.';
  }

  points(pts: Pt[]): string {
    return pts.map((p) => `${p[0]},${p[1]}`).join(' ');
  }

  next(pts: Pt[], i: number): Pt {
    return pts[(i + 1) % pts.length];
  }

  length(pts: Pt[], i: number): number {
    return Math.round(distP(pts[i], this.next(pts, i)));
  }

  /** Where the size of a side is written: beside its middle, outside the plan. */
  label(pts: Pt[], i: number): Pt {
    const a = pts[i];
    const b = this.next(pts, i);
    const l = distP(a, b) || 1;
    // Outside for a stored plan; for the chain being drawn the same side of the line.
    const out: Pt = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
    return [(a[0] + b[0]) / 2 + out[0] * this.u * 2.6, (a[1] + b[1]) / 2 + out[1] * this.u * 2.6];
  }

  state(i: number): string {
    return this.plan ? this.walls[i] ?? 'w' : 'w';
  }

  // --- drawing a new plan ---

  private toPlan(e: PointerEvent): Pt {
    const svg = this.svg.nativeElement;
    const m = svg.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  }

  onMove(e: PointerEvent): void {
    const raw = this.toPlan(e);
    if (this.plan) return this.dragTo(raw);
    this.cursor = snapCorner(this.draft, raw, this.u * 2.5);
    this.check(this.cursor);
    this.cdr.markForCheck();
  }

  onLeave(): void {
    if (this.plan) return;
    this.cursor = null;
    this.badSide = -1;
    this.cdr.markForCheck();
  }

  /** Mark what is wrong with the side to this point; true when it may be added. */
  private check(to: Snap): boolean {
    this.tooShort = false;
    this.badSide = -1;
    if (!this.draft.length) return true;
    if (to.kind !== 'close' && distP(this.last, to.point) < PLAN_MIN_SIDE) {
      this.tooShort = true;
      return false;
    }
    this.badSide = crossedSide(this.draft, to.point, to.kind === 'close');
    return this.badSide < 0;
  }

  onDown(e: PointerEvent): void {
    const raw = this.toPlan(e);
    if (this.plan) return this.startDrag(e, raw);
    this.place(snapCorner(this.draft, raw, this.u * 2.5));
  }

  private place(to: Snap): void {
    if (!this.check(to)) {
      this.say(this.tooShort ? `A side is ${PLAN_MIN_SIDE} mm long at least.` : `That side would cross side ${this.badSide + 1}, shown in red. Put the corner somewhere else.`);
      return;
    }
    if (to.kind === 'close') return this.finish();
    if (this.draft.length >= PLAN_MAX_CORNERS) return this.say(`A plan can have ${PLAN_MAX_CORNERS} corners at most.`);
    this.draft = [...this.draft, to.point];
    this.typed = null;
    this.note = '';
    this.fitView();
    this.cdr.markForCheck();
  }

  /** The typed length, along the direction the pointer shows (to the right when it shows none). */
  addTyped(): void {
    const length = Number(this.typed);
    if (!this.draft.length || !Number.isFinite(length)) return;
    if (length < PLAN_MIN_SIDE || length > PLAN_MAX) return this.say(`A side is ${PLAN_MIN_SIDE} to ${PLAN_MAX} mm long.`);
    const towards: Pt = this.cursor && distP(this.cursor.point, this.last) > 1 ? this.cursor.point : [this.last[0] + 1, this.last[1]];
    const point = pointAtLength(this.last, towards, length);
    this.place({ point, kind: 'grid' });
    this.cursor = null;
  }

  undoCorner(): void {
    this.draft = this.draft.slice(0, -1);
    this.badSide = -1;
    this.note = '';
    this.fitView();
    this.cdr.markForCheck();
  }

  /** The button: the side back to the first corner. */
  close(): void {
    if (this.draft.length < 3) return;
    this.place({ point: this.draft[0], kind: 'close' });
  }

  private finish(): void {
    const problem = planProblem(this.draft);
    if (problem) {
      this.badSide = problem.side;
      return this.say(problem.message);
    }
    const plan = orientPlan(this.draft);
    this.draft = [];
    this.cursor = null;
    this.drawn.emit(plan);
  }

  useReady(plan: Pt[]): void {
    this.drawn.emit(plan.map((p): Pt => [p[0], p[1]]));
  }

  useRound(): void {
    const sides = Math.round(Number(this.roundSides));
    const diameter = Number(this.roundDiameter);
    if (!(sides >= 3 && sides <= 32)) return this.say('A regular plan has 3 to 32 sides.');
    if (!(diameter >= 1000 && diameter <= 20000)) return this.say('The plan is 1000 to 20000 mm across.');
    const plan = regularPolygonPlan(sides, diameter);
    const problem = planProblem(plan);
    if (problem) return this.say(`${problem.message} Use fewer sides or a larger size.`);
    this.drawn.emit(plan);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (this.plan || !this.draft.length || (e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
    if (e.key === 'Backspace' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z')) {
      e.preventDefault();
      e.stopPropagation();
      this.undoCorner();
    }
  }

  // --- changing a closed plan ---

  private startDrag(e: PointerEvent, raw: Pt): void {
    const el = e.target as Element;
    const corner = el.getAttribute('data-corner');
    const side = el.getAttribute('data-side');
    if (!this.plan || (corner === null && side === null)) {
      this.selectedSide = this.selectedCorner = -1;
      this.cdr.markForCheck();
      return;
    }
    this.drag = { kind: corner !== null ? 'corner' : 'side', index: Number(corner ?? side), base: this.plan, from: raw, moved: false };
    this.svg.nativeElement.setPointerCapture(e.pointerId);
  }

  private dragTo(raw: Pt): void {
    const d = this.drag;
    if (!d) return;
    const snap = (v: number): number => Math.round(v / PLAN_GRID) * PLAN_GRID;
    let next: Pt[];
    if (d.kind === 'corner') {
      next = moveCorner(d.base, d.index, [snap(raw[0]), snap(raw[1])]);
    } else {
      const { out } = sideFrame(d.base, d.index);
      next = moveSide(d.base, d.index, snap((raw[0] - d.from[0]) * out[0] + (raw[1] - d.from[1]) * out[1]));
    }
    if (this.points(next) === this.points(this.live ?? d.base)) return;
    const problem = planProblem(next);
    if (problem) {
      // Refused while it is being done: the plan stays where it last worked, the side at fault is shown.
      this.badSide = problem.side;
      this.note = problem.message;
      this.cdr.markForCheck();
      return;
    }
    this.badSide = -1;
    this.note = '';
    d.moved = true;
    this.live = next;
    this.preview.emit({ plan: next, walls: this.walls });
    this.cdr.markForCheck();
  }

  onUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.svg.nativeElement.releasePointerCapture?.(e.pointerId);
    this.badSide = -1;
    this.note = '';
    if (d.moved && this.live) {
      this.changed.emit({ plan: this.live, walls: this.walls });
    } else if (d.kind === 'side') {
      this.selectedSide = d.index;
      this.selectedCorner = -1;
    } else {
      this.selectedCorner = d.index;
      this.selectedSide = -1;
    }
    this.cdr.markForCheck();
  }

  private apply(plan: Pt[], walls: string): void {
    const problem = planProblem(plan);
    if (problem) {
      this.badSide = problem.side;
      return this.say(problem.message);
    }
    this.badSide = -1;
    this.changed.emit({ plan, walls });
  }

  typeLength(raw: string | number): void {
    const length = Math.round(Number(raw));
    if (!this.plan || this.selectedSide < 0) return;
    if (!Number.isFinite(length) || length < PLAN_MIN_SIDE || length > PLAN_MAX) return this.say(`A side is ${PLAN_MIN_SIDE} to ${PLAN_MAX} mm long.`);
    if (length === Math.round(sideLength(this.plan, this.selectedSide))) return;
    this.apply(setSideLength(this.plan, this.selectedSide, length), this.walls);
  }

  setState(key: string): void {
    if (!this.plan || this.selectedSide < 0) return;
    const walls = this.plan.map((_, i) => (i === this.selectedSide ? key : this.state(i))).join('');
    this.changed.emit({ plan: this.plan, walls });
  }

  addCorner(): void {
    if (!this.plan || this.selectedSide < 0) return;
    const i = this.selectedSide;
    if (sideLength(this.plan, i) < 2 * PLAN_MIN_SIDE) return this.say(`This side is too short to divide: each part must be ${PLAN_MIN_SIDE} mm at least.`);
    const states = this.plan.map((_, k) => this.state(k));
    states.splice(i + 1, 0, states[i]);
    this.selectedSide = -1;
    this.selectedCorner = i + 1;
    this.apply(splitSide(this.plan, i), states.join(''));
  }

  dropCorner(): void {
    if (!this.plan || this.selectedCorner < 0) return;
    const i = this.selectedCorner;
    const states = this.plan.map((_, k) => this.state(k));
    states.splice(i, 1);
    this.selectedCorner = -1;
    this.apply(removeCorner(this.plan, i), states.join(''));
  }

  // --- the view ---

  /** The view takes in the plan (or the chain drawn so far) with room round it to draw in. */
  private fitView(): void {
    const pts = this.plan ?? this.draft;
    if (!pts.length) {
      this.box = { x: -1500, y: -1500, w: 10000, h: 7500 };
      return;
    }
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const room = this.plan ? 1400 : 3000;
    let x = Math.min(...xs) - room;
    let y = Math.min(...ys) - room;
    let w = Math.max(...xs) - Math.min(...xs) + 2 * room;
    let h = Math.max(...ys) - Math.min(...ys) + 2 * room;
    if (!this.plan) {
      // While drawing the view only grows, so the grid does not jump under the pointer.
      const x1 = Math.max(x + w, this.box.x + this.box.w);
      const y1 = Math.max(y + h, this.box.y + this.box.h);
      x = Math.min(x, this.box.x);
      y = Math.min(y, this.box.y);
      w = x1 - x;
      h = y1 - y;
    }
    // Whole metres, so the grid lines stay where they are.
    x = Math.floor(x / 1000) * 1000;
    y = Math.floor(y / 1000) * 1000;
    this.box = { x, y, w: Math.ceil(w / 1000) * 1000, h: Math.ceil(h / 1000) * 1000 };
  }

  private say(text: string): void {
    this.note = text;
    window.clearTimeout(this.noteTimer);
    this.noteTimer = window.setTimeout(() => {
      this.note = '';
      this.cdr.markForCheck();
    }, 5000);
    this.cdr.markForCheck();
  }
}
