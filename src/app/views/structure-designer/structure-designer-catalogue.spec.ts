import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { setLeafSpec, setWindowGlass, walkLeaves, WindowDesign } from '../../shared/design-model';
import { createStructure, Face, Structure } from '../../shared/structure-model';
import { environment } from '../../../environments/environment';
import { PanelDialogComponent } from './panel-dialog.component';
import { PRICE_DEBOUNCE_MS, StructureDesignerComponent } from './structure-designer.component';
import { SAMPLE_PRICE } from './structure-line.service.spec';
import { openDesigner } from './testing';

const API = environment.API_URL;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('StructureDesignerComponent: a structure made of the catalogue', () => {
  let fixture: ComponentFixture<StructureDesignerComponent>;
  let c: StructureDesignerComponent;
  let el: HTMLElement;

  const http = (): HttpTestingController => TestBed.inject(HttpTestingController);
  const face = (id: string): Face => c.structure!.faces.find((f) => f.id === id)!;
  const designOf = (id: string): WindowDesign => {
    const fill = face(id).fill;
    if (fill.kind !== 'design' || !fill.design) throw new Error(`${id} has no window`);
    return fill.design;
  };
  const size = (id: string): number[] => [designOf(id).frame.widthMm, designOf(id).frame.heightMm];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inner = (): any => c;

  async function make(query: Record<string, string> = {}, params: Record<string, string> = {}): Promise<void> {
    fixture = await openDesigner(query, params);
    c = fixture.componentInstance;
    el = fixture.nativeElement;
  }

  /** The price request that went out once the changes rested; it is answered with the sample or with a refusal. */
  async function ask(answer: unknown = { success: true, data: SAMPLE_PRICE }): Promise<any> {
    await sleep(PRICE_DEBOUNCE_MS + 80);
    const calls = http().match(`${API}/quatation/structure/price`);
    expect(calls.length).withContext('one request after the changes have rested').toBe(1);
    calls[0].flush(answer as object);
    fixture.detectChanges();
    return calls[0].request.body;
  }

  async function dialog(): Promise<PanelDialogComponent> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const found = fixture.debugElement.query(By.directive(PanelDialogComponent));
    await fixture.whenStable();
    fixture.detectChanges();
    return found.componentInstance as PanelDialogComponent;
  }

  afterEach(() => fixture?.destroy());

  describe('the window of a wall panel', () => {
    beforeEach(async () => make({ kind: 'cabin' }, { id: '12' }));

    it('every wall panel of a new structure is a window of its own size, and the roof glass is not', () => {
      expect(size('front-1')).toEqual([675, 2400]);
      expect(size('door')).toEqual([900, 2100]);
      expect(face('roof-1').fill.kind).toBe('glass');
    });

    it('a wall panel opens the dialog: "Edit this panel" with the window in a line', async () => {
      inner().pick({ kind: 'face', id: 'front-1' }, false);
      fixture.detectChanges();
      expect(el.querySelector('[data-window="text"]')?.textContent).toContain('675 × 2400 mm · 5mm plain glass · Fixed glass');
      expect(el.querySelector('[data-pd="dialog"]')).toBeNull();
      el.querySelector<HTMLButtonElement>('[data-action="edit-panel"]')!.click();
      const d = await dialog();
      expect(el.querySelector('[role="dialog"] h2')?.textContent).toContain('Front wall, panel 1');
      expect(d.effective.frame.widthMm).toBe(675);
      expect(d.effective.glazing.glassId).withContext('the glass of the structure').toBe(1);
    });

    it('Save changes only that panel, and is one undo step', async () => {
      const before = c.structure!;
      inner().pick({ kind: 'face', id: 'front-1' }, false);
      c.editPanel();
      const d = await dialog();
      d.onInspectorChange(setWindowGlass(d.effective, 16));
      await sleep(10);
      await d.save();
      fixture.detectChanges();
      expect(c.panelEdit).toBeNull();
      expect(el.querySelector('[role="dialog"]')).toBeNull();
      expect(designOf('front-1').glazing.glassId).toBe(16);
      for (const f of before.faces.filter((x) => x.id !== 'front-1')) expect(face(f.id)).withContext(f.id).toBe(f);
      expect(face('front-1').edited).toBeTrue();
      expect(c.structure!.joints).toBe(before.joints);
      c.undo();
      expect(c.structure).toBe(before);
      expect(c.history?.canUndo).toBeFalse();
    });

    it('Cancel changes nothing', async () => {
      const before = c.structure!;
      inner().pick({ kind: 'face', id: 'front-1' }, false);
      c.editPanel();
      const d = await dialog();
      d.onInspectorChange(setWindowGlass(d.effective, 16));
      await sleep(10);
      el.querySelector<HTMLButtonElement>('[data-pd="cancel"]')!.click();
      fixture.detectChanges();
      expect(c.panelEdit).toBeNull();
      expect(c.structure).toBe(before);
      expect(c.history?.canUndo).toBeFalse();
    });

    it('several panels take one design, each fitted to its own size', async () => {
      c.selectFaces(['front-1', 'front-2', 'door']);
      fixture.detectChanges();
      expect(el.querySelector('[data-action="edit-panel"]')?.textContent).toContain('Edit these 3 panels');
      c.editPanel();
      const d = await dialog();
      expect(d.panels).toBe(3);
      d.onInspectorChange(
        setLeafSpec(d.effective, 'p1', { category: 'Casement', casementType: 'Openable', opening: { direction: 'Right', handleId: 55, hingesType: 'Friction' } })
      );
      await sleep(10);
      await d.save();
      fixture.detectChanges();
      expect(size('front-1')).toEqual([675, 2400]);
      expect(size('front-2')).toEqual([675, 2400]);
      expect(size('door')).withContext('its own size, not the first panel\'s').toEqual([900, 2100]);
      for (const id of ['front-1', 'front-2', 'door']) {
        const leaf = walkLeaves(designOf(id).root)[0];
        expect([id, leaf.casementType, leaf.opening?.direction]).toEqual([id, 'Openable', 'Right']);
        expect(face(id).fill).toEqual(jasmine.objectContaining({ opening: 'casement' }));
      }
      expect(designOf('front-3').frame.widthMm).toBe(675);
      expect(walkLeaves(designOf('front-3').root)[0].casementType).toBe('Fixed');
      c.undo();
      expect(walkLeaves(designOf('door').root)[0].casementType).withContext('one undo takes all three back').toBe('Openable');
      expect(designOf('door').productType).toBe('Door');
      expect(walkLeaves(designOf('front-1').root)[0].casementType).toBe('Fixed');
    });

    it('the structure underneath does not undo while the dialog is open', async () => {
      c.commit({ width: 4200 });
      inner().pick({ kind: 'face', id: 'front-1' }, false);
      c.editPanel();
      await dialog();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
      expect(c.num('width')).toBe(4200);
    });

    it('the price asks for the windows, every wall panel once, and the document with its choices', async () => {
      const body = await ask();
      expect(body.windows.length).toBeGreaterThan(1);
      const named: string[] = body.windows.flatMap((w: { face_ids: string[] }) => w.face_ids);
      expect(new Set(named).size).toBe(named.length);
      expect(named.length).toBe(c.structure!.faces.filter((f) => f.fill.kind === 'design').length);
      expect(body.document.defaults.glassId).toBe(1);
    });
  });

  describe('a panel that cannot be a window', () => {
    it('is plain glass, and says so', async () => {
      await make({ kind: 'cabin' });
      const base = c.structure!;
      const odd: Face = { ...face('front-1'), outline: [[0, 0], [675, 0], [675, 1500], [337, 2400], [0, 1500]] };
      const doc: Structure = { ...base, faces: base.faces.map((f) => (f.id === 'front-1' ? odd : f)) };
      fixture.destroy();
      TestBed.resetTestingModule();
      await make({ kind: 'cabin' });
      inner().open(doc, null);
      fixture.detectChanges();
      expect(face('front-1').fill).toEqual({ kind: 'glass', glassId: null });
      c.selectFaces(['front-1']);
      fixture.detectChanges();
      expect(el.querySelector('[data-why="no-window"]')?.textContent).toContain('no window');
      expect(el.querySelector<HTMLButtonElement>('[data-fill="casement"]')!.disabled).toBeTrue();
      expect(el.querySelector('[data-why="plain-walls"]')?.textContent).toContain('plain glass, priced as glass and bars');
    });
  });

  describe('roof panes, solid panels, bars and hubs', () => {
    it('what a solid panel is made of is a row of the catalogue, chosen where the panel is selected', async () => {
      await make({ kind: 'cabin' });
      c.setParam(c.visibleParams.find((p) => p.key === 'roof')!, 'solid', false);
      inner().pick({ kind: 'face', id: 'roof-1' }, false);
      fixture.detectChanges();
      const select = el.querySelector<HTMLSelectElement>('[data-choose="solid"]')!;
      expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual(['Choose what it is made of', '5mm plain glass', '4mm Plain glass', '6mm bronze glass']);
      select.value = '2';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(face('roof-1').fill).toEqual({ kind: 'panel', productId: 2 });
      expect(face('roof-2').fill).toEqual({ kind: 'panel', productId: null });
    });

    it('a refusal naming the solid panels selects them and opens their control', async () => {
      await make({ kind: 'cabin' }, { id: '12' });
      c.setParam(c.visibleParams.find((p) => p.key === 'roof')!, 'solid', false);
      await ask({ success: false, message: 'Choose what the solid panels are made of.', missing: 'solid_panel' });
      await sleep(30);
      fixture.detectChanges();
      expect(el.querySelector('.sd-price')?.textContent).toContain('No price yet: Choose what the solid panels are made of.');
      expect(c.selectedFaces.length).toBe(4);
      const control = el.querySelector<HTMLElement>('[data-choose="solid"]')!;
      expect(control).not.toBeNull();
      expect(control.closest('.sd-choose')?.classList.contains('is-asked')).toBeTrue();
      expect(document.activeElement).toBe(control);
    });

    it('a refusal naming a bar opens the Bars list at that bar', async () => {
      await make({ kind: 'lean-to' }, { id: '12' });
      c.togglePanel('left', false);
      await ask({ success: false, message: 'Choose a profile for the rafter.', missing: 'bar.rafter' });
      await sleep(30);
      fixture.detectChanges();
      expect(c.leftOpen).toBeTrue();
      const control = el.querySelector<HTMLElement>('[data-choose="bar.rafter"]')!;
      expect(control.closest('.sd-choose')?.classList.contains('is-asked')).toBeTrue();
      expect(document.activeElement).toBe(control);
    });

    it('a refusal naming the colour opens the colour dropdown', async () => {
      await make({ kind: 'cabin' }, { id: '12' });
      await ask({ success: false, status: 0, message: 'Choose the colour of the structure again: the one chosen is no longer in the catalogue.', missing: 'colour', data: { missing: 'colour' } });
      await sleep(30);
      fixture.detectChanges();
      expect(el.querySelector('.sd-price')?.textContent).toContain('Choose the colour of the structure again');
      const control = el.querySelector<HTMLElement>('[data-choose="colour"]')!;
      expect(control.closest('.sd-choose')?.classList.contains('is-asked')).toBeTrue();
      expect(document.activeElement).toBe(control);
    });

    it('a window that cannot be priced is said with its name, and the refusal of the windows is a sentence', async () => {
      await make({ kind: 'cabin' }, { id: '12' });
      await ask({ success: false, status: 0, message: 'Fixed window 675 × 2400: the frame profile has no price.' });
      expect(el.querySelector('.sd-price')?.textContent).toContain('No price yet: Fixed window 675 × 2400: the frame profile has no price.');
      c.setQuantity(2);
      await sleep(PRICE_DEBOUNCE_MS + 80);
      const refusal = { success: false, status: 0, code: 'validation_failed', message: 'Send the window of every wall panel. These have none: door.', data: { errors: ['Send the window of every wall panel. These have none: door.'] } };
      http().expectOne(`${API}/quatation/structure/price`).flush(refusal, { status: 422, statusText: 'Unprocessable' });
      fixture.detectChanges();
      expect(el.querySelector('.sd-price')?.getAttribute('data-price')).toBe('refused');
      expect(el.querySelector('.sd-price')?.textContent).toContain('Send the window of every wall panel.');
    });

    it('a user who may not see costs gets the amount and no details', async () => {
      await make({ kind: 'cabin' }, { id: '12' });
      const { rows, totals, ...amountOnly } = SAMPLE_PRICE;
      void rows;
      void totals;
      await ask({ success: true, data: amountOnly });
      expect(el.querySelector('[data-price="amount"]')?.textContent).toContain('₹73,481.40');
      expect(el.querySelector<HTMLButtonElement>('[data-action="details"]')!.disabled).toBeTrue();
      c.detailsOpen = true;
      fixture.detectChanges();
      expect(el.querySelector('[data-pop="details"]')).toBeNull();
    });

    it('a refusal naming the glass opens the glass dropdown', async () => {
      await make({ kind: 'cabin' }, { id: '12' });
      await ask({ success: false, message: 'Choose the glass.', missing: 'glass' });
      await sleep(30);
      fixture.detectChanges();
      expect(el.querySelector<HTMLElement>('[data-choose="glass"]')!.closest('.sd-choose')?.classList.contains('is-asked')).toBeTrue();
    });

    it('one dropdown for each kind of bar the catalogue charges, profiles from the catalogue; the window frames are not listed', async () => {
      await make({ kind: 'cabin' });
      const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-bar-role]')).map((r) => r.dataset['barRole']);
      expect(rows).toEqual(['eave', 'rafter', 'coupler', 'corner_post']);
      const eave = el.querySelector<HTMLSelectElement>('[data-choose="bar.eave"]')!;
      expect(Array.from(eave.options).map((o) => o.textContent?.trim())).toEqual(['P60-Z · Mullion', 'P60-T · Transom']);
      expect(eave.value).toBe('29');
      const coupler = el.querySelector<HTMLSelectElement>('[data-choose="bar.coupler"]')!;
      expect(coupler.options[0].textContent).toContain('From the accessories');
      eave.value = '30';
      eave.dispatchEvent(new Event('change'));
      expect(c.structure!.defaults.bars['eave']).toBe(30);
      expect(c.structure!.defaults.bars['frame']).toBeUndefined();
    });

    it('the parts say how many bars belong to the wall windows, and a window bar is priced with them', async () => {
      await make({ kind: 'cabin' });
      const m = c.summary!;
      expect(m.windowBars.count).toBeGreaterThan(0);
      expect(m.bars.map((b) => b.role)).not.toContain('frame');
      expect(el.querySelector('[data-why="window-bars"]')?.textContent).toContain(`${m.windowBars.count} more bars are the frame or mullion of the wall windows`);
      const frame = c.structure!.joints.find((j) => j.role === 'frame')!;
      inner().pick({ kind: 'bar', id: frame.id }, false);
      fixture.detectChanges();
      expect(el.querySelector('[data-why="window-bar"]')?.textContent).toContain('priced with them');
      expect(el.querySelector('[data-choose="bar.frame"]')).toBeNull();
    });

    it('a hub is optional: none chosen is a row saying it is not charged', async () => {
      await make({ kind: 'dome' }, { id: '12' });
      await sleep(10);
      fixture.detectChanges();
      expect(el.querySelector('[data-hub-role="crown"] select')).not.toBeNull();
      const select = el.querySelector<HTMLSelectElement>('[data-choose="hub.crown"]')!;
      expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual(['None, not charged', 'Crown hub', 'Node connector']);
      // The api says in a row that a hub with no item is not charged; the page shows the row as sent.
      const notCharged = (role: string, name: string) => ({ kind: 'hub', role, name: `${name}: no catalogue item chosen, not charged`, qty: 1, unit: 'pc', rate: null, amount: 0 });
      await ask({ success: true, data: { ...SAMPLE_PRICE, rows: [notCharged('crown', 'Crown hub'), notCharged('node', 'Node connector')] } });
      (el.querySelector('[data-action="details"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const rows = Array.from(el.querySelectorAll('[data-pop="details"] tbody tr')).map((r) => (r.textContent ?? '').replace(/\s+/g, ' ').trim());
      expect(rows.length).toBe(2);
      expect(rows[0]).toContain('Crown hub: no catalogue item chosen, not charged');
      expect(rows[0]).toContain('₹0.00');
      expect(rows[1]).toContain('Node connector: no catalogue item chosen, not charged');
      select.value = '71';
      select.dispatchEvent(new Event('change'));
      expect(c.structure!.defaults.hubs).toEqual({ crown: 71 });
      fixture.detectChanges();
      expect(c.hubRows.map((h) => [h.role, h.value])).toEqual([['crown', 71], ['node', null]]);
    });
  });

  describe('structures saved before the catalogue', () => {
    it('open with a starting window for each panel, and are priced from the catalogue', async () => {
      await make({}, { id: '12', lineId: '77' });
      const doc = JSON.parse(JSON.stringify(createStructure('lean-to')));
      doc.defaults = { profileSystemId: null, colorId: null, glassId: null };
      http().expectOne(`${API}/quatation/structure/77`).flush({
        success: true,
        data: { id: 77, kind: 'structure', quantity: 1, label: 'Old lean-to', image: null, structure: { type: 'lean-to', name: 'Old lean-to', overall: { widthMm: 3600, depthMm: 2700, heightMm: 2800 }, costing: { price_is_manual: false, unit_price: 1000 } }, document: doc },
      });
      fixture.detectChanges();
      expect(c.structure!.faces.filter((f) => f.fill.kind === 'design').length).toBeGreaterThan(0);
      for (const f of c.structure!.faces.filter((x) => x.fill.kind === 'design')) expect(size(f.id)[0]).withContext(f.id).toBeGreaterThan(0);
      expect(c.structure!.defaults.bars['rafter']).toBe(29);
      expect(c.history?.canUndo).withContext('opening is not a change').toBeFalse();
      const body = await ask();
      const named: string[] = body.windows.flatMap((w: { face_ids: string[] }) => w.face_ids);
      expect(named.sort()).toEqual(c.structure!.faces.filter((f) => f.fill.kind === 'design').map((f) => f.id).sort());
      expect(designOf('left-1').frame.shape.kind).toBe('trapezoid');
    });
  });

  describe('the words on the page', () => {
    it('never ask for a rate, link to a settings page, or say face, fill or joint', async () => {
      await make({ kind: 'lean-to' }, { id: '12' });
      await ask();
      (el.querySelector('[data-action="details"]') as HTMLButtonElement).click();
      c.selectFaces(['front-1']);
      c.togglePanel('left', true);
      c.togglePanel('right', true);
      fixture.detectChanges();
      expect(el.querySelector('a[href*="structure-rates"]')).toBeNull();
      expect(el.querySelector('a[href*="/profile"]')).toBeNull();
      const text = (el.textContent ?? '').replace(/\s+/g, ' ');
      expect(text).not.toMatch(/\b(structure rates?|rate card|faces?|fills?|joints?)\b/i);
    });
  });

  it('keeps a changed panel type: casement on a panel is a casement window at its size', async () => {
    await make({ kind: 'cabin' });
    c.selectFaces(['front-1']);
    c.setFill('casement');
    expect(walkLeaves(designOf('front-1').root)[0].casementType).toBe('Openable');
    expect(size('front-1')).toEqual([675, 2400]);
  });
});
