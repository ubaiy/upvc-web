/**
 * Structure designer — design a dome, a cabin, a bay, a lantern roof or a
 * conservatory in 3D (card T100). The document is "upvc.structure/1"
 * (shared/structure-model); this screen only shows it and sends operations.
 *
 * Sizes shown are geometric centre-line sizes. Workshop cut sizes, prices and
 * the quotation line come on the next cards; nothing here calls the api.
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
import {
  barSection,
  createStructure,
  defaultParams,
  Dim,
  Face,
  FILL_LABEL,
  fillKey,
  FillKey,
  groupFaceIds,
  isGlazed,
  History,
  Joint,
  jointLengthMm,
  normalizeParams,
  panelSize,
  Params,
  paramsOf,
  ParamSpec,
  parseStructure,
  renameStructure,
  retemplate,
  faceAreaSqMm,
  serializeStructure,
  setAppearance,
  setFaceFill,
  setFaceGlassTint,
  SHAPE_LABEL,
  Structure,
  summarize,
  Summary,
  TemplateDef,
  TEMPLATES,
} from '../../shared/structure-model';
import { environment } from '../../../environments/environment';
import { WorkspaceService } from '../../containers/shell/workspace.service';
import { customerSheet, sheetFacts } from './customer-sheet';
import { StructureStore } from './structure-store.service';
import { PickTarget } from './three/structure-mesh';
import { LabelPosition, OrbitBenchmark, StructureScene, ViewInsets, ViewPreset, webglAvailable } from './three/structure-scene';

type Sheet = 'shape' | 'panel' | 'parts';

/** From this width the panels lie over the 3D view; under it they are one bottom sheet. */
const OVERLAY_FROM_PX = 1100;
/** From this width both panels start open. */
const OPEN_FROM_PX = 1200;
/** What an open panel and the toolbars cover of the 3D view, CSS px (structure-designer.component.scss). */
const COVER = { left: 268, right: 324, top: 56, bottom: 30 };

const PROFILE_COLOURS = [
  { value: '#f4f4f1', label: 'White' },
  { value: '#e9e2d0', label: 'Cream' },
  { value: '#8a8d8f', label: 'Grey' },
  { value: '#3b3f44', label: 'Anthracite' },
  { value: '#6b4a32', label: 'Oak brown' },
  { value: '#1f2224', label: 'Black' },
];
const GLASS_TINTS = [
  { value: '#cfe3e8', label: 'Clear' },
  { value: '#9fc4cf', label: 'Light blue' },
  { value: '#8fbf9f', label: 'Green' },
  { value: '#b89f7a', label: 'Bronze' },
  { value: '#7d8a92', label: 'Grey' },
];

@Component({
  selector: 'app-structure-designer',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './structure-designer.component.html',
  styleUrls: ['./structure-designer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StructureDesignerComponent implements AfterViewInit, OnDestroy {
  readonly templates = TEMPLATES;
  readonly fillKeys: FillKey[] = ['fixed', 'casement', 'top-hung', 'door', 'sliding', 'panel', 'open'];
  readonly fillLabel = FILL_LABEL;
  readonly shapeLabel = SHAPE_LABEL;
  readonly profileColours = PROFILE_COLOURS;
  readonly glassTints = GLASS_TINTS;
  readonly views: { key: ViewPreset; label: string }[] = [
    { key: '3d', label: '3D' },
    { key: 'front', label: 'Front' },
    { key: 'side', label: 'Side' },
    { key: 'top', label: 'Top' },
  ];

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
    private readonly zone: NgZone,
    private readonly store: StructureStore,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly workspace: WorkspaceService
  ) {
    const query = this.route.snapshot.queryParamMap;
    const kind = query.get('kind');
    const id = query.get('id');
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
      left: wide && this.leftOpen ? COVER.left : 0,
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

  private open(structure: Structure, savedId: string | null): void {
    this.history = new History(structure);
    this.savedId = savedId;
    this.selectedFaces = [];
    this.selectedBar = null;
    this.gestureBase = null;
    this.sheet = 'shape';
    this.openList = false;
    this.refresh(true);
  }

  /** A saved structure, opened from the list (?id=). */
  private openSaved(id: string): void {
    this.store.get(id).subscribe({
      next: (saved) => {
        this.open(saved.document, saved.id);
        this.cdr.markForCheck();
      },
      error: (e: Error) => this.say(e.message),
    });
  }

  /** Back: a saved structure goes back to the list it was opened from, a new one to the shapes. */
  back(): void {
    if (this.savedId) void this.router.navigate(['/structures']);
    else this.close();
  }

  /** Back to the start screen. */
  close(): void {
    this.history = null;
    this.def = null;
    this.summary = null;
    this.dims = [];
    this.savedId = null;
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
    const size = (): void => scene.resize(host.clientWidth, host.clientHeight);
    size();
    this.observer = new ResizeObserver(size);
    this.observer.observe(host);
    this.pushInsets(false);
    if (this.structure) {
      scene.setStructure(this.structure, this.dims, true);
      scene.setSelection(this.selectedFaces, this.selectedBar);
      scene.setGizmosVisible(this.showDims);
    }
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

  /** Everything read off the document again; the 3D view rebuilt. */
  private refresh(refit: boolean | 'auto' = false): void {
    const s = this.structure;
    if (!s) return;
    const own = paramsOf(s);
    this.def = own?.def ?? null;
    this.params = own?.params ?? {};
    this.dims = own ? own.def.dims(own.params) : [];
    this.summary = summarize(s);
    const faces = new Set(s.faces.map((f) => f.id));
    this.selectedFaces = this.selectedFaces.filter((id) => faces.has(id));
    if (this.selectedBar && !s.joints.some((j) => j.id === this.selectedBar)) this.selectedBar = null;
    this.zone.runOutsideAngular(() => {
      this.scene?.setStructure(s, this.dims, refit);
      this.scene?.setSelection(this.selectedFaces, this.selectedBar);
    });
    this.cdr.markForCheck();
  }

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
    h.replace(retemplate(h.present, patch));
    this.refresh();
  }

  /** The gesture ended (or a value was typed): it becomes one step of the history. */
  commit(patch?: Params): void {
    const h = this.history;
    if (!h) return;
    const base = this.gestureBase ?? h.present;
    const final = patch ? retemplate(h.present, patch) : h.present;
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

  editDim(d: Dim): void {
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

  get faceInfo(): {
    title: string;
    shape: string;
    size: string;
    area: string;
    fill: FillKey | null;
    group: string;
    /** Some selected panel has glass. */
    glazed: boolean;
    /** The tint the selected glass is drawn with; null when the panels differ. */
    tint: string | null;
    /** Some selected panel has a tint of its own. */
    ownTint: boolean;
    /** Why Sliding is not offered for this selection; '' when it is. */
    noSliding: string;
  } | null {
    const s = this.structure;
    const first = this.face;
    if (!s || !first) return null;
    const chosen = s.faces.filter((f) => this.selectedFaces.includes(f.id));
    const fills = new Set(chosen.map((f) => fillKey(f)));
    const area = chosen.reduce((sum, f) => sum + faceAreaSqMm(f), 0) / 1e6;
    const size = panelSize(first);
    const tints = new Set(chosen.filter(isGlazed).map((f) => f.glassTint ?? s.appearance.glassTint));
    const raked = chosen.filter((f) => !canSlide(f)).length;
    const noSliding = !raked
      ? ''
      : chosen.length === 1
        ? 'Sliding needs a rectangular panel: two leaves cannot run on a sloped or pointed frame.'
        : `Sliding needs rectangular panels: ${raked} of the ${chosen.length} selected ${raked === 1 ? 'is' : 'are'} not.`;
    return {
      noSliding,
      glazed: tints.size > 0,
      tint: tints.size === 1 ? [...tints][0] : null,
      ownTint: chosen.some((f) => !!f.glassTint),
      title: chosen.length === 1 ? first.label : `${chosen.length} panels`,
      shape: chosen.length === 1 ? SHAPE_LABEL[size.shape] : chosen.every((f) => f.group === first.group) ? first.groupLabel : 'Several groups',
      size: chosen.length === 1 ? `${size.text} mm` : '',
      area: `${area.toFixed(2)} m²`,
      fill: fills.size === 1 ? [...fills][0] : null,
      group: first.groupLabel,
    };
  }

  get barInfo(): { role: string; length: number; faces: number } | null {
    const j = this.bar;
    return j ? { role: barSection(j.role).label, length: Math.round(jointLengthMm(j)), faces: j.faceIds.length } : null;
  }

  selectGroup(): void {
    const s = this.structure;
    if (s && this.face) this.selectFaces(groupFaceIds(s, this.face.id));
  }

  selectRow(ids: string[]): void {
    this.selectFaces(ids);
  }

  setFill(key: FillKey): void {
    const h = this.history;
    if (!h || !this.selectedFaces.length) return;
    const why = key === 'sliding' ? this.faceInfo?.noSliding : '';
    if (why) return this.say(why);
    h.push(setFaceFill(h.present, this.selectedFaces, key));
    this.refresh();
  }

  setColour(profileColour: string): void {
    this.history?.push(setAppearance(this.history.present, { profileColour }));
    this.refresh();
  }

  setTint(glassTint: string): void {
    this.history?.push(setAppearance(this.history.present, { glassTint }));
    this.refresh();
  }

  /** A tint for the glass of the selected panels only; null = the tint of the structure again. */
  setFaceTint(tint: string | null): void {
    const h = this.history;
    if (!h || !this.selectedFaces.length) return;
    const next = setFaceGlassTint(h.present, this.selectedFaces, tint);
    if (next === h.present) return;
    h.push(next);
    this.refresh();
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
    h.push({ ...this.def.generate(defaultParams(this.def)), name: h.present.name });
    this.selectedFaces = [];
    this.selectedBar = null;
    this.refresh(true);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (!this.structure || (e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
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

  /** Save with a small picture for the list, then back to the list. */
  save(): void {
    const s = this.structure;
    if (!s || this.saving) return;
    this.saving = true;
    void listPicture(this.scene).then((thumbnail) => {
      this.store.save({ id: this.savedId, document: s, thumbnail }).subscribe({
        next: (row) => {
          this.savedId = row.id;
          this.saving = false;
          void this.router.navigate(['/structures']);
        },
        error: (e: Error) => {
          this.saving = false;
          this.say(e.message);
        },
      });
    });
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

/** Sliding leaves run on a straight head and sill: only a plain rectangle can have them. */
export function canSlide(face: Face): boolean {
  return panelSize(face).shape === 'rectangle';
}

/** The picture of a row of the list: 480 x 360 JPEG, some 15 kB, so fifty fit the browser's storage with room to spare. */
function listPicture(scene: StructureScene | null): Promise<string | null> {
  if (!scene) return Promise.resolve(null);
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
