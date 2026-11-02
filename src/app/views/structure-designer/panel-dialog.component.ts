/**
 * The window of a wall panel, edited in a large dialog with the very drawing
 * and inspector of the window designer. Save gives the edited window back
 * (complete with the catalogue ids), Cancel gives nothing. The panel decides
 * the size and the shape of its window: a size dragged in the drawing goes
 * back to the panel's. Several panels may take the one design: the page
 * fits it to each.
 */

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { DesignCanvasComponent } from '../../shared/design-canvas/design-canvas.component';
import { DesignInspectorComponent, GlassOption } from '../../shared/design-canvas/design-inspector.component';
import { GlassTints, SashFaces } from '../../shared/design-canvas/canvas-renderer';
import { CanvasSelection, CanvasTool } from '../../shared/design-canvas/canvas-view';
import { LeafNode, WindowDesign, findNode, isLeaf } from '../../shared/design-model';
import { Face } from '../../shared/structure-model';
import {
  DesignerCatalog,
  FRAME_FACE_MM,
  handleOptionsFor,
  sashFacesOf,
  sashOptionsFor,
  tintsOf,
} from '../quotation/sub-quotation/sub-quotation-design/designer-catalog';
import { DesignerCatalogService } from '../quotation/sub-quotation/sub-quotation-design/designer-catalog.service';
import { fitDesign } from './panel-designs';

@Component({
  selector: 'app-panel-dialog',
  standalone: true,
  imports: [CommonModule, DesignCanvasComponent, DesignInspectorComponent],
  templateUrl: './panel-dialog.component.html',
  styleUrls: ['./panel-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PanelDialogComponent implements OnInit {
  /** The window of the panel, with the colour and glass of the structure. */
  @Input() design!: WindowDesign;
  /** The panel (the first one when several are chosen): it decides the size and the shape. */
  @Input() face!: Face;
  /** How many panels take the design when it is saved. */
  @Input() panels = 1;
  @Input() title = '';
  @Input() catalog!: DesignerCatalog;
  /** The edited window, complete with the catalogue ids. */
  @Output() saved = new EventEmitter<WindowDesign>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild(DesignCanvasComponent) canvas?: DesignCanvasComponent;
  @ViewChild('box') box?: ElementRef<HTMLElement>;

  readonly frameFaceMm = FRAME_FACE_MM;
  ready = false;
  loadError = '';
  /** Bound to the canvas; a new object resets its undo steps. */
  model!: WindowDesign;
  current!: WindowDesign;
  /** `current` with every catalogue id filled in: what is saved. */
  effective!: WindowDesign;
  selection: CanvasSelection | null = null;
  tab: 'window' | 'pane' = 'window';
  /** On a phone the drawing and the options take turns. */
  view: 'draw' | 'options' = 'draw';
  glassOptions: GlassOption[] = [];
  glassTints: GlassTints = {};
  glassLabels: Record<string, string> = {};
  sashFaces: Partial<SashFaces> = {};
  saving = false;

  private refreshing = 0;
  private seq = 0;
  private waiting: (() => void)[] = [];

  constructor(
    private readonly catalogs: DesignerCatalogService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.glassOptions = this.catalog.glass.map((g) => ({ id: g.id, label: g.label }));
    this.glassTints = tintsOf(this.catalog);
    this.glassLabels = Object.fromEntries(this.catalog.glass.map((g) => [String(g.id), g.label]));
    this.catalogs.complete(this.design, this.catalog).then(
      (done) => {
        this.model = this.current = this.effective = done;
        this.afterCompleted();
        this.ready = true;
        this.cdr.markForCheck();
        setTimeout(() => this.box?.nativeElement.focus());
      },
      (err) => {
        this.loadError = err instanceof Error ? err.message : 'The window could not be opened.';
        this.cdr.markForCheck();
      }
    );
  }

  get selectedLeaf(): LeafNode | null {
    if (this.selection?.type !== 'pane') return null;
    const node = findNode(this.effective.root, this.selection.paneId);
    return node && isLeaf(node) ? node : null;
  }

  get handleOptions(): GlassOption[] {
    return handleOptionsFor(this.catalog, this.effective.productType, this.selectedLeaf);
  }

  get sashOptions(): GlassOption[] {
    return sashOptionsFor(this.catalog, this.effective.productType, this.selectedLeaf);
  }

  get hingeOptions(): string[] {
    return this.catalog.hinges;
  }

  get armedTool(): CanvasTool | null {
    return this.canvas?.armedTool ?? null;
  }

  get dividerSelected(): boolean {
    return this.selection?.type === 'divider';
  }

  get scope(): string {
    return this.panels > 1 ? `This window goes to all ${this.panels} panels, each fitted to its own size.` : 'The panel decides the shape and the size of its window.';
  }

  /** A drawing change: the panel's size and shape come back if the drawing moved them. */
  onModelChange(next: WindowDesign): void {
    const fitted = fitDesign(next, this.face);
    if (fitted && fitted !== next) {
      this.canvas?.apply(fitted);
      return;
    }
    this.current = next;
    void this.refresh();
  }

  onSelectionChange(sel: CanvasSelection | null): void {
    this.selection = sel;
    if (sel?.type === 'pane') this.tab = 'pane';
    void this.ensureLists();
    this.cdr.markForCheck();
  }

  /** An inspector edit is one step of the drawing's undo. */
  onInspectorChange(next: WindowDesign): void {
    this.canvas?.apply(next);
  }

  private async refresh(): Promise<void> {
    const seq = ++this.seq;
    this.refreshing++;
    try {
      const done = await this.catalogs.complete(this.current, this.catalog);
      if (seq !== this.seq) return;
      this.effective = done;
      this.afterCompleted();
    } catch (err) {
      if (seq === this.seq) this.loadError = err instanceof Error ? err.message : 'The window could not be completed.';
    } finally {
      this.refreshing--;
      if (!this.refreshing) {
        const waiting = this.waiting;
        this.waiting = [];
        waiting.forEach((go) => go());
      }
      this.cdr.markForCheck();
    }
  }

  private async ensureLists(): Promise<void> {
    try {
      await this.catalogs.ensure(this.current, this.catalog);
    } catch {
      // The completion reports catalogue errors.
    }
    this.cdr.markForCheck();
  }

  private afterCompleted(): void {
    const byId = sashFacesOf(this.catalog);
    if (Object.keys(byId).length !== Object.keys(this.sashFaces.byId ?? {}).length) this.sashFaces = { byId };
  }

  async save(): Promise<void> {
    if (!this.ready || this.saving) return;
    this.saving = true;
    if (this.refreshing) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.saving = false;
    this.saved.emit(this.effective);
  }

  cancel(): void {
    this.cancelled.emit();
  }

  /** Tab goes round the dialog, not out to the page behind it. */
  @HostListener('keydown', ['$event'])
  keepFocus(e: KeyboardEvent): void {
    const box = this.box?.nativeElement;
    if (e.key !== 'Tab' || !box) return;
    const items = Array.from(box.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]')).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const [first, last, now] = [items[0], items[items.length - 1], document.activeElement];
    if (e.shiftKey && (now === first || now === box)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && now === last) {
      e.preventDefault();
      first.focus();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.cancel();
  }
}
