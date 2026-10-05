import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { ToastService } from 'src/app/shared/services/toast.service';
import { environment } from 'src/environments/environment';
import { PricingExtras, toPricingExtras } from '../pricing-extras.service';
import { PricingExtrasCardComponent, extraRateFields, extraRatesFrom } from './pricing-extras-card.component';

const API = environment.API_URL;
const URL = `${API}/pricing-settings/extras`;

/** GET pricing-settings/extras as the api answers it for a company that set nothing. */
function answer(over: Partial<PricingExtras['rates']> = {}, pivot: any[] = []): any {
  const rates = { sash_bar_rate_m: null, bend_rate_per_bend: null, bend_rate_per_m: null, shaped_glass_surcharge_pct: null, ...over };
  return {
    rates,
    units: {
      sash_bar_rate_m: 'INR per m',
      bend_rate_per_bend: 'INR per bend',
      bend_rate_per_m: 'INR per m',
      shaped_glass_surcharge_pct: 'percent',
    },
    missing: Object.keys(rates).filter((key) => !((rates as any)[key] > 0)),
    pivot_hardware: { available: pivot.length > 0, items: pivot },
  };
}

describe('Settings, Bars, bending and shaped glass', () => {
  it('reads the api answer into four fields with their unit, and gives the same rates back', () => {
    const fields = extraRateFields(toPricingExtras(answer({ sash_bar_rate_m: 120, shaped_glass_surcharge_pct: 0 })));
    expect(fields.map((f) => [f.key, f.unit, f.money, f.value])).toEqual([
      ['sash_bar_rate_m', 'per metre', true, '120'],
      ['bend_rate_per_bend', 'per bend', true, ''],
      ['bend_rate_per_m', 'per metre', true, ''],
      ['shaped_glass_surcharge_pct', '%', false, '0'],
    ]);
    expect(fields[0].text).toBe('Charged for every metre of bar inside a sash or shutter.');
    expect(extraRatesFrom(fields)).toEqual({
      sash_bar_rate_m: 120,
      bend_rate_per_bend: null,
      bend_rate_per_m: null,
      shaped_glass_surcharge_pct: 0,
    });
    // An answer that leaves keys out still has all four, as "not set".
    expect(toPricingExtras({}).rates).toEqual({
      sash_bar_rate_m: null,
      bend_rate_per_bend: null,
      bend_rate_per_m: null,
      shaped_glass_surcharge_pct: null,
    });
  });

  describe('the card', () => {
    let fixture: ComponentFixture<PricingExtrasCardComponent>;
    let http: HttpTestingController;
    let toast: jasmine.SpyObj<ToastService>;
    const el = (): HTMLElement => fixture.nativeElement;
    const text = (): string => (el().textContent ?? '').replace(/\s+/g, ' ');
    const input = (key: string): HTMLInputElement => el().querySelector(`[data-rate="${key}"] input`) as HTMLInputElement;
    const type = (key: string, value: string): void => {
      input(key).value = value;
      input(key).dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const settle = async (): Promise<void> => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    beforeEach(async () => {
      toast = jasmine.createSpyObj('ToastService', ['showSuccess']);
      await TestBed.configureTestingModule({
        imports: [PricingExtrasCardComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          { provide: ToastService, useValue: toast },
          { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
        ],
      }).compileComponents();
      fixture = TestBed.createComponent(PricingExtrasCardComponent);
      http = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
    });

    afterEach(() => http.verify());

    it('shows the four rates with rupee or percent and their unit, a plain line each, and marks the ones not set', async () => {
      http.expectOne(URL).flush({ success: true, data: answer({ bend_rate_per_bend: 500 }) });
      await settle();
      expect(text()).toContain('Bars, bending and shaped glass');
      expect(text()).toContain('3 rates are not set, so they charge nothing');
      const units = (key: string): (string | undefined)[] =>
        Array.from(el().querySelectorAll(`[data-rate="${key}"] .unit`)).map((u) => u.textContent?.trim());
      expect(units('sash_bar_rate_m')).toEqual(['₹', 'per metre']);
      expect(units('bend_rate_per_bend')).toEqual(['₹', 'per bend']);
      expect(units('bend_rate_per_m')).toEqual(['₹', 'per metre']);
      expect(units('shaped_glass_surcharge_pct')).toEqual(['%']);
      expect(el().querySelector('[data-rate="sash_bar_rate_m"]')?.textContent).toContain(
        'Charged for every metre of bar inside a sash or shutter.'
      );
      expect(input('bend_rate_per_bend').value).toBe('500');
      const missing = Array.from(el().querySelectorAll('.field.is-missing')).map((f) => f.getAttribute('data-rate'));
      expect(missing).toEqual(['sash_bar_rate_m', 'bend_rate_per_m', 'shaped_glass_surcharge_pct']);
      // No pivot set in the catalogue: the card says where to add one.
      expect(el().querySelector('[data-extras="pivot"]')?.textContent).toContain('add an item in the group “Pivot Hardware”');
      expect(el().querySelector('[data-extras="pivot"] a')?.getAttribute('href')).toBe('/masters/hardware');
    });

    it('saves all four: a typed figure as a number, an emptied box as null', async () => {
      http.expectOne(URL).flush({ success: true, data: answer({ bend_rate_per_bend: 500 }) });
      await settle();
      type('sash_bar_rate_m', '120.5');
      type('bend_rate_per_bend', '');
      expect(text()).toContain('You have unsaved changes.');
      (el().querySelector('button[type=submit]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect((el().querySelector('button[type=submit]') as HTMLButtonElement).textContent).toContain('Saving…');
      const put = http.expectOne(URL);
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual({
        rates: { sash_bar_rate_m: 120.5, bend_rate_per_bend: null, bend_rate_per_m: null, shaped_glass_surcharge_pct: null },
      });
      put.flush({ success: true, data: answer({ sash_bar_rate_m: 120.5 }) });
      await settle();
      expect(toast.showSuccess).toHaveBeenCalledWith('Rates saved');
      expect(text()).toContain('3 rates are not set');
      expect(el().querySelector('[data-rate="sash_bar_rate_m"]')?.classList.contains('is-missing')).toBeFalse();
      expect(text()).not.toContain('You have unsaved changes.');
    });

    it('does not send a figure it can see is wrong, and shows the api refusal of a field under that field', async () => {
      http.expectOne(URL).flush({ success: true, data: answer() });
      await settle();
      type('shaped_glass_surcharge_pct', '140');
      (el().querySelector('button[type=submit]') as HTMLButtonElement).click();
      fixture.detectChanges();
      http.expectNone(URL);
      expect(el().querySelector('[data-rate="shaped_glass_surcharge_pct"] .error')?.textContent).toContain('Enter a percentage from 0 to 100.');

      type('shaped_glass_surcharge_pct', '30');
      (el().querySelector('button[type=submit]') as HTMLButtonElement).click();
      http.expectOne(URL).flush(
        {
          success: false,
          code: 'validation_failed',
          message: 'bend_rate_per_m must be a number of 0 or more, or null to unset it.',
          data: { errors: { bend_rate_per_m: 'bend_rate_per_m must be a number of 0 or more, or null to unset it.' } },
        },
        { status: 422, statusText: 'Unprocessable Content' }
      );
      await settle();
      expect(el().querySelector('[data-rate="bend_rate_per_m"] .error')?.textContent).toContain('must be a number of 0 or more');
      expect(text()).toContain('Some figures were not accepted.');
      expect(input('shaped_glass_surcharge_pct').value).withContext('what was typed stays').toBe('30');
    });

    it('lists the pivot hardware of the catalogue with its price', async () => {
      http.expectOne(URL).flush({ success: true, data: answer({}, [{ id: 7, name: 'Centre pivot set', rate: 1500 }]) });
      await settle();
      const pivot = el().querySelector('[data-extras="pivot"]')!;
      expect(pivot.textContent).toContain('Centre pivot set');
      expect(pivot.textContent).toContain('1,500');
      expect(pivot.textContent).not.toContain('None yet');
    });

    it('an api without the route (404): "This setting is not available yet", never an error', async () => {
      http.expectOne(URL).flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
      await settle();
      expect(el().querySelector('[data-extras="absent"]')?.textContent).toContain('This setting is not available yet.');
      expect(el().querySelector('form')).toBeNull();
      expect(text()).not.toContain('could not load');
    });

    it('any other failure says so with Try again', async () => {
      http.expectOne(URL).error(new ProgressEvent('error'));
      await settle();
      expect(text()).toContain('We could not load these rates. We could not reach the server.');
      (el().querySelector('.btn-secondary') as HTMLButtonElement).click();
      http.expectOne(URL).flush({ success: true, data: answer() });
      await settle();
      expect(el().querySelector('form')).not.toBeNull();
    });

    it('Save follows the ability settings.write (the shared write gate: write.directive.spec.ts)', async () => {
      http.expectOne(URL).flush({ success: true, data: answer() });
      await settle();
      expect(el().querySelector('button[type=submit]')?.getAttribute('appWrite')).toBe('settings.write');
    });
  });
});
