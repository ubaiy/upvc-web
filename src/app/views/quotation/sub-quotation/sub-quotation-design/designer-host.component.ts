/**
 * The window designer inside a quotation (card D1).
 *
 * One source of truth: the WindowDesign document. The canvas draws it and
 * edits it, the inspector edits it, the live price is the pricing endpoint
 * called with its payload, Save stores it, and reopening loads it back.
 *
 *   canvas (modelChange) → current → completeDesign(catalogue) → effective
 *   effective → inspector [design], live price, save
 *   inspector (designChange) → canvas.apply(next)   (one undo stack)
 *
 * A saved window shows its STORED price until the user changes it; opening
 * never reprices. See saved-line.ts for lines saved before the designer.
 */

import { CommonModule, Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, firstValueFrom, of } from 'rxjs';
import { catchError, debounceTime, switchMap } from 'rxjs/operators';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { CanvasSelection, CanvasTool } from 'src/app/shared/design-canvas/canvas-view';
import { GlassTints } from 'src/app/shared/design-canvas/canvas-renderer';
import { DesignCanvasComponent } from 'src/app/shared/design-canvas/design-canvas.component';
import {
  DesignInspectorComponent,
  GlassOption,
} from 'src/app/shared/design-canvas/design-inspector.component';
import {
  FRAME_MAX_MM,
  FRAME_MIN_MM,
  LeafNode,
  WindowDesign,
  createDesign,
  createTemplate,
  findNode,
  fromTemplateRow,
  instantiateTemplate,
  isLeaf,
  serialize,
  toTemplateRequest,
} from 'src/app/shared/design-model';
import { ToastService } from 'src/app/shared/services/toast.service';
import { DesignTemplateStore } from '../../../design-lab/design-template-store.service';
import { QuotationService } from '../../quotation.service';
import {
  DesignerCatalog,
  completeDesign,
  handlesFor,
  systemKeyOf,
} from './designer-catalog';
import { DesignerCatalogService } from './designer-catalog.service';
import {
  PriceLine,
  buildManageProductBody,
  priceLinesOf,
  ratePerSqFt,
  sellingAmount,
} from './designer-request';
import { OpenedLine, openSavedLine } from './saved-line';
import { DesignThumb, STARTING_DESIGNS, StartingDesign, thumbOf } from './starting-designs';

const FRAME_FACE_MM = 60;

type PriceState = 'loading' | 'live' | 'stored' | 'error';

interface PriceView {
  state: PriceState;
  /** Selling price of the line (margin included, quantity applied). */
  amount: number;
  cost: number;
  areaSqFt: number;
  rate: number;
  lines: PriceLine[];
  message: string;
}

interface StartCard {
  design: StartingDesign;
  thumb: DesignThumb;
}

interface SavedCard {
  id: number;
  name: string;
  size: string;
  image: string | null;
  place: () => WindowDesign;
}

@Component({
  selector: 'app-designer-host',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SharedComponentsModule,
    DesignCanvasComponent,
    DesignInspectorComponent,
  ],
  templateUrl: './designer-host.component.html',
  styleUrls: ['./designer-host.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesignerHostComponent implements OnInit, OnDestroy {
  @ViewChild(DesignCanvasComponent) canvas?: DesignCanvasComponent;

  readonly frameFaceMm = FRAME_FACE_MM;
  readonly frameMinMm = FRAME_MIN_MM;
  readonly frameMaxMm = FRAME_MAX_MM;

  // --- where we are --------------------------------------------------------
  quotationId = '';
  lineId: string | null = null;
  /** True while an existing line is being edited. */
  edit = false;
  quotationName = '';
  quotationNumber = '';
  marginName = '';
  marginPercent = 0;
  /** "item 3 of 3" / "new window". */
  position = '';

  // --- the window -----------------------------------------------------------
  ready = false;
  loadError = '';
  /** Bound to the canvas; a NEW object resets its undo history. */
  model: WindowDesign = createDesign();
  /** The latest document the canvas emitted. */
  current: WindowDesign = this.model;
  /** `current` with every catalogue id filled in: what is priced and saved. */
  effective: WindowDesign = this.model;
  selection: CanvasSelection | null = null;
  label = '';
  quantity = 1;

  /** A legacy line that could not be converted faithfully. */
  readOnly = false;
  readOnlyReasons: string[] = [];
  /** Shown while a saved window is unchanged and today's price differs. */
  repriceNote = '';

  price: PriceView = this.emptyPrice('loading');
  saving = false;
  saveError = '';
  confirmLeave = false;

  // --- panels ---------------------------------------------------------------
  tab: 'window' | 'pane' = 'window';
  detailsOpen = false;
  templatesOpen = false;
  templateName = '';
  templateMessage = '';
  startCards: StartCard[] = STARTING_DESIGNS.map((design) => ({
    design,
    thumb: thumbOf(design.build()),
  }));
  savedCards: SavedCard[] = [];

  // --- catalogue ------------------------------------------------------------
  catalog!: DesignerCatalog;
  glassOptions: GlassOption[] = [];
  colourOptions: { label: string; hex: string }[] = [];
  glassTints: GlassTints = {};

  private opened: OpenedLine | null = null;
  private openedKey = '';
  private openedQuantity = 1;
  private openedLabel = '';
  private stored: PriceView | null = null;
  private touched = false;
  private lineIds: string[] = [];
  private refreshSeq = 0;
  private readonly price$ = new Subject<void>();
  private priceSub?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly location: Location,
    private readonly quotations: QuotationService,
    private readonly catalogs: DesignerCatalogService,
    private readonly templates: DesignTemplateStore,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  /* ------------------------------------------------------------------ */
  /* Start                                                               */
  /* ------------------------------------------------------------------ */

  ngOnInit(): void {
    const snap = this.route.snapshot;
    this.quotationId = snap.paramMap.get('id') ?? '';
    this.lineId = snap.paramMap.get('subId');
    this.edit = !!snap.data['edit'] && !!this.lineId;
    this.catalog = this.catalogs.fromRouteData(snap.data['dropdowns'], snap.data['mullionList']);
    this.glassOptions = this.catalog.glass.map((g) => ({ id: g.id, label: g.label }));
    this.colourOptions = this.catalog.colours.map((c) => ({ label: c.label, hex: c.hex }));
    this.glassTints = tintsOf(this.catalog);

    this.priceSub = this.price$
      .pipe(
        debounceTime(350),
        switchMap(() => {
          const body = buildManageProductBody(this.effective, this.catalog, this.context());
          return this.quotations
            .quotationManageProduct(body)
            .pipe(catchError(() => of({ success: false, message: '' } as any)));
        })
      )
      .subscribe((res: any) => this.onPriced(res));

    void this.start(snap.data['details']);
  }

  ngOnDestroy(): void {
    this.priceSub?.unsubscribe();
    this.price$.complete();
  }

  private async start(details: any): Promise<void> {
    try {
      await this.loadQuotation();
      let design: WindowDesign;
      if (this.edit) {
        this.opened = openSavedLine(details, { frameFaceMm: FRAME_FACE_MM });
        design = this.opened.design;
        this.quantity = Number(details?.quantity) || 1;
        this.label = details?.label ?? '';
        this.openedQuantity = this.quantity;
        this.openedLabel = this.label;
        this.stored = this.storedPrice(details);
        this.readOnly = !this.opened.faithful;
        this.readOnlyReasons = this.opened.reasons;
      } else {
        design = STARTING_DESIGNS[0].build();
        this.templatesOpen = true;
      }
      await this.catalogs.ensure(design, this.catalog);
      const completed = completeDesign(design, this.catalog);
      this.model = completed;
      this.current = completed;
      this.effective = completed;
      this.openedKey = this.edit ? serialize(completed) : '';
      this.ready = true;
      if (this.edit && this.stored) {
        this.price = this.stored;
        if (!this.readOnly) void this.checkTodaysPrice();
      } else {
        this.requestPrice();
      }
      void this.loadSavedTemplates();
    } catch (err) {
      this.loadError = text(err) || 'The designer could not be opened.';
    }
    this.cdr.markForCheck();
  }

  /** Name, number, margin and the saved selling prices of the quotation. */
  private async loadQuotation(): Promise<void> {
    const res: any = await firstValueFrom(this.quotations.getQuotationDetail(this.quotationId as any));
    if (!res?.success) throw new Error(res?.message || 'The quotation could not be loaded.');
    const q = res.data;
    this.quotationName = q.quatation_name || q.customer?.name || 'Quotation';
    this.quotationNumber = q.number || '';
    this.marginPercent = Number(q.totals?.margin?.percent ?? q.margin_percent) || 0;
    this.marginName = q.totals?.margin?.name ?? '';
    this.lineIds = ((q.quatation_product ?? []) as any[]).map((p) => String(p.id));
    this.totalsItems = (q.totals?.items ?? []) as any[];
    const n = this.lineIds.length;
    const at = this.lineId ? this.lineIds.indexOf(String(this.lineId)) : -1;
    this.position = at >= 0 ? `item ${at + 1} of ${n}` : `new item, ${n + 1} of ${n + 1}`;
  }

  private totalsItems: any[] = [];

  /** The price a saved line carries, as the api reports it. */
  private storedPrice(details: any): PriceView {
    const cost = Number(details?.total) || 0;
    const area = Number(details?.total_sq_ft) || 0;
    const item = this.totalsItems.find((i) => String(i.id) === String(this.lineId));
    const amount = item ? Number(item.amount) : sellingAmount(cost, this.marginPercent);
    return {
      state: 'stored',
      amount,
      cost,
      areaSqFt: item ? Number(item.area_sq_ft) : area,
      rate: item ? Number(item.rate_per_sq_ft) : ratePerSqFt(amount, area),
      lines: priceLinesOf(details),
      message: '',
    };
  }

  private emptyPrice(state: PriceState, message = ''): PriceView {
    return { state, amount: 0, cost: 0, areaSqFt: 0, rate: 0, lines: [], message };
  }

  private context(): { quotationId: string; lineId: string | null; quantity: number; label: string; frameFaceMm: number } {
    return {
      quotationId: this.quotationId,
      lineId: this.lineId,
      quantity: this.quantity,
      label: this.label,
      frameFaceMm: FRAME_FACE_MM,
    };
  }

  /* ------------------------------------------------------------------ */
  /* The document                                                        */
  /* ------------------------------------------------------------------ */

  /** True when the window differs from what was opened (always, for a new one). */
  get changed(): boolean {
    if (!this.edit) return true;
    return serialize(this.effective) !== this.openedKey || this.quantity !== this.openedQuantity;
  }

  get dirty(): boolean {
    return this.edit ? this.changed || this.label !== this.openedLabel : this.touched;
  }

  onModelChange(next: WindowDesign): void {
    this.current = next;
    this.touched = true;
    void this.refresh();
  }

  onSelectionChange(sel: CanvasSelection | null): void {
    this.selection = sel;
    if (sel?.type === 'pane') this.tab = 'pane';
    void this.ensureForSelection();
  }

  /** Inspector edit → one step on the canvas undo stack. */
  onInspectorChange(next: WindowDesign): void {
    this.canvas?.apply(next);
  }

  /** Complete the latest document and bring the price up to date. */
  private async refresh(): Promise<void> {
    const seq = ++this.refreshSeq;
    try {
      await this.catalogs.ensure(this.current, this.catalog);
    } catch (err) {
      if (seq !== this.refreshSeq) return;
      this.price = this.emptyPrice('error', text(err));
      this.cdr.markForCheck();
      return;
    }
    if (seq !== this.refreshSeq) return;
    this.effective = completeDesign(this.current, this.catalog);
    this.saveError = '';
    if (this.changed) {
      this.requestPrice();
    } else if (this.stored) {
      this.price = this.stored;
    }
    this.cdr.markForCheck();
  }

  private requestPrice(): void {
    this.price = { ...this.price, state: 'loading', message: '' };
    this.price$.next();
  }

  retryPrice(): void {
    void this.refresh();
  }

  private onPriced(res: any): void {
    if (!this.changed && this.stored) {
      // The user undid back to the saved window while the request was out.
      this.price = this.stored;
    } else if (res?.success) {
      const cost = Number(res.data.total) || 0;
      const area = Number(res.data.total_sq_ft) || 0;
      const amount = sellingAmount(cost, this.marginPercent);
      this.price = {
        state: 'live',
        amount,
        cost,
        areaSqFt: Math.round(area * 100) / 100,
        rate: ratePerSqFt(amount, area),
        lines: priceLinesOf(res.data),
        message: '',
      };
    } else {
      this.price = this.emptyPrice('error', res?.message || 'The price could not be worked out.');
    }
    this.cdr.markForCheck();
  }

  /**
   * One quiet check when a saved window opens: what would it cost today?
   * The answer is only reported, never applied.
   */
  private async checkTodaysPrice(): Promise<void> {
    const stored = this.stored;
    if (!stored) return;
    try {
      const body = buildManageProductBody(this.effective, this.catalog, this.context());
      const res: any = await firstValueFrom(this.quotations.quotationManageProduct(body));
      if (!res?.success || this.changed) return;
      const today = Number(res.data.total) || 0;
      if (Math.abs(today - stored.cost) >= 0.01) {
        this.repriceNote = String(sellingAmount(today, this.marginPercent));
        this.cdr.markForCheck();
      }
    } catch {
      // Purely informative.
    }
  }

  get repriceAmount(): number {
    return Number(this.repriceNote) || 0;
  }

  /* ------------------------------------------------------------------ */
  /* Whole-window fields                                                 */
  /* ------------------------------------------------------------------ */

  get widthMm(): number {
    return Math.round(this.current.frame.widthMm);
  }

  get heightMm(): number {
    return Math.round(this.current.frame.heightMm);
  }

  onSize(which: 'w' | 'h', raw: string): void {
    this.canvas?.onFrameSizeInput(which, raw);
  }

  get quantityValid(): boolean {
    return Number.isInteger(this.quantity) && this.quantity >= 1 && this.quantity <= 10000;
  }

  onQuantity(raw: string): void {
    this.quantity = Number(raw);
    this.touched = true;
    if (this.quantityValid) void this.refresh();
  }

  onLabel(value: string): void {
    this.label = value;
    this.touched = true;
  }

  /* ------------------------------------------------------------------ */
  /* Selected pane: the hardware lists of ITS system                     */
  /* ------------------------------------------------------------------ */

  get selectedLeaf(): LeafNode | null {
    if (this.selection?.type !== 'pane') return null;
    const node = findNode(this.effective.root, this.selection.paneId);
    return node && isLeaf(node) ? node : null;
  }

  get handleOptions(): GlassOption[] {
    const leaf = this.selectedLeaf;
    if (!leaf || leaf.category !== 'Casement') return [];
    return handlesFor(this.catalog, 'Casement', this.effective.productType);
  }

  get hingeOptions(): string[] {
    return this.catalog.hinges;
  }

  get sashOptions(): GlassOption[] {
    const leaf = this.selectedLeaf;
    if (!leaf) return [];
    return this.catalog.systems[systemKeyOf(this.effective.productType, leaf)]?.sashes ?? [];
  }

  private async ensureForSelection(): Promise<void> {
    try {
      await this.catalogs.ensure(this.current, this.catalog);
    } catch {
      // The price refresh reports catalogue errors.
    }
    this.cdr.markForCheck();
  }

  /* ------------------------------------------------------------------ */
  /* Tools                                                               */
  /* ------------------------------------------------------------------ */

  get armedTool(): CanvasTool | null {
    return this.canvas?.armedTool ?? null;
  }

  selectTool(): void {
    this.canvas?.armTool(null);
  }

  get dividerSelected(): boolean {
    return this.selection?.type === 'divider';
  }

  get parts(): number {
    return this.price.lines.length;
  }

  /* ------------------------------------------------------------------ */
  /* Starting designs and templates                                      */
  /* ------------------------------------------------------------------ */

  toggleTemplates(): void {
    this.templatesOpen = !this.templatesOpen;
    this.templateMessage = '';
  }

  useStart(card: StartCard): void {
    const built = card.design.build();
    const w = card.design.ownSize ? built.frame.widthMm : this.current.frame.widthMm;
    const h = card.design.ownSize ? built.frame.heightMm : this.current.frame.heightMm;
    void this.place(built, card.design.label, w, h);
  }

  useSaved(card: SavedCard): void {
    const d = card.place();
    void this.place(d, card.name, d.frame.widthMm, d.frame.heightMm);
  }

  private async place(design: WindowDesign, name: string, w: number, h: number): Promise<void> {
    if (this.readOnly) return;
    try {
      const { design: placed } = instantiateTemplate(createTemplate(design, name), w, h, {
        frameFaceMm: FRAME_FACE_MM,
      });
      // The window keeps the glass and colour already chosen.
      const next: WindowDesign = {
        ...placed,
        frame: {
          ...placed.frame,
          colorId: this.effective.frame.colorId,
          profileColor: this.effective.frame.profileColor,
        },
        glazing: { ...placed.glazing, glassId: this.effective.glazing.glassId },
      };
      await this.catalogs.ensure(next, this.catalog);
      this.canvas?.apply(completeDesign(next, this.catalog));
      this.canvas?.fitToScreen();
      this.templateMessage = '';
    } catch (err) {
      this.templateMessage = `"${name}" does not fit ${Math.round(w)} × ${Math.round(h)} mm: ${text(err)}`;
    }
    this.cdr.markForCheck();
  }

  private async loadSavedTemplates(): Promise<void> {
    try {
      const rows = await this.templates.list();
      this.savedCards = rows.map((row) => {
        const template = fromTemplateRow(row);
        const f = template.design.frame;
        return {
          id: row.id ?? 0,
          name: template.name,
          size: `${Math.round(f.widthMm)} × ${Math.round(f.heightMm)}`,
          image: template.thumbnail.kind === 'dataUrl' ? template.thumbnail.value ?? null : null,
          place: () => template.design,
        };
      });
    } catch {
      this.savedCards = [];
    }
    this.cdr.markForCheck();
  }

  async saveTemplate(): Promise<void> {
    const name = this.templateName.trim();
    if (!name) {
      this.templateMessage = 'Give the template a name first.';
      return;
    }
    const stage = this.canvas?.getStage();
    const thumb = stage ? stage.toDataURL({ pixelRatio: 0.25, mimeType: 'image/png' }) : '';
    try {
      const template = createTemplate(this.effective, name, {
        thumbnail: thumb ? { kind: 'dataUrl', value: thumb } : { kind: 'none' },
      });
      await this.templates.add(toTemplateRequest(template));
      this.templateName = '';
      this.templateMessage = `Saved "${name}" to your templates.`;
      await this.loadSavedTemplates();
    } catch (err) {
      this.templateMessage = `The template could not be saved: ${text(err)}`;
    }
    this.cdr.markForCheck();
  }

  async deleteTemplate(card: SavedCard, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.templates.remove(card.id);
      await this.loadSavedTemplates();
    } catch (err) {
      this.templateMessage = `The template could not be deleted: ${text(err)}`;
      this.cdr.markForCheck();
    }
  }

  /* ------------------------------------------------------------------ */
  /* A legacy window that cannot be edited safely                        */
  /* ------------------------------------------------------------------ */

  redraw(): void {
    const { widthMm, heightMm } = this.effective.frame;
    const fresh = completeDesign(
      createDesign({
        frame: {
          widthMm,
          heightMm,
          colorId: this.effective.frame.colorId,
          profileColor: this.effective.frame.profileColor,
        },
        glazing: { glassId: this.effective.glazing.glassId },
      }),
      this.catalog
    );
    this.readOnly = false;
    this.readOnlyReasons = [];
    this.repriceNote = '';
    this.model = fresh;
    this.current = fresh;
    this.selection = null;
    this.templatesOpen = true;
    this.touched = true;
    void this.refresh();
  }

  /* ------------------------------------------------------------------ */
  /* Save and leave                                                      */
  /* ------------------------------------------------------------------ */

  get canSave(): boolean {
    return (
      this.ready &&
      !this.readOnly &&
      !this.saving &&
      this.quantityValid &&
      this.price.state !== 'error' &&
      this.price.state !== 'loading'
    );
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void this.save(false);
    } else if (e.key === 'Escape') {
      this.detailsOpen = false;
      this.confirmLeave = false;
    }
  }

  async save(another: boolean): Promise<void> {
    if (!this.canSave) return;
    this.saving = true;
    this.saveError = '';
    this.cdr.markForCheck();
    try {
      if (this.edit && !this.changed) {
        // Nothing that affects the price changed: the stored line stays as it is.
        if (this.label !== this.openedLabel && this.lineId) {
          const res: any = await firstValueFrom(
            this.quotations.updateLineDetails(Number(this.lineId), { label: this.label.trim() })
          );
          if (!res?.success) throw new Error(res?.message || 'The name could not be saved.');
        }
        this.toast.showSuccess('Window saved.');
      } else {
        const body = buildManageProductBody(this.effective, this.catalog, this.context(), {
          image: this.picture(),
        });
        const res: any = await firstValueFrom(this.quotations.quotationManageProduct(body));
        if (!res?.success) throw new Error(res?.message || 'The window could not be saved.');
        this.toast.showSuccess(another ? 'Window saved. The next one starts from the same design.' : 'Window saved.');
      }
      this.saving = false;
      if (another) this.startNext();
      else void this.router.navigate(['/quotation/detail', this.quotationId]);
    } catch (err) {
      this.saving = false;
      this.saveError = text(err) || 'The window could not be saved.';
    }
    this.cdr.markForCheck();
  }

  /** PNG of the drawing with nothing selected, small enough for the api. */
  private picture(): string | null {
    const canvas = this.canvas;
    const stage = canvas?.getStage();
    if (!canvas || !stage) return null;
    canvas.armTool(null);
    canvas.setSelection(null);
    canvas.fitToScreen();
    let png = stage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' });
    if (png.length > 320_000) png = stage.toDataURL({ pixelRatio: 0.5, mimeType: 'image/png' });
    return png;
  }

  /** "Save and add another": the next window starts as a copy of this one. */
  private startNext(): void {
    const next: WindowDesign = { ...this.effective };
    this.edit = false;
    this.lineId = null;
    this.opened = null;
    this.openedKey = '';
    this.stored = null;
    this.repriceNote = '';
    this.label = '';
    this.quantity = 1;
    this.touched = false;
    this.lineIds = [...this.lineIds, 'new'];
    const n = this.lineIds.length;
    this.position = `new item, ${n + 1} of ${n + 1}`;
    this.model = next;
    this.current = next;
    this.effective = next;
    this.selection = null;
    this.tab = 'window';
    this.location.replaceState(`/quotation/detail/${this.quotationId}/add/${n}`);
    this.requestPrice();
  }

  back(): void {
    if (this.dirty && !this.confirmLeave) {
      this.confirmLeave = true;
      return;
    }
    void this.router.navigate(['/quotation/detail', this.quotationId]);
  }

  stay(): void {
    this.confirmLeave = false;
  }

  trackKey(_: number, card: StartCard): string {
    return card.design.key;
  }
}

function text(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? '');
}

/** A drawing tint for each glass, from its name (the catalogue has no colour). */
function tintsOf(catalog: DesignerCatalog): GlassTints {
  const rules: [RegExp, string][] = [
    [/no glass/i, '#ffffff'],
    [/black/i, '#8a9099'],
    [/brown|bronze/i, '#c9a27a'],
    [/blue/i, '#8fb8e0'],
    [/green/i, '#9fd3b4'],
    [/frost|wash/i, '#e8eef2'],
    [/reflect/i, '#a9c7d6'],
  ];
  const out: GlassTints = {};
  for (const g of catalog.glass) {
    const hit = rules.find(([re]) => re.test(g.label));
    if (hit) out[String(g.id)] = hit[1];
  }
  return out;
}
