import { SimpleChange } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { CatalogueAdapter } from '../masters/catalogue.adapter';
import { PriceFactors, ProfileRow } from '../masters/catalogue.model';
import { RatesUpdated, UpdateRatesDialogComponent } from './update-rates-dialog.component';

const FACTORS: PriceFactors = { per_kg: 190, rate_bar: 5.8, color_per_kg: 410, color_rate_bar: 5.8 };

function profile(id: number, category: string, sub: string, kg: number): ProfileRow {
  return {
    id, category, profile_code: 'P' + id, profile_name: `${category} ${sub}`, sub_category: sub,
    kg_meter: kg, kg_meter_color: kg,
    rate_meter: +(kg * 190).toFixed(2), rate_bar: +(kg * 190 * 5.8).toFixed(2),
    rate_meter_color: +(kg * 410).toFixed(2), rate_bar_color: +(kg * 410 * 5.8).toFixed(2),
  };
}

const PROFILES = [
  profile(1, 'Casement', 'Frame', 1.01),
  profile(2, 'Casement', 'Sash', 1.29),
  profile(3, 'Slidding', 'Frame', 1.5),
];

describe('UpdateRatesDialogComponent', () => {
  let fixture: ComponentFixture<UpdateRatesDialogComponent>;
  let component: UpdateRatesDialogComponent;
  let adapter: jasmine.SpyObj<CatalogueAdapter>;
  let updated: RatesUpdated[];

  function open(factors: PriceFactors | null = FACTORS): void {
    component.profiles = PROFILES;
    component.factors = factors;
    component.visible = true;
    component.ngOnChanges({ visible: new SimpleChange(false, true, false) });
    fixture.detectChanges();
  }

  beforeEach(async () => {
    adapter = jasmine.createSpyObj<CatalogueAdapter>('CatalogueAdapter', ['updateAllRates', 'saveProfileRates', 'message']);
    adapter.message.and.callFake((_err: unknown, fallback?: string) => fallback ?? 'failed');
    await TestBed.configureTestingModule({
      imports: [UpdateRatesDialogComponent, NoopAnimationsModule],
      providers: [{ provide: CatalogueAdapter, useValue: adapter }],
    }).compileComponents();
    fixture = TestBed.createComponent(UpdateRatesDialogComponent);
    component = fixture.componentInstance;
    updated = [];
    component.updated.subscribe((u) => updated.push(u));
  });

  it('previews a sample window before saving a percentage', () => {
    open();
    expect(component.preview).toBeNull();
    component.form.patchValue({ percent: '5' });
    const preview = component.preview;
    // 5.4 m of frame at 191.90 + 5.0 m of sash at 245.10, then both re-derived at 5% more per kg.
    expect(preview?.before).toBe(2261.76);
    expect(preview?.after).toBe(2374.9); // each rate is rounded to paise first, as the API does
    expect(component.nextFactors).toEqual({ per_kg: 199.5, rate_bar: 5.8, color_per_kg: 430.5, color_rate_bar: 5.8 });
  });

  it('raises every profile with one call that carries the new factors', () => {
    adapter.updateAllRates.and.returnValue(of(undefined));
    open();
    component.form.patchValue({ percent: '5' });
    component.submit();
    expect(adapter.updateAllRates).toHaveBeenCalledOnceWith({ per_kg: 199.5, rate_bar: 5.8, color_per_kg: 430.5, color_rate_bar: 5.8 });
    expect(adapter.saveProfileRates).not.toHaveBeenCalled();
    expect(updated).toEqual([{ count: 3, all: true, rows: [] }]);
    expect(component.visible).toBeFalse();
  });

  it('changes one category profile by profile and leaves the factors alone', () => {
    adapter.saveProfileRates.and.callFake((rows, rates) => of(rows.map((r) => ({ ...r, ...rates(r) }))));
    open();
    component.form.patchValue({ category: 'Casement', percent: '-10' });
    expect(component.affected.length).toBe(2);
    expect(component.nextFactors).toBeNull();
    component.submit();
    expect(adapter.updateAllRates).not.toHaveBeenCalled();
    const [rows] = adapter.saveProfileRates.calls.mostRecent().args;
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
    expect(updated[0].all).toBeFalse();
    expect(updated[0].rows[0].rate_meter).toBe(172.71); // 191.90 less 10%
  });

  it('sends nothing for a zero, an empty or an out-of-range entry', () => {
    open();
    for (const percent of ['', '0', 'abc', '-95', '900']) {
      component.form.patchValue({ percent });
      component.submit();
    }
    component.setMode('rate');
    component.form.patchValue({ per_kg: '0' });
    component.submit();
    component.form.patchValue({ per_kg: '2000000' });
    component.submit();
    expect(adapter.updateAllRates).not.toHaveBeenCalled();
    expect(adapter.saveProfileRates).not.toHaveBeenCalled();
    expect(component.visible).toBeTrue();
  });

  it('sets a new rate per kg for every profile', () => {
    adapter.updateAllRates.and.returnValue(of(undefined));
    open();
    component.setMode('rate');
    component.form.patchValue({ per_kg: '200' });
    component.submit();
    expect(adapter.updateAllRates).toHaveBeenCalledOnceWith({ per_kg: 200, rate_bar: 5.8, color_per_kg: 410, color_rate_bar: 5.8 });
  });

  it('starts on "New rate per kg" when no rate has been set yet', () => {
    open(null);
    expect(component.mode).toBe('rate');
    expect(component.canUsePercent).toBeFalse();
  });

  it('stays open and says what happened when the save fails', () => {
    adapter.updateAllRates.and.returnValue(throwError(() => new Error('down')));
    open();
    component.form.patchValue({ percent: '5' });
    component.submit();
    expect(component.visible).toBeTrue();
    expect(component.saving).toBeFalse();
    expect(component.error).toBe('The rates were not updated. Try again.');
    expect(updated).toEqual([]);
  });
});
