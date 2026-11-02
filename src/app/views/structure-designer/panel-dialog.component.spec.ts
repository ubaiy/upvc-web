import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DesignCanvasComponent } from '../../shared/design-canvas/design-canvas.component';
import { DesignInspectorComponent } from '../../shared/design-canvas/design-inspector.component';
import { setWindowGlass, walkLeaves, WindowDesign } from '../../shared/design-model';
import { createStructure, Face, Structure } from '../../shared/structure-model';
import { DesignerCatalogService } from '../quotation/sub-quotation/sub-quotation-design/designer-catalog.service';
import { PanelDialogComponent } from './panel-dialog.component';
import { withWindows } from './panel-designs';
import { fakeCatalogs, structureCatalog } from './testing';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('PanelDialogComponent (the window of a wall panel, edited as a window)', () => {
  let fixture: ComponentFixture<PanelDialogComponent>;
  let c: PanelDialogComponent;
  let el: HTMLElement;
  let structure: Structure;
  let face: Face;
  let saved: WindowDesign[];
  let cancelled: number;

  async function open(id = 'front-1', panels = 1): Promise<void> {
    structure = withWindows(createStructure('cabin'));
    face = structure.faces.find((f) => f.id === id)!;
    const fill = face.fill;
    if (fill.kind !== 'design' || !fill.design) throw new Error('no design');
    await TestBed.configureTestingModule({
      imports: [PanelDialogComponent],
      providers: [{ provide: DesignerCatalogService, useValue: fakeCatalogs() }],
    }).compileComponents();
    fixture = TestBed.createComponent(PanelDialogComponent);
    c = fixture.componentInstance;
    el = fixture.nativeElement;
    saved = [];
    cancelled = 0;
    c.design = fill.design;
    c.face = face;
    c.panels = panels;
    c.title = face.label;
    c.catalog = structureCatalog();
    c.saved.subscribe((d) => saved.push(d));
    c.cancelled.subscribe(() => cancelled++);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => fixture?.destroy());

  it('opens as a dialog with the same drawing and the same inspector as the window designer', async () => {
    await open();
    const dialog = el.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.querySelector('h2')?.textContent).toContain('Front wall, panel 1');
    expect(fixture.debugElement.query((d) => d.componentInstance instanceof DesignCanvasComponent)).not.toBeNull();
    expect(fixture.debugElement.query((d) => d.componentInstance instanceof DesignInspectorComponent)).not.toBeNull();
    expect(c.effective.frame.widthMm).toBe(675);
    expect(c.effective.frame.heightMm).toBe(2400);
    expect(walkLeaves(c.effective.root)[0].productId).withContext('complete with the catalogue').not.toBeNull();
  });

  it('offers the glass rows of the catalogue to the window, and the sash, handle and hinge lists of the pane', async () => {
    await open();
    expect(c.glassOptions.map((g) => g.id)).toEqual([1, 2, 15, 16]);
    const inspector = fixture.debugElement.query((d) => d.componentInstance instanceof DesignInspectorComponent).componentInstance as DesignInspectorComponent;
    expect(inspector.glassOptions.length).toBe(4);
    expect(inspector.colorOptions).withContext('the colour is the structure\'s').toEqual([]);
    expect(c.hingeOptions).toEqual(['Flate Hinges', 'Friction', '3D Hinges']);
  });

  it('Save gives back the edited window, complete', async () => {
    await open();
    c.onInspectorChange(setWindowGlass(c.effective, 16));
    await sleep(10);
    expect(c.effective.glazing.glassId).toBe(16);
    await c.save();
    expect(saved.length).toBe(1);
    expect(saved[0].glazing.glassId).toBe(16);
    expect(saved[0].frame.widthMm).toBe(675);
    expect(cancelled).toBe(0);
  });

  it('Cancel gives back nothing', async () => {
    await open();
    c.onInspectorChange(setWindowGlass(c.effective, 16));
    await sleep(10);
    el.querySelector<HTMLButtonElement>('[data-pd="cancel"]')!.click();
    expect(cancelled).toBe(1);
    expect(saved).toEqual([]);
  });

  it('Escape is Cancel', async () => {
    await open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(cancelled).toBe(1);
    expect(saved).toEqual([]);
  });

  it('the panel decides the size and the shape: a size dragged in the drawing goes back', async () => {
    await open();
    const wide = { ...c.effective, frame: { ...c.effective.frame, widthMm: 900 } };
    c.onModelChange(wide);
    await sleep(20);
    expect(c.effective.frame.widthMm).toBe(675);
    expect(c.effective.frame.heightMm).toBe(2400);
  });

  it('says how many panels will take the design when several are chosen', async () => {
    await open('front-1', 3);
    expect(el.querySelector('[data-pd="scope"]')?.textContent).toContain('3 panels');
    expect(el.querySelector('[data-pd="save"]')?.textContent).toContain('3 panels');
  });

  it('keeps Tab inside the dialog: from the last button it goes to the first', async () => {
    await open();
    const box = el.querySelector<HTMLElement>('.pd-box')!;
    const buttons = Array.from(box.querySelectorAll<HTMLElement>('button:not([disabled]), select, input, [tabindex="0"]')).filter((e) => e.offsetParent !== null);
    buttons[buttons.length - 1].focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    box.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(buttons[0]);
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    box.dispatchEvent(back);
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  });

  it('fills the screen on a phone and has no sideways scroll', async () => {
    await open();
    const box = el.querySelector<HTMLElement>('.pd-box')!;
    expect(getComputedStyle(box).position).not.toBe('absolute');
    expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1);
  });
});
