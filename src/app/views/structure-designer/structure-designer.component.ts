/**
 * Structure designer — design a dome, a cabin, a bay, a lantern roof or a
 * conservatory in 3D (card T100). The document is "upvc.structure/1"
 * (shared/structure-model); this screen only shows it and sends operations.
 *
 * It is opened from a quotation (card T123): the structure is a line of that
 * quotation. The api prices it on every change (the price bar) and keeps the
 * document, the picture and the price when it is saved. Sizes shown are
 * geometric centre-line sizes; every amount is the api's.
 *
 * Everything the structure is made of is a row of the company's catalogue:
 * each wall panel is a real window (edited in a dialog with the drawing and
 * inspector of the window designer), the glass, colour, bars and hubs are
 * chosen from dropdowns. No screen asks for a rate.
 */

import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { from, of, Subject, Subscription } from 'rxjs';
import { catchError, debounceTime, map, switchMap } from 'rxjs/operators';
import {
  barSection,
  createStructure,
  defaultParams,
  formatPlan,
  FREE,
  planOf,
  Pt,
  ROOF_LABEL,
  roofRefusal,
  RoofKind,
  Dim,
  Face,
  FILL_LABEL,
  FillKey,
  groupFaceIds,
  History,
  Joint,
  jointLengthMm,
  normalizeParams,
  Params,
  paramsOf,
  ParamSpec,
  parseStructure,
  renameStructure,
  retemplate,
  serializeStructure,
  setBarProfile,
  setFaceFill,
  setFaceGlass,
  setFaceProduct,
  setHubItem,
  isWindowBar,
  SHAPE_LABEL,
  Structure,
  summarize,
  Summary,
  TemplateDef,
  TEMPLATES,
} from '../../shared/structure-model';
import { environment } from '../../../environments/environment';
import { WorkspaceService } from '../../containers/shell/workspace.service';
import { InrPipe } from '../../shared/pipes/inr.pipe';
import { customerSheet, sheetFacts } from './customer-sheet';
import { PlanChange, PlanEditorComponent } from './plan-editor.component';
import { DesignerCatalog, FRAME_FACE_MM, tintsOf } from '../quotation/sub-quotation/sub-quotation-design/designer-catalog';
import { DesignerCatalogService } from '../quotation/sub-quotation/sub-quotation-design/designer-catalog.service';
import { WindowDesign } from '../../shared/design-model';
import { applyDesign, withWindows } from './panel-designs';
import { PanelDialogComponent } from './panel-dialog.component';
import { plainRefusal, StructureApiError, StructureCostRow, StructureLineService, StructurePrice, StructurePriceRequest } from './structure-line.service';
import {
  barChoices,
  BarControl,
  barControls,
  Choice,
  colourChoices,
  controlOf,
  firstChoices,
  glassChoices,
  HubControl,
  hubControls,
  setStructureColour,
  setStructureGlass,
} from './structure-choices';
import { FaceInfo, faceInfoOf } from './selection-info';
import { windowsAndDocument } from './structure-request';
import { windowDesigns } from './structure-windows';
import { BrowserStructureStore, StructureStore, StructureSummary } from './structure-store.service';
import { PickTarget, StructureLook } from './three/structure-mesh';
import { LabelPosition, OrbitBenchmark, StructureScene, ViewInsets, ViewPreset, webglAvailable } from './three/structure-scene';

export { canSlide } from './selection-info';

type Sheet = 'shape' | 'panel' | 'parts';

/**
 * What the price bar shows. `refused`: the api answered and said no (something
 * is not chosen yet); `failed`: no answer. Neither ever shows an amount.
 */
export interface PriceView {
  state: 'idle' | 'loading' | 'ready' | 'refused' | 'failed';
  /** The last answer; kept (dimmed) while the next one is on its way. */
  data: StructurePrice | null;
  message: string;
  /** What the refusal asks to be chosen ("glass", "solid_panel", "bar.rafter"): the page opens that control. */
  missing: string;
}

/** A change is priced once it has rested this long. */
export const PRICE_DEBOUNCE_MS = 350;
/** The picture of the quotation line: the api takes 2 MB at most. */
const LINE_PICTURE_MAX = 1_900_000;

/** From this width the panels lie over the 3D view; under it they are one bottom sheet. */
const OVERLAY_FROM_PX = 1100;
/** From this width both panels start open. */
const OPEN_FROM_PX = 1200;
/** What the plan of a from-scratch structure covers beside the left panel, CSS px (.sd-plan-dock). */
const PLAN_DOCK = 452;
/** What an open panel and the toolbars cover of the 3D view, CSS px (structure-designer.component.scss). */
const COVER = { left: 268, right: 324, top: 56, bottom: 30 };

@Component({
  selector: 'app-structure-designer',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, InrPipe, PlanEditorComponent, PanelDialogComponent],
  templateUrl: './structure-designer.component.html',
  styleUrls: ['./structure-designer.component.scss', './structure-designer-choices.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StructureDesignerComponent implements AfterViewInit, OnDestroy {
  readonly templates = TEMPLATES;
  readonly fillKeys: FillKey[] = ['fixed', 'casement', 'top-hung', 'door', 'sliding', 'panel', 'open'];
  readonly fillLabel = FILL_LABEL;
  readonly shapeLabel = SHAPE_LABEL;
  readonly views: { key: ViewPreset; label: string }[] = [
    { key: '3d', label: '3D' },
    { key: 'front', label: 'Front' },
    { key: 'side', label: 'Side' },
    { key: 'top', label: 'Top' },
  ];

  /** "Start from scratch": the plan is being drawn and there is no structure yet. */
  drawing = false;
  /** The plan of a structure drawn from nothing, beside its 3D view. */
  planOpen = false;
  /** The plan the editor shows; the same list until the plan changes. */
  planPts: Pt[] | null = null;

  /** Pictures of the start cards, by template kind. Empty until drawn (or with no WebGL). */
  thumbnails: Record<string, string> = {};
  webgl = webglAvailable();
  history: History<Structure> | null = null;
  def: TemplateDef | null = null;
  params: Params = {};
  dims: Dim[] = [];
  summary: Summary | null = null;
  selectedFaces: string[] = [];
  selectedBar: string | null = null;
  sheet: Sheet = 'shape';
  /** The bottom sheet of a narrow window, and the two panels of a wide one: folded away until there is room. */
  sheetOpen = false;
  leftOpen = window.innerWidth >= OPEN_FROM_PX;
  rightOpen = window.innerWidth >= OPEN_FROM_PX;
  editingDim: string | null = null;
  dimDraft = '';
  /** The saved structure this one was opened from, or was last saved as. */
  savedId: string | null = null;
  saving = false;
  openList = false;
  message = '';
  showDims = true;

  /** The quotation this structure is a line of; null only outside a quotation (no price, no save). */
  readonly quotationId: number | null;
  /** How many of this structure the line carries. */
  quantity = 1;
  /** A typed price for one structure; null = the api's computed price. */
  manualPrice: number | null = null;
  manualDraft = '';
  manualOpen = false;
  price: PriceView = { state: 'idle', data: null, message: '', missing: '' };
  detailsOpen = false;
  /** Why the last save was refused; shown in the price bar until the next change. */
  saveError = '';
  /** Structures saved in this browser before they lived in quotations: each can be brought in. */
  deviceStructures: StructureSummary[] = [];
  /** The browser's copy this structure was brought in from; removed once the quotation has it. */
  private importedFrom: string | null = null;

  /** The catalogue the structure is made from: the rows of the company, as the window designer reads them. */
  readonly catalog: DesignerCatalog;
  readonly glassChoices: Choice[];
  readonly colourChoices: Choice[];
  readonly barChoices: Choice[];
  /** Hardware items a hub can be; fetched when the structure has hubs. */
  hardwareChoices: Choice[] = [];
  /** How each glass of the catalogue is drawn. */
  private readonly glassTints: Record<string, string>;
  /** The control a refusal asked for, marked until the next change. */
  asked = '';
  /** What had the keyboard when the dialog of a panel was opened. */
  private opener: HTMLElement | null = null;
  /** The window of a wall panel being edited in the dialog; null = no dialog. */
  panelEdit: { faceIds: string[]; face: Face; design: WindowDesign; title: string } | null = null;

  private readonly priceAsk = new Subject<() => Promise<StructurePriceRequest>>();
  private readonly subs = new Subscription();
  private scene: StructureScene | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private observer: ResizeObserver | null = null;
  /** The document before a slider or handle gesture began; the gesture is one undo step. */
  private gestureBase: Structure | null = null;
  private messageTimer = 0;
  /** The label element of each dimension and where it was last put. */
  private readonly labelEls = new Map<string, { el: HTMLElement; at: string }>();

  @ViewChild('labels') private labelLayer?: ElementRef<HTMLElement>;
  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;

  /** The canvas exists only while a structure is open: the scene is made and thrown away with it. */
  @ViewChild('canvas') set canvasRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    const el = ref?.nativeElement ?? null;
    if (el === this.canvasEl) return;
    this.dropScene();
    this.canvasEl = el;
    if (el && this.webgl) this.zone.runOutsideAngular(() => this.makeScene(el));
  }

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly host: ElementRef<HTMLElement>,
    private readonly zone: NgZone,
    private readonly store: StructureStore,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly workspace: WorkspaceService,
    private readonly lines: StructureLineService,
    private readonly device: BrowserStructureStore,
    private readonly catalogs: DesignerCatalogService
  ) {
    const query = this.route.snapshot.queryParamMap;
    const params = this.route.snapshot.paramMap;
    // The routes load the same dropdowns and mullion profiles as the window designer.
    const data = this.route.snapshot.data ?? {};
    this.catalog = this.catalogs.fromRouteData(data['dropdowns'], data['mullionList']);
    this.glassChoices = glassChoices(this.catalog);
    this.colourChoices = colourChoices(this.catalog);
    this.barChoices = barChoices(this.catalog);
    this.glassTints = tintsOf(this.catalog);
    const kind = query.get('kind');
    this.quotationId = Number(params?.get('id')) || null;
    const id = params?.get('lineId') ?? query.get('id');
    this.subs.add(
      this.priceAsk
        .pipe(
          debounceTime(PRICE_DEBOUNCE_MS),
          switchMap((build) =>
            from(build()).pipe(
              switchMap((request) => this.lines.price(request)),
              map((data): PriceView => ({ state: 'ready', data, message: '', missing: '' })),
              catchError((e: Error) => {
                const refused = e instanceof StructureApiError && e.refused;
                return of<PriceView>({ state: refused ? 'refused' : 'failed', data: null, message: refused ? plainRefusal(e.message) : e instanceof StructureApiError ? e.message : 'We could not reach the server. Check your connection.', missing: e instanceof StructureApiError ? e.missing : '' });
              })
            )
          )
        )
        .subscribe((view) => {
          this.price = view;
          if (view.state === 'refused' && view.missing) this.reveal(view.missing);
          this.cdr.markForCheck();
        })
    );
    if (this.quotationId) this.device.list().subscribe((rows) => (this.deviceStructures = rows));
    if (id) this.openSaved(id);
    else if (kind && TEMPLATES.some((t) => t.kind === kind)) this.start(kind);
    // For the end-to-end script and the frame-rate measurement of the review log; not in a production build.
    if (!environment.production) (window as unknown as Record<string, unknown>)['structureDesigner'] = this;
  }

  get structure(): Structure | null {
    return this.history?.present ?? null;
  }

  ngAfterViewInit(): void {
    if (!this.structure && this.webgl) setTimeout(() => this.drawThumbnails(), 30);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.pushInsets(false);
  }

  /** Tell the scene what the open panels cover, so Fit centres the structure in what is left. */
  private pushInsets(refit: boolean): void {
    const wide = window.innerWidth >= OVERLAY_FROM_PX;
    const insets: ViewInsets = {
      left: (wide && this.leftOpen ? COVER.left : 0) + (wide && this.planOpen && this.isFree ? PLAN_DOCK : 0),
      right: wide && this.rightOpen ? COVER.right : 0,
      top: COVER.top,
      bottom: wide ? COVER.bottom : 0,
    };
    this.zone.runOutsideAngular(() => this.scene?.setInsets(insets, refit));
  }

  /** Fold a panel away or bring it back; the structure is fitted again to the free part of the view. */
  togglePanel(side: 'left' | 'right', open: boolean): void {
    if (side === 'left') this.leftOpen = open;
    else this.rightOpen = open;
    this.pushInsets(true);
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.dropScene();
    window.clearTimeout(this.messageTimer);
    const w = window as unknown as Record<string, unknown>;
    if (w['structureDesigner'] === this) delete w['structureDesigner'];
  }

  // --- start screen ---

  /** One small throw-away scene draws every card, then gives its GPU context back. */
  private drawThumbnails(): void {
    if (this.structure || Object.keys(this.thumbnails).length) return;
    this.zone.runOutsideAngular(() => {
      let scene: StructureScene | null = null;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 480;
        canvas.height = 360;
        scene = new StructureScene(canvas, true);
        const pictures: Record<string, string> = {};
        for (const t of TEMPLATES) {
          scene.setStructure(createStructure(t.kind), [], false);
          pictures[t.kind] = scene.snapshot(480, 360, true);
        }
        this.thumbnails = pictures;
      } catch {
        this.thumbnails = {};
      } finally {
        scene?.dispose();
      }
    });
    this.cdr.markForCheck();
  }

  start(kind: string): void {
    this.open(createStructure(kind), null);
  }

  /** "Start from scratch": an empty plot; the structure exists once the plan is closed. */
  startScratch(): void {
    this.drawing = true;
    this.cdr.markForCheck();
  }

  /** The plan was closed (or a ready plan taken): walls rise from it, and the plan stays open beside the 3D view. */
  planDrawn(plan: Pt[]): void {
    this.drawing = false;
    this.open(createStructure(FREE.kind, { plan: formatPlan(plan) }), null);
    this.togglePlan();
  }

  /** A corner or a side is being dragged in the plan: the 3D view follows. */
  planPreview(change: PlanChange): void {
    this.preview({ plan: formatPlan(change.plan), walls: change.walls });
  }

  /** A change of the plan is finished: one undo step. */
  planChanged(change: PlanChange): void {
    this.commit({ plan: formatPlan(change.plan), walls: change.walls });
  }

  get isFree(): boolean {
    return this.def?.kind === FREE.kind;
  }

  /** The plan lies over the left of the 3D view; the parts panel folds away to leave the structure room, and the view is fitted to what is free. */
  togglePlan(): void {
    this.planOpen = !this.planOpen;
    if (this.planOpen && window.innerWidth < 1800) this.rightOpen = false;
    this.pushInsets(true);
    this.cdr.markForCheck();
  }

  /** The choices of a parameter that can be built as the structure is now. */
  optionsOf(spec: ParamSpec): { value: string; label: string }[] {
    return spec.optionsFor ? spec.optionsFor(this.params) : spec.options ?? [];
  }

  /** The roofs this plan cannot carry, each with the reason. */
  get roofNotes(): string[] {
    if (!this.isFree || !this.planPts) return [];
    const plan = this.planPts;
    const reasons = (Object.keys(ROOF_LABEL) as RoofKind[]).map((k) => roofRefusal(plan, k)).filter((r) => !!r);
    return [...new Set(reasons)];
  }

  /** A document ready to show: every wall panel has its window, and what the catalogue can choose is chosen. */
  private prepared(structure: Structure): Structure {
    return firstChoices(withWindows(structure), this.catalog);
  }

  private open(structure: Structure, savedId: string | null): void {
    this.history = new History(this.prepared(structure));
    this.savedId = savedId;
    this.selectedFaces = [];
    this.selectedBar = null;
    this.gestureBase = null;
    this.sheet = 'shape';
    this.openList = false;
    this.planOpen = false;
    this.refresh(true);
  }

  /** A structure line of the quotation, opened with "Edit" (…/structure/:lineId). */
  private openSaved(id: string): void {
    this.store.get(id).subscribe({
      next: (saved) => {
        this.quantity = saved.quantity ?? 1;
        this.manualPrice = saved.manualPrice ?? null;
        this.open(saved.document, saved.id);
        this.cdr.markForCheck();
      },
      error: (e: Error) => this.say(e.message),
    });
  }

  /** A structure saved in this browser, brought in as a new line of this quotation. It stays on the device until the line is saved. */
  importDevice(row: StructureSummary): void {
    this.device.get(row.id).subscribe({
      next: (saved) => {
        this.open(saved.document, null);
        this.importedFrom = saved.id;
        this.cdr.markForCheck();
      },
      error: (e: Error) => this.say(e.message),
    });
  }

  get quotationLink(): unknown[] {
    return ['/quotation/detail', this.quotationId];
  }

  /** Back: a saved line goes back to its quotation, a new one to the shapes. */
  back(): void {
    if (this.savedId && this.quotationId) void this.router.navigate(this.quotationLink);
    else this.close();
  }

  /** Back to the start screen. */
  close(): void {
    this.history = null;
    this.drawing = false;
    this.planOpen = false;
    this.planPts = null;
    this.def = null;
    this.summary = null;
    this.dims = [];
    this.savedId = null;
    this.importedFrom = null;
    this.quantity = 1;
    this.manualPrice = null;
    this.detailsOpen = this.manualOpen = false;
    this.panelEdit = null;
    this.asked = '';
    this.price = { state: 'idle', data: null, message: '', missing: '' };
    this.cdr.markForCheck();
    if (this.webgl) setTimeout(() => this.drawThumbnails(), 30);
  }

  // --- the scene ---

  private makeScene(el: HTMLCanvasElement): void {
    try {
      this.scene = new StructureScene(el);
    } catch {
      this.webgl = false;
      this.cdr.markForCheck();
      return;
    }
    const scene = this.scene;
    scene.onPick = (hit, additive) => this.zone.run(() => this.pick(hit, additive));
    scene.onDimDrag = (id, value, phase) => this.zone.run(() => this.dragDim(id, value, phase));
    scene.onLabels = (labels) => this.placeLabels(labels);
    const host = el.parentElement as HTMLElement;
    // The view changes size when the price bar above it gains or loses a line, when the window is
    // resized and once the page has laid itself out: the structure is fitted again to what is free.
    let fittedFor: { w: number; h: number } | null = null;
    const size = (): void => {
      const [w, h] = [host.clientWidth, host.clientHeight];
      scene.resize(w, h);
      // Not before the structure is in the scene: the first fit is the one that sets the direction of view.
      if (!fittedFor || !this.structure || (Math.abs(w - fittedFor.w) < 12 && Math.abs(h - fittedFor.h) < 12)) return;
      fittedFor = { w, h };
      scene.fit(true);
    };
    size();
    this.observer = new ResizeObserver(size);
    this.observer.observe(host);
    this.pushInsets(false);
    if (this.structure) {
      scene.setStructure(this.structure, this.dims, true, this.look);
      scene.setSelection(this.selectedFaces, this.selectedBar);
      scene.setGizmosVisible(this.showDims);
    }
    fittedFor = { w: host.clientWidth, h: host.clientHeight };
  }

  private dropScene(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.scene?.dispose();
    this.scene = null;
  }

  /** Labels are moved straight in the DOM on every frame; Angular is not asked to check anything. */
  private placeLabels(labels: LabelPosition[]): void {
    const layer = this.labelLayer?.nativeElement;
    if (!layer) return;
    for (const l of labels) {
      let known = this.labelEls.get(l.id);
      if (!known || !known.el.isConnected) {
        const el = layer.querySelector<HTMLElement>(`[data-dim="${l.id}"]`);
        if (!el) continue;
        known = { el, at: '' };
        this.labelEls.set(l.id, known);
      }
      const at = l.visible ? `translate(-50%, -50%) translate(${Math.round(l.x)}px, ${Math.round(l.y)}px)` : 'hidden';
      if (at === known.at) continue;
      known.at = at;
      if (l.visible) known.el.style.transform = at;
      known.el.style.visibility = l.visible ? 'visible' : 'hidden';
    }
  }

  /** What the 3D view takes from the catalogue: how the windows and the glass are drawn. */
  private get look(): StructureLook {
    return { frameFaceMm: FRAME_FACE_MM, glassTints: this.glassTints };
  }

  /** Everything read off the document again; the 3D view rebuilt. */
  private refresh(refit: boolean | 'auto' = false): void {
    const s = this.structure;
    if (!s) return;
    const own = paramsOf(s);
    this.def = own?.def ?? null;
    this.params = own?.params ?? {};
    this.dims = own ? own.def.dims(own.params) : [];
    const plan = own?.def.kind === FREE.kind ? planOf(own.params) : null;
    if (!plan || !this.planPts || formatPlan(plan) !== formatPlan(this.planPts)) this.planPts = plan;
    this.summary = summarize(s);
    const faces = new Set(s.faces.map((f) => f.id));
    this.selectedFaces = this.selectedFaces.filter((id) => faces.has(id));
    if (this.selectedBar && !s.joints.some((j) => j.id === this.selectedBar)) this.selectedBar = null;
    this.zone.runOutsideAngular(() => {
      this.scene?.setStructure(s, this.dims, refit, this.look);
      this.scene?.setSelection(this.selectedFaces, this.selectedBar);
    });
    this.loadHardware();
    this.askPrice();
    this.cdr.markForCheck();
  }

  // --- the price (the api's; nothing is worked out here) ---

  /** Ask the api what this structure costs now. Debounced; an older answer is dropped. */
  private askPrice(): void {
    const s = this.structure;
    const summary = this.summary;
    const quotationId = this.quotationId;
    if (!quotationId || !s || !summary) return;
    this.saveError = '';
    this.asked = '';
    this.price = { ...this.price, state: 'loading' };
    const [quantity, unitPrice] = [this.quantity, this.manualPrice];
    this.priceAsk.next(async () => ({
      quatation_id: quotationId,
      structure_type: s.template?.kind ?? 'free',
      quantity,
      unit_price: unitPrice,
      summary,
      ...(await windowsAndDocument(s, quotationId, this.catalogs, this.catalog)),
    }));
  }

  setQuantity(raw: string | number): void {
    const n = Math.round(Number(raw));
    this.quantity = Number.isFinite(n) ? Math.min(999, Math.max(1, n)) : 1;
    this.askPrice();
  }

  openManual(): void {
    const shown = this.price.data;
    this.manualDraft = this.manualPrice !== null ? String(this.manualPrice) : shown ? String(shown.unit_price) : '';
    this.manualOpen = true;
  }

  /** A typed price for one structure. The api keeps it until "Use the computed price". */
  applyManual(): void {
    const value = Number(this.manualDraft);
    if (String(this.manualDraft).trim() === '' || !Number.isFinite(value) || value < 0) {
      return this.say('Type the price of one structure in rupees.');
    }
    this.manualPrice = value;
    this.manualOpen = false;
    this.askPrice();
  }

  useComputedPrice(): void {
    this.manualPrice = null;
    this.manualOpen = false;
    this.askPrice();
  }

  /** "Fixed window 675 × 2400", "Glass", "Eave beam": what a cost row is, in the api's words where it gives them. */
  rowName(row: StructureCostRow): string {
    const what = row.name || row.role || row.fill || row.kind;
    return what.charAt(0).toUpperCase() + what.slice(1).replace(/_/g, ' ');
  }

  /** What one costs: a window at its unit cost, anything else at its rate. */
  rowRate(row: StructureCostRow): number | null {
    return (row.kind === 'window' ? row.unit_cost ?? row.rate : row.rate) ?? null;
  }

  /** The costing rows as the api sent them; none for a user who may not see costs. */
  rowsOf(price: StructurePrice): StructureCostRow[] {
    return price.rows ?? [];
  }

  /** The name of the glass row of the structure, for the workshop glass order (the api keeps 60 letters). */
  private get glassName(): string | null {
    const id = this.structure?.defaults.glassId;
    return this.catalog.glass.find((g) => this.same(g.id, id))?.label.slice(0, 60) ?? null;
  }

  /** The panels of a window row, by name. */
  panelNames(ids: string[] | null | undefined): string {
    const labels = (ids ?? []).map((id) => this.structure?.faces.find((f) => f.id === id)?.label ?? id);
    return labels.length > 4 ? `${labels.slice(0, 3).join(', ')} and ${labels.length - 3} more` : labels.join(', ');
  }

  /** "Show me where": the control the refusal named is opened again. */
  revealAgain(): void {
    this.reveal(this.price.missing);
  }

  trackRole = (_: number, r: { role: string }): string => r.role;

  // --- changing the shape ---

  get visibleParams(): ParamSpec[] {
    return this.def ? this.def.params.filter((s) => !s.showIf || s.showIf(this.params)) : [];
  }

  num(key: string): number {
    return this.params[key] as number;
  }

  /** A slider is moving or a handle is dragged: show it, one undo step for the whole gesture. */
  preview(patch: Params): void {
    const h = this.history;
    if (!h) return;
    if (!this.gestureBase) this.gestureBase = h.present;
    h.replace(this.prepared(retemplate(h.present, patch)));
    this.refresh();
  }

  /** The gesture ended (or a value was typed): it becomes one step of the history. */
  commit(patch?: Params): void {
    const h = this.history;
    if (!h) return;
    const base = this.gestureBase ?? h.present;
    const final = patch ? this.prepared(retemplate(h.present, patch)) : h.present;
    this.gestureBase = null;
    h.replace(base);
    if (JSON.stringify(paramsOf(base)?.params) !== JSON.stringify(paramsOf(final)?.params)) h.push(final);
    this.refresh('auto');
  }

  setParam(spec: ParamSpec, raw: string | number | boolean, live: boolean): void {
    const value = spec.type === 'choice' || spec.type === 'toggle' ? raw : Number(raw);
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    if (live) this.preview({ [spec.key]: value });
    else this.commit({ [spec.key]: value });
    // Another roof is another outline: the whole of it is brought into view.
    if (spec.key === 'roof') this.fit();
  }

  step(spec: ParamSpec, by: number): void {
    const big = spec.type === 'mm' ? 50 : spec.step ?? 1;
    this.commit({ [spec.key]: this.num(spec.key) + by * big });
  }

  private dragDim(id: string, value: number, phase: 'start' | 'move' | 'end'): void {
    const dim = this.dims.find((d) => d.id === id);
    if (!dim || !this.def) return;
    if (phase === 'start') return;
    this.preview(normalizeParams(this.def, dim.set(this.params, value)));
    if (phase === 'end') this.commit();
  }

  dimText(d: Dim): string {
    return d.unit === 'deg' ? `${Math.round(d.value * 10) / 10}°` : `${Math.round(d.value)}`;
  }

  /** The guide line of a size shows while its label is pointed at or typed in (null = none). */
  guideDim(id: string | null): void {
    this.zone.runOutsideAngular(() => this.scene?.setActiveDim(id ?? this.editingDim));
  }

  editDim(d: Dim): void {
    this.guideDim(d.id);
    const layer = this.labelLayer?.nativeElement;
    const at = layer?.querySelector<HTMLElement>(`[data-dim="${d.id}"]`)?.style.transform ?? '';
    this.editingDim = d.id;
    this.dimDraft = String(Math.round(d.value * 10) / 10);
    this.cdr.markForCheck();
    setTimeout(() => {
      // The box takes the place of the label it replaces at once: a hidden box cannot take the keyboard.
      const box = layer?.querySelector<HTMLElement>(`[data-dim="${d.id}"]`);
      if (box) {
        box.style.transform = at;
        box.style.visibility = 'visible';
      }
      const input = box?.querySelector<HTMLInputElement>('input');
      input?.focus();
      input?.select();
    });
  }

  cancelDim(): void {
    this.editingDim = null;
    this.guideDim(null);
    // The label comes back as a new element: the scene places it on its next frame.
    setTimeout(() => this.scene?.requestRender());
  }

  applyDim(d: Dim): void {
    if (this.editingDim !== d.id) return; // Enter and the blur that follows it: once
    const value = Number(this.dimDraft);
    this.cancelDim();
    if (!this.def || !Number.isFinite(value) || value === d.value) return;
    const wanted = Math.min(d.max, Math.max(d.min, value));
    if (wanted !== value) this.say(`${d.label}: ${d.min} to ${d.max}${d.unit === 'deg' ? '°' : ' mm'}`);
    this.commit(normalizeParams(this.def, d.set(this.params, wanted)));
  }

  // --- selecting and changing panels ---

  private pick(hit: PickTarget | null, additive: boolean): void {
    if (!hit) {
      if (!additive) this.clearSelection();
      return;
    }
    if (hit.kind === 'bar') {
      this.selectedBar = hit.id;
      this.selectedFaces = [];
    } else {
      this.selectedBar = null;
      const has = this.selectedFaces.includes(hit.id);
      if (additive) this.selectedFaces = has ? this.selectedFaces.filter((id) => id !== hit.id) : [...this.selectedFaces, hit.id];
      else this.selectedFaces = has && this.selectedFaces.length === 1 ? [] : [hit.id];
    }
    this.afterSelection();
  }

  private afterSelection(): void {
    if (this.selectedFaces.length || this.selectedBar) {
      this.sheet = 'panel';
      this.sheetOpen = true;
      // What is selected is changed in the right panel: it comes forward, the view stays as it is.
      if (!this.rightOpen) {
        this.rightOpen = true;
        this.pushInsets(false);
      }
    }
    this.zone.runOutsideAngular(() => this.scene?.setSelection(this.selectedFaces, this.selectedBar));
    this.cdr.markForCheck();
  }

  clearSelection(): void {
    this.selectedFaces = [];
    this.selectedBar = null;
    this.afterSelection();
  }

  selectFaces(ids: string[]): void {
    this.selectedFaces = ids;
    this.selectedBar = null;
    this.afterSelection();
  }

  get face(): Face | null {
    const s = this.structure;
    return s && this.selectedFaces.length ? s.faces.find((f) => f.id === this.selectedFaces[0]) ?? null : null;
  }

  get bar(): Joint | null {
    return this.structure?.joints.find((j) => j.id === this.selectedBar) ?? null;
  }

  get faceInfo(): FaceInfo | null {
    const s = this.structure;
    return s && this.selectedFaces.length ? faceInfoOf(s, this.selectedFaces, this.catalog) : null;
  }

  /** The selected bar: what it is, and the profile chosen for its role when it is charged on its own. */
  get barInfo(): { role: string; length: number; faces: number; control: BarControl | null } | null {
    const j = this.bar;
    const s = this.structure;
    if (!j || !s) return null;
    const control = isWindowBar(j, s) ? null : barControls(s).find((c) => c.role === j.role) ?? null;
    return { role: barSection(j.role).label, length: Math.round(jointLengthMm(j)), faces: j.faceIds.length, control };
  }

  /** One dropdown for each kind of bar the catalogue charges, and one for each kind of hub. */
  get barRows(): BarControl[] {
    return this.structure ? barControls(this.structure) : [];
  }

  get hubRows(): HubControl[] {
    return this.structure ? hubControls(this.structure) : [];
  }

  /** The wall panels that are plain glass because their shape has no window. */
  get plainWalls(): number {
    return this.structure?.faces.filter((f) => f.role === 'wall' && f.fill.kind === 'glass').length ?? 0;
  }

  /** Id of a catalogue row as the dropdowns carry it. */
  same(a: string | number | null | undefined, b: string | number | null | undefined): boolean {
    return a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);
  }

  selectGroup(): void {
    const s = this.structure;
    if (s && this.face) this.selectFaces(groupFaceIds(s, this.face.id));
  }

  selectRow(ids: string[]): void {
    this.selectFaces(ids);
  }

  /** A new document for the history: its windows fitted and its choices filled in, one undo step. */
  private push(next: Structure): void {
    const h = this.history;
    if (!h) return;
    const ready = this.prepared(next);
    if (ready === h.present) return;
    h.push(ready);
    this.refresh();
  }

  setFill(key: FillKey): void {
    const h = this.history;
    if (!h || !this.selectedFaces.length) return;
    const why = key === 'sliding' ? this.faceInfo?.noSliding : '';
    if (why) return this.say(why);
    const bare = key !== 'fixed' && key !== 'panel' && key !== 'open' ? this.faceInfo?.noWindow : '';
    if (bare) return this.say(bare);
    this.push(setFaceFill(h.present, this.selectedFaces, key));
  }

  // --- what the structure is made of: rows of the catalogue ---

  chooseColour(id: string): void {
    const h = this.history;
    if (h && id) this.push(setStructureColour(h.present, this.catalog, this.rowId(this.colourChoices, id)));
  }

  chooseGlass(id: string): void {
    const h = this.history;
    if (h && id) this.push(setStructureGlass(h.present, this.catalog, this.rowId(this.glassChoices, id)));
  }

  /** The profile of a bar role; '' puts a coupler or corner post back on the accessories. */
  chooseBar(role: string, id: string): void {
    const h = this.history;
    if (h) this.push(setBarProfile(h.present, role, id ? this.rowId(this.barChoices, id) : null));
  }

  chooseHub(role: string, id: string): void {
    const h = this.history;
    if (h) this.push(setHubItem(h.present, role, id ? this.rowId(this.hardwareChoices, id) : null));
  }

  /** The glass of the selected roof panes; '' = the glass of the structure. */
  choosePaneGlass(id: string): void {
    const h = this.history;
    if (h && this.selectedFaces.length) this.push(setFaceGlass(h.present, this.selectedFaces, id ? this.rowId(this.glassChoices, id) : null));
  }

  /** What the selected solid panels are made of. */
  chooseSolid(id: string): void {
    const h = this.history;
    if (h && this.selectedFaces.length && id) this.push(setFaceProduct(h.present, this.selectedFaces, this.rowId(this.glassChoices, id)));
  }

  /** The id of a row in the type the catalogue gives it (a dropdown hands back text). */
  private rowId(rows: Choice[], text: string): string | number {
    return rows.find((r) => String(r.id) === text)?.id ?? text;
  }

  /** Hardware items a hub can be, fetched the first time the structure has a hub. */
  private loadHardware(): void {
    if (this.hardwareChoices.length || !this.structure?.hubs.length) return;
    this.catalogs.hardware().then(
      (rows) => {
        this.hardwareChoices = rows.map((r) => ({ id: r.id, label: r.label }));
        this.cdr.markForCheck();
      },
      () => undefined
    );
  }

  // --- the window of a wall panel ---

  /** "Edit this panel": the window of the selected panel in the dialog; the first one decides the size and the shape. */
  editPanel(): void {
    const s = this.structure;
    const ids = this.faceInfo?.windowIds ?? [];
    if (!s || !ids.length) return;
    const design = windowDesigns(s).get(ids[0]);
    const face = s.faces.find((f) => f.id === ids[0]);
    if (!design || !face) return;
    this.opener = document.activeElement as HTMLElement | null;
    this.panelEdit = { faceIds: ids, face, design, title: ids.length === 1 ? face.label : `${ids.length} panels, starting from ${face.label}` };
    this.cdr.markForCheck();
  }

  /** Save in the dialog: the design goes to every panel chosen, each fitted to its own size; one undo step. */
  panelSaved(design: WindowDesign): void {
    const h = this.history;
    const edit = this.panelEdit;
    this.panelEdit = null;
    this.backToOpener();
    if (!h || !edit) return;
    const { structure, kept } = applyDesign(h.present, edit.faceIds, design);
    if (structure !== h.present) {
      h.push(structure);
      this.refresh();
    }
    if (kept.length) {
      this.say(`${kept.length === 1 ? 'One panel' : `${kept.length} panels`} kept ${kept.length === 1 ? 'its' : 'their'} own window: this design does not fit ${kept.length === 1 ? 'its' : 'their'} shape.`);
    }
    this.cdr.markForCheck();
  }

  panelCancelled(): void {
    this.panelEdit = null;
    this.backToOpener();
    this.cdr.markForCheck();
  }

  /** The button that opened the dialog gets the keyboard back. */
  private backToOpener(): void {
    const opener = this.opener;
    this.opener = null;
    setTimeout(() => opener?.isConnected && opener.focus());
  }

  // --- a refusal opens the control that fixes it ---

  /** The api asked for something to be chosen: the control for it is opened and marked. */
  private reveal(missing: string): void {
    const s = this.structure;
    const control = controlOf(missing);
    if (!s || !control) return;
    this.asked = missing;
    if (control.kind === 'solid_panel') {
      const solid = s.faces.filter((f) => f.fill.kind === 'panel').map((f) => f.id);
      if (solid.length) this.selectFaces(solid);
    } else {
      this.sheet = 'shape';
      this.sheetOpen = true;
      if (!this.leftOpen) {
        this.leftOpen = true;
        this.pushInsets(false);
      }
    }
    this.cdr.markForCheck();
    const target = control.kind === 'bar' ? `bar.${control.role}` : control.kind === 'solid_panel' ? 'solid' : control.kind;
    setTimeout(() => {
      this.cdr.detectChanges();
      const el = this.host.nativeElement.querySelector<HTMLElement>(`[data-choose="${target}"]`);
      el?.scrollIntoView?.({ block: 'nearest' });
      el?.focus({ preventScroll: true });
    });
  }

  rename(name: string): void {
    this.history?.push(renameStructure(this.history.present, name));
    this.refresh();
  }

  // --- history, view, files ---

  undo(): void {
    if (this.history?.undo()) this.refresh('auto');
  }

  redo(): void {
    if (this.history?.redo()) this.refresh('auto');
  }

  /** Back to the template's default size, panels and colours. One undo step. */
  reset(): void {
    const h = this.history;
    if (!h || !this.def) return;
    // A structure drawn from nothing keeps its plan: only the sizes, the roof and the panels go back.
    const start = this.isFree ? normalizeParams(this.def, { ...defaultParams(this.def), plan: this.params['plan'] }) : defaultParams(this.def);
    h.push(this.prepared({ ...this.def.generate(start), name: h.present.name }));
    this.selectedFaces = [];
    this.selectedBar = null;
    this.refresh(true);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    // The dialog of a panel has its own undo and its own Escape.
    if (!this.structure || this.panelEdit || (e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.redo();
    } else if (e.key === 'Escape') {
      this.clearSelection();
    }
  }

  setView(preset: ViewPreset): void {
    this.scene?.view(preset);
  }

  fit(): void {
    this.scene?.fit(true);
  }

  toggleDims(): void {
    this.showDims = !this.showDims;
    this.scene?.setGizmosVisible(this.showDims);
  }

  showSheet(sheet: Sheet): void {
    this.sheetOpen = this.sheet === sheet ? !this.sheetOpen : true;
    this.sheet = sheet;
  }

  /** "Save to quotation": the document, its summary and the picture become the line (or replace it), then back to the quotation. */
  save(): void {
    const s = this.structure;
    if (!s || this.saving) return;
    if (!this.quotationId) return this.say('Open a quotation and choose "Add 3D structure": a structure is saved as a line of a quotation.');
    this.saving = true;
    this.saveError = '';
    const quotationId = this.quotationId;
    const failed = (message: string): void => {
      this.saving = false;
      this.saveError = message;
      this.cdr.markForCheck();
    };
    void Promise.all([linePicture(this.scene), windowsAndDocument(s, quotationId, this.catalogs, this.catalog)]).then(([thumbnail, sent]) => {
      this.store
        .save({ id: this.savedId, document: sent.document, windows: sent.windows, glass: this.glassName, thumbnail, quotationId, quantity: this.quantity, unitPrice: this.manualPrice })
        .subscribe({
          next: (row) => {
            this.savedId = row.id;
            this.saving = false;
            // The quotation has it now: the copy on this device is not needed any more.
            if (this.importedFrom) this.device.delete(this.importedFrom).subscribe({ error: () => undefined });
            void this.router.navigate(this.quotationLink);
          },
          error: (e: Error) => {
            failed(plainRefusal(e.message));
            if (e instanceof StructureApiError && e.missing) this.reveal(e.missing);
          },
        });
    }, () => failed('We could not load what the windows need. Check your connection and save again.'));
  }

  exportJson(): void {
    const s = this.structure;
    if (s) saveAs(new Blob([serializeStructure(s)], { type: 'application/json' }), `${fileName(s.name)}.structure.json`);
  }

  exportPicture(): void {
    const s = this.structure;
    if (!s || !this.scene) return this.say('The picture needs the 3D view, which this device does not offer.');
    saveAs(dataUrlBlob(this.scene.snapshot(1600, 1200)), `${fileName(s.name)}.png`);
  }

  /**
   * The sheet a customer is handed: the picture, the name, the overall size and
   * the short parts summary under the fabricator's name. One PNG, no prices.
   * A phone offers its share sheet; elsewhere the file is downloaded.
   */
  sharePicture(): Promise<void> {
    const s = this.structure;
    const m = this.summary;
    this.openList = false;
    if (!s || !m || !this.scene) {
      this.say('The picture needs the 3D view, which this device does not offer.');
      return Promise.resolve();
    }
    const picture = this.scene.snapshot(1600, 1200);
    return customerSheet({ company: this.workspace.workspace$.value.name, picture, ...sheetFacts(s, m, this.def?.label ?? 'Structure') })
      .then((canvas) => new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png')))
      .then((blob) => {
        if (!blob) throw new Error('no picture');
        const file = new File([blob], `${fileName(s.name)}-sheet.png`, { type: 'image/png' });
        const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
        if (window.innerWidth < OVERLAY_FROM_PX && nav.canShare?.({ files: [file] })) {
          return nav.share({ files: [file], title: s.name }).catch(() => undefined);
        }
        saveAs(blob, file.name);
        this.say('The customer sheet was saved as a picture.');
        return undefined;
      })
      .catch(() => this.say('The customer sheet could not be made on this device.'));
  }

  chooseFile(): void {
    this.fileInput?.nativeElement.click();
  }

  importFile(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    file.text().then((text) => {
      try {
        this.open(parseStructure(text), null);
      } catch (err) {
        this.say((err as Error).message);
      }
      this.cdr.markForCheck();
    });
  }

  private say(text: string): void {
    this.message = text;
    window.clearTimeout(this.messageTimer);
    this.messageTimer = window.setTimeout(() => {
      this.message = '';
      this.cdr.markForCheck();
    }, 4000);
    this.cdr.markForCheck();
  }

  /** Frames a second while the camera turns once round the structure (review log). */
  benchmark(frames = 120): Promise<OrbitBenchmark | null> {
    return this.scene ? this.scene.orbitBenchmark(frames) : Promise.resolve(null);
  }

  trackKey = (_: number, s: ParamSpec): string => s.key;
  trackDim = (_: number, d: Dim): string => d.id;
}

/**
 * The picture of the quotation line, the PDF and the bill: a 960 x 720 PNG of
 * the 3D view. One that would pass the api's 2 MB goes as a small JPEG instead.
 */
function linePicture(scene: StructureScene | null): Promise<string | null> {
  if (!scene) return Promise.resolve(null);
  try {
    const png = scene.snapshot(960, 720);
    if (png.length <= LINE_PICTURE_MAX) return Promise.resolve(png);
  } catch {
    return Promise.resolve(null);
  }
  return jpegPicture(scene);
}

function jpegPicture(scene: StructureScene): Promise<string | null> {
  return new Promise((done) => {
    try {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 480;
        c.height = 360;
        const g = c.getContext('2d');
        if (!g) return done(null);
        g.fillStyle = '#fff';
        g.fillRect(0, 0, 480, 360);
        g.drawImage(img, 0, 0, 480, 360);
        done(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => done(null);
      img.src = scene.snapshot(960, 720);
    } catch {
      done(null);
    }
  });
}

function fileName(name: string): string {
  return name.trim().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'structure';
}

/** Hand a file to the browser's download. */
function saveAs(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dataUrlBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const bytes = atob(body);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i);
  return new Blob([out], { type: head.slice(5, head.indexOf(';')) });
}
