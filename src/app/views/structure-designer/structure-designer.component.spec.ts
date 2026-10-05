import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { fillKey, serializeStructure } from '../../shared/structure-model';
import { StructureDesignerComponent } from './structure-designer.component';
import { StructureStoreService } from './structure-store.service';

const STORE_KEY = 'upvc.structures.v1';

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

  async function make(query: Record<string, string> = {}): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [StructureDesignerComponent],
      providers: [{ provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } }],
    }).compileComponents();
    fixture = TestBed.createComponent(StructureDesignerComponent);
    c = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
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
    expect(cards.map((b) => b.dataset['kind'])).toEqual(['dome', 'cabin', 'bay', 'pyramid', 'lean-to', 'gable']);
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
    expect(el.querySelector('.sd-note')?.textContent).toContain('Sizes are geometric centre-line sizes; workshop cut sizes and prices come in the next step.');
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
    expect(c.barInfo).toEqual({ role: 'Rib', length: 633, faces: 2 });
    expect(c.selectedFaces).toEqual([]);
    expect(el.querySelector('.sd-sec--panel')?.textContent).toContain('True length');
  });

  it('a row of the parts summary selects its panels', async () => {
    await make({ kind: 'dome' });
    fixture.detectChanges();
    el.querySelector<HTMLElement>('.sd-sec--parts .sd-table tbody tr')?.click();
    expect(c.selectedFaces.length).toBe(12);
  });

  it('a glass tint can be given to the selected panels only, and taken back', async () => {
    await make({ kind: 'cabin' });
    inner().pick({ kind: 'face', id: 'front-1' }, false);
    inner().pick({ kind: 'face', id: 'front-2' }, true);
    fixture.detectChanges();
    const swatches = el.querySelectorAll<HTMLElement>('[data-tint="face"] button');
    expect(swatches.length).toBe(c.glassTints.length + 1);
    expect(c.faceInfo).toEqual(jasmine.objectContaining({ glazed: true, tint: '#9fc4cf', ownTint: false }));
    swatches[3].click(); // bronze
    fixture.detectChanges();
    const tintOf = (id: string): string | undefined => c.structure!.faces.find((f) => f.id === id)!.glassTint;
    expect([tintOf('front-1'), tintOf('front-2'), tintOf('front-3')]).toEqual(['#b89f7a', '#b89f7a', undefined]);
    expect(c.structure!.appearance.glassTint).toBe('#9fc4cf');
    expect(c.faceInfo).toEqual(jasmine.objectContaining({ tint: '#b89f7a', ownTint: true }));
    // It stays through a resize; "As the structure" takes it off again.
    c.commit({ height: 2700 });
    expect(tintOf('front-1')).toBe('#b89f7a');
    c.setFaceTint(null);
    expect(tintOf('front-1')).toBeUndefined();
    // A solid panel has no glass to tint.
    c.selectFaces(['front-1']);
    c.setFill('panel');
    expect(c.faceInfo?.glazed).toBeFalse();
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

  it('profile colour and glass tint apply to the whole structure; reset goes back to the defaults', async () => {
    await make({ kind: 'gable' });
    c.setColour('#3b3f44');
    c.setTint('#8fbf9f');
    c.commit({ width: 4800 });
    expect(c.structure?.appearance).toEqual({ profileColour: '#3b3f44', glassTint: '#8fbf9f' });
    c.reset();
    expect(c.structure?.appearance.profileColour).toBe('#f4f4f1');
    expect(c.num('width')).toBe(3600);
    c.undo();
    expect(c.num('width')).toBe(4800);
  });

  it('saves, lists and loads a structure in the browser', async () => {
    await make({ kind: 'lean-to' });
    c.rename('Verandah for Mr Shah');
    c.commit({ projection: 3000 });
    inner().pick({ kind: 'face', id: 'front-2' }, false);
    c.setFill('door');
    const saved = serializeStructure(c.structure!);
    c.save();
    c.save(); // a second save goes over the first
    expect(c.saved.length).toBe(1);
    expect(c.message).toContain('Saved');
    c.close();
    fixture.detectChanges();
    expect(el.querySelector('.sd-saved__row strong')?.textContent).toBe('Verandah for Mr Shah');
    el.querySelector<HTMLElement>('.sd-saved__row')?.click();
    fixture.detectChanges();
    expect(serializeStructure(c.structure!)).toBe(saved);
    expect(c.num('projection')).toBe(3000);
    c.removeSaved(c.saved[0], new Event('click'));
    expect(TestBed.inject(StructureStoreService).list()).toEqual([]);
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
    expect(el.querySelectorAll('.sd-card').length).toBe(6);
  });
});
