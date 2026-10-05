/**
 * The designer screen itself (card T82): what Save does with a size that
 * was just typed, and what the size fields say when a size cannot be used.
 * Pricing and the saved payload are covered by designer-roundtrip.spec.ts.
 */
import 'zone.js/testing';

import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { SKIP_ERROR_TOAST, SKIP_LOADER } from 'src/app/shared/interceptors/request-options';
import { ToastService } from 'src/app/shared/services/toast.service';
import { DesignTemplateStore } from '../../../design-lab/design-template-store.service';
import { QuotationService } from '../../quotation.service';
import { Designer3dView, NO_CHUNK_NOTE, NO_WEBGL_NOTE, View3dChunk } from './designer-3d';
import { DesignerCatalogService } from './designer-catalog.service';
import { DesignerHostComponent } from './designer-host.component';
import { PICTURE_HEIGHT_PX, PICTURE_WIDTH_PX, designPicture } from 'src/app/shared/design-canvas/canvas-export';
import { pngSize } from 'src/app/shared/design-canvas/canvas-export.spec';
import { walkLeaves } from 'src/app/shared/design-model';
import { demoCatalog } from './testing/demo-catalog';

describe('DesignerHostComponent (the window designer screen)', () => {
  let fixture: ComponentFixture<DesignerHostComponent>;
  let component: DesignerHostComponent;
  let quotations: jasmine.SpyObj<QuotationService>;
  let router: Router;
  const el = (): HTMLElement => fixture.nativeElement;
  const saveButton = (): HTMLButtonElement => el().querySelector('[data-dz="save"]') as HTMLButtonElement;
  const saves = (): any[] =>
    quotations.quotationManageProduct.calls
      .allArgs()
      .map((args) => args[0] as any)
      .filter((body) => body.is_saved);

  function create(): void {
    quotations = jasmine.createSpyObj('QuotationService', [
      'getQuotationDetail',
      'quotationManageProduct',
      'updateLineDetails',
    ]);
    quotations.getQuotationDetail.and.returnValue(
      of({
        success: true,
        data: {
          quatation_name: 'Patel Villa',
          number: 'Q-0014',
          quatation_product: [],
          totals: { items: [], margin: { name: 'Retail', percent: 20 } },
        },
      } as any)
    );
    quotations.quotationManageProduct.and.callFake((body: any) =>
      of({
        success: true,
        data: { total: Number(body.height), amount: Number(body.height) * 1.2, total_sq_ft: 10, rate_per_sq_ft: 100 },
      } as any)
    );
    const catalogs = jasmine.createSpyObj('DesignerCatalogService', ['fromRouteData', 'ensure']);
    catalogs.fromRouteData.and.returnValue(demoCatalog());
    catalogs.ensure.and.resolveTo();
    const templates = jasmine.createSpyObj('DesignTemplateStore', ['list', 'add', 'remove']);
    templates.list.and.resolveTo([]);

    TestBed.configureTestingModule({
      imports: [DesignerHostComponent, RouterTestingModule],
      providers: [
        { provide: QuotationService, useValue: quotations },
        { provide: DesignerCatalogService, useValue: catalogs },
        { provide: DesignTemplateStore, useValue: templates },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']) },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: '36' }), data: { edit: false } } },
        },
      ],
    });
    fixture = TestBed.createComponent(DesignerHostComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture.detectChanges();
  }

  /** Opens a new window and waits for its first price. */
  function open(): void {
    create();
    flushMicrotasks();
    fixture.detectChanges();
    tick(400);
    flushMicrotasks();
    fixture.detectChanges();
  }

  function typeSize(id: 'dz-w' | 'dz-h', value: string, event: 'input' | 'change'): void {
    const input = el().querySelector('#' + id) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event(event));
    fixture.detectChanges();
  }

  it('saves a typed size on the first press of Save window (M1)', fakeAsync(() => {
    open();
    expect(component.price.state).toBe('live');

    // Leaving the field (the press on Save does that) takes the size in and asks for its price…
    typeSize('dz-h', '1500', 'change');
    flushMicrotasks();
    fixture.detectChanges();
    expect(component.heightMm).toBe(1500);
    expect(component.price.state).toBe('loading');
    // …and the button is still there to take the click.
    expect(saveButton().disabled).toBeFalse();

    saveButton().click();
    fixture.detectChanges();
    expect(saveButton().textContent).toContain('Saving');
    expect(saves().length).withContext('waits for the price').toBe(0);

    tick(400);
    flushMicrotasks();
    expect(saves().length).toBe(1);
    expect(Number(saves()[0].height)).toBe(1500);
    expect(router.navigate).toHaveBeenCalledWith(['/quotation/detail', '36']);
  }));

  it('saves the same picture from a phone as from a desktop: drawn off screen at a fixed size, with no edit marks (N1)', fakeAsync(() => {
    open();
    // A phone: a narrow drawing area, zoomed in, with the frame selected and the Split tool armed.
    (el().querySelector('app-design-canvas') as HTMLElement).style.width = '340px';
    component.canvas!.zoomIn();
    component.canvas!.setSelection({ type: 'frame' });
    component.canvas!.armTool('split-x');
    fixture.detectChanges();
    const onScreen = spyOn(component.canvas!.getStage()!, 'toDataURL').and.callThrough();

    saveButton().click();
    tick(400);
    flushMicrotasks();

    const image: string = saves()[0].image;
    expect(onScreen).withContext('the canvas on the screen is not what gets saved').not.toHaveBeenCalled();
    expect(pngSize(image)).toEqual({ width: PICTURE_WIDTH_PX, height: PICTURE_HEIGHT_PX });
    expect(image).toBe(designPicture(component.effective, { frameFaceMm: 60, glassTints: component.glassTints }));
  }));

  it('closes Price details when the next window starts, so its size boxes are in view (T88)', fakeAsync(() => {
    open();
    // As after a press on "Price details" (the button needs a price with parts, which this api double does not send).
    component.detailsOpen = true;

    const another = Array.from(el().querySelectorAll('button')).find((b) => (b.textContent || '').includes('Save and add another'))!;
    another.click();
    tick(400);
    flushMicrotasks();
    fixture.detectChanges();

    expect(saves().length).toBe(1);
    expect(component.detailsOpen).toBeFalse();
    expect(el().querySelector('[data-dz="details-panel"]')).toBeNull();
    expect(el().querySelector('#dz-w')).not.toBeNull();
    tick(400);
    flushMicrotasks();
  }));

  it('works out the price while a size is typed, after a short pause', fakeAsync(() => {
    open();
    const before = quotations.quotationManageProduct.calls.count();
    typeSize('dz-w', '1800', 'input');
    expect(component.widthMm).not.toBe(1800);
    tick(600);
    flushMicrotasks();
    expect(component.widthMm).toBe(1800);
    tick(400);
    flushMicrotasks();
    expect(quotations.quotationManageProduct.calls.count()).toBe(before + 1);
    expect(saves().length).toBe(0);
  }));

  it('prices without the global overlay, which would take the click on Save made while the price is on its way', fakeAsync(() => {
    open();
    typeSize('dz-h', '1500', 'input');
    tick(1000);
    flushMicrotasks();
    const priced = quotations.quotationManageProduct.calls.mostRecent().args as any[];
    expect(priced[0].is_saved).toBeFalsy();
    expect(priced[1].context.get(SKIP_LOADER)).toBeTrue();
    expect(priced[1].context.get(SKIP_ERROR_TOAST)).toBeFalse();
  }));

  it('says the limits when a size cannot be used, and keeps the window as it was (m1)', fakeAsync(() => {
    open();
    const width = component.widthMm;
    typeSize('dz-w', '0', 'change');
    flushMicrotasks();
    fixture.detectChanges();
    expect(component.widthMm).toBe(width);
    expect(el().querySelector('[data-dz="size-error"]')?.textContent).toContain('Width must be between 200 and 5800 mm.');
    expect(el().querySelector('#dz-w')?.getAttribute('aria-invalid')).toBe('true');
    expect(saveButton().disabled).toBeTrue();

    typeSize('dz-w', '1200', 'change');
    flushMicrotasks();
    fixture.detectChanges();
    expect(el().querySelector('[data-dz="size-error"]')).toBeNull();
    expect(component.widthMm).toBe(1200);
    tick(400);
    flushMicrotasks();
  }));

  describe('2D | 3D (T113)', () => {
    const press3d = (): void => {
      (el().querySelector('[data-dz="view-3d"]') as HTMLButtonElement).click();
      flushMicrotasks();
      fixture.detectChanges();
    };
    const pressed = (which: '2d' | '3d'): string | null =>
      el().querySelector(`[data-dz="view-${which}"]`)?.getAttribute('aria-pressed') ?? null;

    it('opens on 2D with the switch in the view tools', fakeAsync(() => {
      open();
      expect(pressed('2d')).toBe('true');
      expect(pressed('3d')).toBe('false');
      expect(el().querySelector('[data-dz="view-note"]')).toBeNull();
      expect(el().querySelector('app-design-canvas')).not.toBeNull();
    }));

    it('a tap on a pane in 3D selects it as a tap on the drawing does: the panel turns to "Selected pane" (T124)', fakeAsync(() => {
      open();
      const paneId = walkLeaves(component.effective.root)[0].id;
      const tabPane = (): string | null => el().querySelector('[data-dz="tab-pane"]')?.getAttribute('aria-pressed') ?? null;
      expect(tabPane()).toBe('false');
      const priced = quotations.quotationManageProduct.calls.count();

      component.onPick3d({ paneId, add: false });
      fixture.detectChanges();
      expect(component.selection).toEqual({ type: 'pane', paneId });
      expect(component.canvas?.selection).toEqual({ type: 'pane', paneId });
      expect(tabPane()).toBe('true');
      expect(component.selectedLeaf?.id).toBe(paneId);

      // Shift-tap on a selected pane takes it out again; a tap on empty space clears.
      component.onPick3d({ paneId, add: true });
      expect(component.selection).toBeNull();
      component.onPick3d({ paneId, add: true });
      expect(component.selection).toEqual({ type: 'pane', paneId });
      component.onPick3d({ paneId: null, add: false });
      expect(component.selection).toBeNull();
      // Selecting changes nothing in the document: no price is asked for.
      expect(quotations.quotationManageProduct.calls.count()).toBe(priced);
    }));

    it('a 3D chunk that cannot be fetched: the reason is said, the drawing stays, price and Save are untouched', fakeAsync(() => {
      open();
      component.view3d = new Designer3dView(() => Promise.reject(new Error('ChunkLoadError')));
      const priced = quotations.quotationManageProduct.calls.count();
      press3d();
      expect(el().querySelector('[data-dz="view-note"]')?.textContent).toContain(NO_CHUNK_NOTE);
      expect(pressed('2d')).toBe('true');
      expect(el().querySelector('[data-dz="stage3d"]')?.classList.contains('on')).toBeFalse();
      expect(el().querySelector('[data-dz="stage3d"]')?.children.length).withContext('never a blank area').toBe(0);
      expect(el().querySelector('app-design-canvas')).not.toBeNull();
      expect(saveButton().disabled).toBeFalse();
      expect(quotations.quotationManageProduct.calls.count()).toBe(priced);
    }));

    it('a device without WebGL: the reason is said and the designer stays on 2D', fakeAsync(() => {
      open();
      component.view3d = new Designer3dView(() =>
        Promise.resolve({ Design3dComponent: class {}, webglAvailable: () => false } as unknown as View3dChunk)
      );
      press3d();
      expect(el().querySelector('[data-dz="view-note"]')?.textContent).toContain(NO_WEBGL_NOTE);
      expect(pressed('2d')).toBe('true');
      expect(el().querySelector('[data-dz="stage3d"]')?.children.length).toBe(0);

      // 2D takes the reason away again.
      (el().querySelector('[data-dz="view-2d"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el().querySelector('[data-dz="view-note"]')).toBeNull();
    }));
  });
});
