import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { createStructure, fillKey, serializeStructure } from '../../shared/structure-model';
import { environment } from '../../../environments/environment';
import { canSlide, PRICE_DEBOUNCE_MS, StructureDesignerComponent } from './structure-designer.component';
import { SAMPLE_PRICE } from './structure-line.service.spec';
import { BrowserStructureStore, STRUCTURE_STORE_KEY as STORE_KEY } from './structure-store.service';
import { documentFor } from './structure-windows';
import { openDesigner } from './testing';

const API = environment.API_URL;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// The 3D view is driven through its callbacks here (pick, dragDim), so the
// specs hold with or without WebGL in the test browser. The pictures and the
// real mouse are covered by docs/review/phase-40-structure-designer/e2e.js.
describe('StructureDesignerComponent', () => {
  let fixture: ComponentFixture<StructureDesignerComponent>;
  let c: StructureDesignerComponent;
  let el: HTMLElement;
  let kept: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inner = (): any => c;

  /** `params`: the route of a quotation, { id } for a new structure and { id, lineId } for "Edit". */
  async function make(query: Record<string, string> = {}, params: Record<string, string> = {}): Promise<void> {
    fixture = await openDesigner(query, params);
    c = fixture.componentInstance;
    el = fixture.nativeElement;
  }

  beforeEach(() => {
    kept = localStorage.getItem(STORE_KEY);
    localStorage.removeItem(STORE_KEY);
  });

  afterEach(() => {
    fixture?.destroy();
    if (kept === null) localStorage.removeItem(STORE_KEY);
    else localStorage.setItem(STORE_KEY, kept);
  });

  it('starts with a card for every structure type', async () => {
    await make();
    const cards = Array.from(el.querySelectorAll<HTMLElement>('.sd-card'));
    expect(cards.map((b) => b.dataset['kind'])).toEqual(['free', 'dome', 'cabin', 'bay', 'pyramid', 'lean-to', 'gable']);
    expect(el.querySelector('.sd--design')).toBeNull();
  });

  it('one tap on a card opens that structure at its default size', async () => {
    await make();
    el.querySelector<HTMLElement>('.sd-card[data-kind="dome"]')?.click();
    fixture.detectChanges();
    expect(c.structure?.template?.kind).toBe('dome');
    expect(c.summary?.panelCount).toBe(36);
    expect(c.dims.map((d) => d.id)).toEqual(['diameter', 'rise']);
    expect(el.querySelector('.sd-sec--shape h2')?.textContent).toBe('Dome');
    expect(el.querySelectorAll('.sd-field').length).toBe(6);
    expect(el.querySelector('.sd-note')?.textContent).toContain('Sizes are geometric centre-line sizes, and the price is worked out from them; workshop cut sizes come in a later step.');
  });

  it('?kind= opens a structure directly', async () => {
    await make({ kind: 'cabin' });
    expect(c.structure?.name).toBe('Cabin');
    expect(el.querySelector('.sd-card')).toBeNull();
  });

  it('a typed count regenerates the structure and the summary at once', async () => {
    await make({ kind: 'dome' });
    const ribs = c.visibleParams.find((p) => p.key === 'ribs')!;
    c.setParam(ribs, '16', false);
    fixture.detectChanges();
    expect(c.summary?.panelCount).toBe(48);
    expect(el.querySelector('.sd-sec--parts h3')?.textContent).toContain('48');
    c.setParam(ribs, '999', false);
    expect(c.num('ribs')).toBe(32); // held at its limit
    c.setParam(ribs, 'abc', false);
    expect(c.num('ribs')).toBe(32);
  });

  it('a slider gesture is one undo step however many values it passed', async () => {
    await make({ kind: 'dome' });
    const diameter = c.visibleParams.find((p) => p.key === 'diameter')!;
    for (const v of [3100, 3400, 3900, 4200]) c.setParam(diameter, v, true);
    expect(c.summary?.overall.widthMm).toBe(4200);
    c.commit();
    expect(c.history?.canUndo).toBeTrue();
    c.undo();
    expect(c.summary?.overall.widthMm).toBe(3000);
    expect(c.history?.canUndo).toBeFalse();
    c.redo();
    expect(c.summary?.overall.widthMm).toBe(4200);
  });

  it('dragging a handle stretches the structure; the whole drag is one undo step', async () => {
    await make({ kind: 'cabin' });
    inner().dragDim('width', 3600, 'start');
    inner().dragDim('width', 4200, 'move');
    inner().dragDim('width', 5000, 'move');
    inner().dragDim('width', 5000, 'end');
    expect(c.num('width')).toBe(5000);
    expect(c.summary?.overall.widthMm).toBe(5000);
    c.undo();
    expect(c.num('width')).toBe(3600);
    expect(c.history?.canUndo).toBeFalse();
  });

  it('a size label can be tapped and typed, inside its limits', async () => {
    await make({ kind: 'dome' });
    const rise = c.dims.find((d) => d.id === 'rise')!;
    c.editDim(rise);
    fixture.detectChanges();
    expect(el.querySelector('.sd-dim--edit input')).not.toBeNull();
    c.dimDraft = '1250';
    c.applyDim(rise);
    expect(c.num('rise')).toBe(1250);
    c.editDim(c.dims.find((d) => d.id === 'rise')!);
    c.dimDraft = '9000';
    c.applyDim(c.dims.find((d) => d.id === 'rise')!);
    expect(c.num('rise')).toBe(1500); // never more than half the diameter
    expect(c.message).toContain('Rise');
  });

  it('a typed bay projection finds the angle', async () => {
    await make({ kind: 'bay' });
    const projection = c.dims.find((d) => d.id === 'projection')!;
    c.editDim(projection);
    c.dimDraft = '450';
    c.applyDim(projection);
    expect(Math.abs((c.dims.find((d) => d.id === 'projection')?.value ?? 0) - 450)).toBeLessThan(3);
    expect(c.num('angle')).toBeLessThan(45);
  });

  it('tapping a panel shows its type and size and lets it be changed', async () => {
    await make({ kind: 'cabin' });
    inner().pick({ kind: 'face', id: 'front-1' }, false);
    fixture.detectChanges();
    expect(c.faceInfo).toEqual(jasmine.objectContaining({ title: 'Front wall, panel 1', shape: 'Rectangle', size: '675 × 2400 mm', fill: 'fixed' }));
    expect(el.querySelectorAll('.sd-fills button').length).toBe(7);
    el.querySelector<HTMLElement>('.sd-fills [data-fill="casement"]')?.click();
    fixture.detectChanges();
    expect(fillKey(c.structure!.faces.find((f) => f.id === 'front-1')!)).toBe('casement');
    expect(el.querySelector('.sd-fills .is-on')?.textContent).toContain('Casement');
    // The change stays when the cabin is resized, and undo takes it back.
    c.commit({ height: 2700 });
    expect(fillKey(c.structure!.faces.find((f) => f.id === 'front-1')!)).toBe('casement');
    c.undo();
    c.undo();
    expect(fillKey(c.structure!.faces.find((f) => f.id === 'front-1')!)).toBe('fixed');
  });

  it('shift + tap adds panels; a whole ring is changed together', async () => {
    await make({ kind: 'dome' });
    inner().pick({ kind: 'face', id: 'r2-s1' }, false);
    inner().pick({ kind: 'face', id: 'r2-s2' }, true);
    expect(c.selectedFaces).toEqual(['r2-s1', 'r2-s2']);
    inner().pick({ kind: 'face', id: 'r2-s2' }, true);
    expect(c.selectedFaces).toEqual(['r2-s1']);
    c.selectGroup();
    expect(c.selectedFaces.length).toBe(12);
    expect(c.faceInfo?.title).toBe('12 panels');
    c.setFill('panel');
    expect(c.structure!.faces.filter((f) => f.fill.kind === 'panel').length).toBe(12);
    expect(c.summary!.solidAreaSqM).toBeGreaterThan(0);
    inner().pick(null, false);
    expect(c.selectedFaces).toEqual([]);
  });

  it('tapping a bar shows its role and true length', async () => {
    await make({ kind: 'dome' });
    const rib = c.structure!.joints.find((j) => j.role === 'rib')!;
    inner().pick({ kind: 'bar', id: rib.id }, false);
    fixture.detectChanges();
    // Default dome: sphere radius 1625, ring step 22.46°, rib chord 2 × 1625 × sin 11.23° = 633.
    expect(c.barInfo).toEqual(jasmine.objectContaining({ role: 'Rib', length: 633, faces: 2 }));
    expect(c.selectedFaces).toEqual([]);
    expect(el.querySelector('.sd-sec--panel')?.textContent).toContain('True length');
  });

  it('a row of the parts summary selects its panels', async () => {
    await make({ kind: 'dome' });
    fixture.detectChanges();
    el.querySelector<HTMLElement>('.sd-sec--parts .sd-table tbody tr')?.click();
    expect(c.selectedFaces.length).toBe(12);
  });

  it('a roof pane has its glass from the catalogue; a window has the glass of the structure', async () => {
    await make({ kind: 'cabin' });
    inner().pick({ kind: 'face', id: 'roof-1' }, false);
    inner().pick({ kind: 'face', id: 'roof-2' }, true);
    fixture.detectChanges();
    const select = el.querySelector<HTMLSelectElement>('[data-choose="pane-glass"]')!;
    expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual(['As the structure', '5mm plain glass', '4mm Plain glass', '6mm bronze glass']);
    expect(el.querySelector('[data-tint="face"]')).withContext('no tint swatches any more').toBeNull();
    select.value = '16';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const glassOf = (id: string): unknown => {
      const fill = c.structure!.faces.find((f) => f.id === id)!.fill;
      return fill.kind === 'glass' ? fill.glassId : 'not glass';
    };
    expect([glassOf('roof-1'), glassOf('roof-2'), glassOf('roof-3')]).toEqual([16, 16, null]);
    // It stays through a resize; "As the structure" takes it off again; one undo step each.
    c.commit({ height: 2700 });
    expect(glassOf('roof-1')).toBe(16);
    c.choosePaneGlass('');
    expect(glassOf('roof-1')).toBeNull();
    c.undo();
    expect(glassOf('roof-1')).toBe(16);
    // A window has no glass of its own to choose here: it has the window options.
    c.selectFaces(['front-1']);
    fixture.detectChanges();
    expect(el.querySelector('[data-choose="pane-glass"]')).toBeNull();
    expect(el.querySelector('[data-action="edit-panel"]')).not.toBeNull();
  });

  it('the panels fold away and come back; a selection brings its panel forward', async () => {
    await make({ kind: 'dome' });
    c.togglePanel('left', false);
    c.togglePanel('right', false);
    fixture.detectChanges();
    const body = el.querySelector('.sd-body')!;
    expect(body.classList.contains('is-left-open') || body.classList.contains('is-right-open')).toBeFalse();
    el.querySelector<HTMLElement>('.sd-unfold--left')?.click();
    fixture.detectChanges();
    expect(c.leftOpen).toBeTrue();
    inner().pick({ kind: 'face', id: c.structure!.faces[0].id }, false);
    expect(c.rightOpen).toBeTrue();
    // One row on a phone: what the bar drops is in the menu.
    c.openList = true;
    inner().cdr.markForCheck();
    fixture.detectChanges();
    expect(el.querySelectorAll('.sd-menu__more button').length).toBe(3);
  });

  it('colour and glass are chosen from the catalogue and apply to the whole structure; reset goes back to the first choices', async () => {
    await make({ kind: 'gable' });
    const options = (sel: string): string[] => Array.from(el.querySelectorAll<HTMLOptionElement>(`${sel} option`)).map((o) => o.textContent?.trim() ?? '');
    expect(options('[data-choose="colour"]')).toEqual(['Default', 'Oak']);
    expect(options('[data-choose="glass"]')).toEqual(['5mm plain glass', '4mm Plain glass', '6mm bronze glass']);
    expect(c.structure?.defaults).toEqual(jasmine.objectContaining({ colorId: 1, glassId: 1 }));
    c.chooseColour('7');
    c.chooseGlass('16');
    c.commit({ width: 4800 });
    expect(c.structure?.defaults).toEqual(jasmine.objectContaining({ colorId: 7, glassId: 16 }));
    expect(c.structure?.appearance).toEqual({ profileColour: '#6b4a32', glassTint: '#c9a27a' });
    c.reset();
    expect(c.structure?.defaults).toEqual(jasmine.objectContaining({ colorId: 1, glassId: 1 }));
    expect(c.structure?.appearance.profileColour).toBe('#ffffff');
    expect(c.num('width')).toBe(3600);
    c.undo();
    expect(c.num('width')).toBe(4800);
    expect(c.structure?.defaults.colorId).toBe(7);
  });

  // --- inside a quotation (card T123) ---

  const http = (): HttpTestingController => TestBed.inject(HttpTestingController);
  const priceCalls = () => http().match(`${API}/quatation/structure/price`);
  const bar = (): string => (el.querySelector('.sd-price')?.textContent ?? '').replace(/\s+/g, ' ').trim();
  /** Wait for the debounce, answer the one price request that went out, and draw. */
  async function answerPrice(body: unknown, status = 200): Promise<any> {
    await sleep(PRICE_DEBOUNCE_MS + 80);
    const calls = priceCalls();
    expect(calls.length).withContext('one request after the changes have rested').toBe(1);
    calls[0].flush(body as object, { status, statusText: status === 200 ? 'OK' : 'No' });
    fixture.detectChanges();
    return calls[0].request.body;
  }

  it('in a quotation every change is priced by the api, once it has rested; the bar shows the amount, per sq ft and the area', async () => {
    await make({ kind: 'cabin' }, { id: '12' });
    expect(bar()).toContain('Working out the price');
    const first = await answerPrice({ success: true, data: SAMPLE_PRICE });
    expect(first).toEqual(jasmine.objectContaining({ quatation_id: 12, structure_type: 'cabin', quantity: 1, unit_price: null }));
    expect(first.summary).toEqual(c.summary);
    // Every wall panel is named once in the windows, and the document says what the structure is made of.
    const named: string[] = first.windows.flatMap((w: { face_ids: string[] }) => w.face_ids);
    expect(named.sort()).toEqual(c.structure!.faces.filter((f) => f.fill.kind === 'design').map((f) => f.id).sort());
    expect(first.windows[0].body.is_saved).toBeFalse();
    expect(first.document.defaults).toEqual(jasmine.objectContaining({ glassId: 1, colorId: 1, bars: { eave: 29, rafter: 29 } }));
    expect(el.querySelector('.sd-price')?.getAttribute('data-price')).toBe('ready');
    expect(bar()).toContain('₹73,481.40');
    expect(bar()).toContain('₹550.55 / sq ft');
    expect(bar()).toContain('133.47 sq ft');

    // Three quick changes are one request, with the last shape; the old price is dimmed meanwhile, not zero.
    c.commit({ width: 4000 });
    c.commit({ width: 4400 });
    c.setQuantity(3);
    fixture.detectChanges();
    expect(el.querySelector('.sd-price__figure')?.classList.contains('is-stale')).toBeTrue();
    const second = await answerPrice({ success: true, data: { ...SAMPLE_PRICE, quantity: 3, amount: 250000 } });
    expect(second.quantity).toBe(3);
    expect(second.summary.overall.widthMm).toBe(4400);
    expect(bar()).toContain('₹2,50,000.00');

    // Price details: the cost rows as the api returns them.
    (el.querySelector('[data-action="details"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const rows = Array.from(el.querySelectorAll('[data-pop="details"] tbody tr')).map((r) => (r.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(rows.length).toBe(SAMPLE_PRICE.rows!.length);
    expect(rows[0]).toContain('Fixed window 675 × 2400');
    expect(rows[0]).toContain('Front wall, panel 1, Front wall, panel 2, Front wall, panel 3, Front wall, panel 4');
    expect(rows[0]).toContain('₹5,580.00');
    expect(rows[0]).toContain('₹22,320.00');
    expect(rows[3]).withContext('a row without a name is called by its role').toContain('Crown');
  });

  it('a refusal is a plain sentence, never a zero price, and sends nobody to a settings page', async () => {
    await make({ kind: 'gable' }, { id: '12' });
    await answerPrice({ success: false, data: null, message: 'structure_catalogue_v1 cannot price this structure: Choose a profile for the rafter.', missing: 'bar.rafter' });
    expect(el.querySelector('.sd-price')?.getAttribute('data-price')).toBe('refused');
    expect(bar()).toContain('No price yet: Choose a profile for the rafter.');
    expect(bar()).not.toContain('₹');
    expect(bar()).not.toContain('structure_catalogue_v1');
    expect(el.querySelector('a[href*="profile"], a[href*="structure-rates"]')).toBeNull();
    expect(el.textContent?.toLowerCase()).not.toContain('structure rates');
    expect((el.querySelector('[data-action="details"]') as HTMLButtonElement).disabled).toBeTrue();

    // No answer at all is said as such, with a way to ask again.
    c.setQuantity(1);
    await sleep(PRICE_DEBOUNCE_MS + 80);
    priceCalls()[0].error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(bar()).toContain('Price not available');
    expect(bar()).not.toContain('₹');
  });

  it('a price can be typed, and the computed one comes back', async () => {
    await make({ kind: 'dome' }, { id: '12' });
    await answerPrice({ success: true, data: SAMPLE_PRICE });
    (el.querySelector('[data-action="manual"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(c.manualDraft).withContext('starts from the computed price of one').toBe('61234.5');
    c.manualDraft = '95000';
    c.applyManual();
    const typed = await answerPrice({ success: true, data: { ...SAMPLE_PRICE, unit_price: 95000, total: 95000, amount: 114000, price_is_manual: true } });
    expect(typed.unit_price).toBe(95000);
    expect(bar()).toContain('₹1,14,000.00');
    expect(bar()).toContain('your price');
    expect(el.querySelector('[data-action="manual"]')?.textContent).toContain('Your price');

    c.useComputedPrice();
    const back = await answerPrice({ success: true, data: SAMPLE_PRICE });
    expect(back.unit_price).toBeNull();
    expect(bar()).toContain('₹73,481.40');
    expect(bar()).not.toContain('your price');
  });

  it('"Save to quotation" adds the line and goes back; "Edit" opens the stored document and saves over it', async () => {
    await make({ kind: 'lean-to' }, { id: '12' });
    c.rename('Verandah for Mr Shah');
    c.commit({ projection: 3000 });
    c.setQuantity(2);
    await answerPrice({ success: true, data: SAMPLE_PRICE });
    expect(el.querySelector('[data-action="save"]')?.textContent).toContain('Save to quotation');
    const saved = serializeStructure(c.structure!);
    const summary = c.summary;
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const waitFor = async (done: () => boolean): Promise<void> => {
      for (let i = 0; i < 200 && !done(); i++) await sleep(20);
    };
    let add: any[] = [];
    c.save();
    await waitFor(() => (add = [...add, ...http().match(`${API}/quatation/structure/add`)]).length > 0);
    expect(add[0].request.body).toEqual(
      jasmine.objectContaining({ quatation_id: 12, name: 'Verandah for Mr Shah', structure_type: 'lean-to', quantity: 2, unit_price: null, glass: '5mm plain glass', summary })
    );
    // The document goes with every window complete with its catalogue ids; nothing else is changed.
    expect(serializeStructure(add[0].request.body.document)).toBe(serializeStructure(documentFor(c.structure!, c.catalog)));
    expect(add[0].request.body.windows.flatMap((w: { face_ids: string[] }) => w.face_ids).length).toBe(c.structure!.faces.filter((f) => f.fill.kind === 'design').length);
    const line = {
      id: 77,
      kind: 'structure',
      quatation_id: 12,
      quantity: 2,
      label: 'Verandah for Mr Shah',
      image: null,
      structure: { type: 'lean-to', name: 'Verandah for Mr Shah', overall: summary!.overall, costing: { price_is_manual: true, unit_price: 95000 } },
      document: JSON.parse(saved),
    };
    add[0].flush({ success: true, data: line });
    expect(navigate).toHaveBeenCalledWith(['/quotation/detail', 12]);

    // Edit: the designer opens with the document the api keeps for that line.
    fixture.destroy();
    TestBed.resetTestingModule();
    await make({}, { id: '12', lineId: '77' });
    http().expectOne(`${API}/quatation/structure/77`).flush({ success: true, data: line });
    fixture.detectChanges();
    expect(serializeStructure(c.structure!)).toBe(saved);
    expect(c.num('projection')).toBe(3000);
    expect(c.quantity).toBe(2);
    expect(c.manualPrice).withContext('the typed price is kept').toBe(95000);
    expect(el.querySelector('[data-action="back"]')?.textContent).toContain('Quotation');
    const asked = await answerPrice({ success: true, data: SAMPLE_PRICE });
    expect(asked.unit_price).toBe(95000);

    const again = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    let update: any[] = [];
    c.save();
    await waitFor(() => (update = [...update, ...http().match(`${API}/quatation/structure/update/77`)]).length > 0);
    expect(update[0].request.body).toEqual(jasmine.objectContaining({ name: 'Verandah for Mr Shah', quantity: 2, unit_price: 95000, glass: '5mm plain glass' }));
    expect(update[0].request.body.quatation_id).toBeUndefined();

    // A refused save stays on the page and says why.
    update[0].flush({ success: false, message: 'structure_catalogue_v1 cannot price this structure: Choose a profile for the wall plate.', missing: 'bar.wall_plate' });
    fixture.detectChanges();
    expect(again).not.toHaveBeenCalled();
    expect(el.querySelector('[data-price="save-error"]')?.textContent).toContain('Not saved. Choose a profile for the wall plate.');
    expect(c.asked).withContext('the control is opened').toBe('bar.wall_plate');
  });

  it('offers what was saved on this device before, to bring into the quotation', async () => {
    const device = new BrowserStructureStore();
    await firstValueFrom(device.save({ id: null, document: { ...createStructure('bay'), name: 'Old bay' }, thumbnail: null }));
    await make({}, { id: '12' });
    const rows = el.querySelectorAll('[data-list="device"] button');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Old bay');
    (rows[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(c.structure?.name).toBe('Old bay');
    expect(c.savedId).withContext('a new line of this quotation, not a saved one').toBeNull();
    await sleep(PRICE_DEBOUNCE_MS + 80);
    expect(priceCalls().length).toBe(1);
  });

  it('outside a quotation there is no price bar and nothing is saved', async () => {
    await make({ kind: 'dome' });
    await sleep(PRICE_DEBOUNCE_MS + 80);
    expect(priceCalls().length).toBe(0);
    expect(el.querySelector('.sd-price')).toBeNull();
    c.save();
    expect(c.message).toContain('Open a quotation');
    http().expectNone(`${API}/quatation/structure/add`);
  });

  it('does not offer Sliding for a panel that is not a rectangle, and says why', async () => {
    await make({ kind: 'lean-to' });
    const raked = c.structure!.faces.find((f) => !canSlide(f))!;
    const plain = c.structure!.faces.find((f) => canSlide(f) && f.fill.kind === 'design')!;
    expect(raked).withContext('a lean-to has raked side panels').toBeTruthy();
    inner().pick({ kind: 'face', id: raked.id }, false);
    fixture.detectChanges();
    const button = el.querySelector<HTMLButtonElement>('.sd-fills [data-fill="sliding"]')!;
    expect(button.disabled).toBeTrue();
    expect(el.querySelector('.sd-why')?.textContent).toContain('Sliding needs a rectangular panel');
    c.setFill('sliding'); // not through the button either
    expect(fillKey(c.structure!.faces.find((f) => f.id === raked.id)!)).not.toBe('sliding');
    expect(c.message).toContain('rectangular');

    inner().pick({ kind: 'face', id: plain.id }, false);
    fixture.detectChanges();
    expect(el.querySelector<HTMLButtonElement>('.sd-fills [data-fill="sliding"]')!.disabled).toBeFalse();
    expect(el.querySelector('.sd-why')).toBeNull();
    c.setFill('sliding');
    expect(fillKey(c.structure!.faces.find((f) => f.id === plain.id)!)).toBe('sliding');

    // A mixed selection: Sliding is held back and the count is given.
    c.selectFaces([raked.id, plain.id]);
    fixture.detectChanges();
    expect(el.querySelector('.sd-why')?.textContent).toContain('1 of the 2 selected is not');
  });

  it('opens an exported JSON file and refuses another file with a plain message', async () => {
    await make({ kind: 'dome' });
    const text = serializeStructure(c.structure!).replace('"name": "Dome"', '"name": "From a file"');
    // The file is read by the browser in its own time: wait for the outcome, not for a clock.
    const pickFile = async (content: string, done: () => boolean): Promise<void> => {
      const input = { files: [new File([content], 'x.json')], value: 'x' } as unknown as HTMLInputElement;
      c.importFile({ target: input } as unknown as Event);
      for (let i = 0; i < 100 && !done(); i++) await new Promise((r) => setTimeout(r, 20));
    };
    await pickFile(text, () => c.structure?.name !== 'Dome');
    expect(c.structure?.name).toBe('From a file');
    await pickFile('{"hello":1}', () => c.message !== '');
    expect(c.message).toContain('not a structure document');
    expect(c.structure?.name).toBe('From a file');
  });

  it('every structure type can be opened, reshaped and closed', async () => {
    await make();
    for (const t of c.templates) {
      c.start(t.kind);
      fixture.detectChanges();
      const dim = c.dims.find((d) => d.handle)!;
      const target = Math.min(dim.max, dim.value + 200);
      inner().dragDim(dim.id, target, 'move');
      inner().dragDim(dim.id, target, 'end');
      expect(Math.abs((c.dims.find((d) => d.id === dim.id)?.value ?? 0) - target)).withContext(t.kind).toBeLessThan(12);
      expect(c.summary!.panelCount).withContext(t.kind).toBeGreaterThan(0);
      c.close();
      fixture.detectChanges();
    }
    expect(el.querySelectorAll('.sd-card').length).toBe(7);
  });
});
