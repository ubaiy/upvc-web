import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';

import { ToastService } from 'src/app/shared/services/toast.service';
import { environment } from 'src/environments/environment';
import { StructureRatesAnswer } from '../../structure-designer/structure-line.service';
import { rateGroups, ratesFrom, StructureRatesTabComponent } from './structure-rates-tab.component';

const API = environment.API_URL;

/** GET structure-rates as the demo answers it, with some figures set. */
function answer(): StructureRatesAnswer {
  return {
    rates: {
      glass_rate_sq_m: { default: 1800, by_glass: { toughened_6: 2400 } },
      solid_panel_rate_sq_m: 2200,
      bar_rate_m: { default: null, frame: 450, rafter: null, hip: null },
      hub_rate: { default: 1200, crown: 2500 },
      opening_extra: { casement: 3500, 'top-hung': 2800, door: 6500, sliding: 0 },
      wastage_pct: 5,
      labour_rate_sq_ft: 60,
      installation_rate_sq_ft: 40,
      overhead_pct: 10,
    },
    bar_roles: ['frame', 'rafter', 'hip'],
    hub_roles: ['crown', 'node'],
    openings: ['casement', 'top-hung', 'door', 'sliding'],
    missing: ['bar_rate_m.rafter', 'bar_rate_m.hip'],
  };
}

describe('Settings, Structure rates', () => {
  it('lays the api rates out in plain words, each with its unit, and gives the same object back', () => {
    const groups = rateGroups(answer());
    expect(groups.map((g) => g.title)).toEqual([
      'Glass and solid panels',
      'Bars, per metre',
      'Hubs',
      'Extra for a panel that opens',
      'Wastage, labour, installation and overhead',
    ]);
    const fields = groups.flatMap((g) => g.fields);
    const of = (path: string) => fields.find((f) => f.path === path)!;
    expect(of('glass_rate_sq_m.default')).toEqual(jasmine.objectContaining({ label: 'Glass, usual rate', unit: 'per sq m', money: true, value: '1800' }));
    expect(of('glass_rate_sq_m.by_glass.toughened_6').label).toBe('Glass: Toughened 6');
    expect(of('bar_rate_m.rafter')).toEqual(jasmine.objectContaining({ label: 'Rafter', unit: 'per metre', value: '' }));
    expect(of('bar_rate_m.hip').label).toBe('Hip rafter');
    expect(of('hub_rate.node')).toEqual(jasmine.objectContaining({ label: 'Node connector', unit: 'each', value: '' }));
    expect(of('opening_extra.sliding').value).withContext('0 is a figure, not "not set"').toBe('0');
    expect(of('wastage_pct')).toEqual(jasmine.objectContaining({ unit: '%', money: false, value: '5' }));
    expect(of('labour_rate_sq_ft').unit).toBe('per sq ft');

    // Nothing typed: what goes back is what came, with "not set" as null.
    expect(ratesFrom(groups)).toEqual({ ...answer().rates, hub_rate: { default: 1200, crown: 2500, node: null } });
    of('bar_rate_m.rafter').value = '650';
    of('wastage_pct').value = '';
    const sent = ratesFrom(groups);
    expect(sent.bar_rate_m['rafter']).toBe(650);
    expect(sent.wastage_pct).toBeNull();
  });

  describe('the page', () => {
    let fixture: ComponentFixture<StructureRatesTabComponent>;
    let http: HttpTestingController;
    let toast: jasmine.SpyObj<ToastService>;
    const el = (): HTMLElement => fixture.nativeElement;
    const text = (): string => (el().textContent ?? '').replace(/\s+/g, ' ');

    beforeEach(async () => {
      toast = jasmine.createSpyObj('ToastService', ['showSuccess']);
      await TestBed.configureTestingModule({
        imports: [StructureRatesTabComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: ToastService, useValue: toast },
          { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ missing: 'bar_rate_m.rafter' }) } } },
        ],
      }).compileComponents();
      fixture = TestBed.createComponent(StructureRatesTabComponent);
      http = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
    });

    it('marks the rates the api reports as missing, shows rupee and unit on each field, and saves the whole object', async () => {
      http.expectOne(`${API}/structure-rates`).flush({ success: true, data: answer() });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(text()).toContain('2 rates are not set');
      const missing = Array.from(el().querySelectorAll('.field.is-missing label')).map((l) => l.textContent?.trim());
      expect(missing).toEqual(['Rafter', 'Hip rafter']);
      expect(el().querySelector('.field.is-asked label')?.textContent).withContext('the rate a refused price named').toContain('Rafter');
      const rafter = el().querySelector('#rate-bar-rate-m-rafter') as HTMLInputElement;
      const units = Array.from(rafter.closest('.input-group')!.querySelectorAll('.unit')).map((u) => u.textContent?.trim());
      expect(units).toEqual(['₹', 'per metre']);
      const wastage = el().querySelector('#rate-wastage-pct') as HTMLInputElement;
      expect(Array.from(wastage.closest('.input-group')!.querySelectorAll('.unit')).map((u) => u.textContent?.trim())).toEqual(['%']);

      rafter.value = '650';
      rafter.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(text()).toContain('You have unsaved changes.');
      (el().querySelector('button[type=submit]') as HTMLButtonElement).click();
      const put = http.expectOne(`${API}/structure-rates`);
      expect(put.request.method).toBe('PUT');
      expect(put.request.body.rates.bar_rate_m).toEqual({ default: null, frame: 450, rafter: 650, hip: null });
      expect(put.request.body.rates.glass_rate_sq_m).toEqual({ default: 1800, by_glass: { toughened_6: 2400 } });
      const after = answer();
      after.rates.bar_rate_m['rafter'] = 650;
      after.missing = ['bar_rate_m.hip'];
      put.flush({ success: true, data: after });
      fixture.detectChanges();
      expect(toast.showSuccess).toHaveBeenCalledWith('Structure rates saved');
      expect(text()).toContain('One rate is not set');
    });

    it('says so when the rates cannot be read, with a way to try again', () => {
      http.expectOne(`${API}/structure-rates`).error(new ProgressEvent('error'));
      fixture.detectChanges();
      expect(text()).toContain('We could not load the structure rates.');
      (el().querySelector('.btn-secondary') as HTMLButtonElement).click();
      http.expectOne(`${API}/structure-rates`);
    });
  });
});
