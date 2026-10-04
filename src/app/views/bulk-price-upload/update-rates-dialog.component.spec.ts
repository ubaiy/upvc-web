import { SimpleChange } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { CatalogueAdapter } from '../masters/catalogue.adapter';
import { PriceFactors, ProfileRow, RatePreview, RateRequest } from '../masters/catalogue.model';
import { PREVIEW_DELAY_MS, RatesUpdated, UpdateRatesDialogComponent } from './update-rates-dialog.component';

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

/** Stands in for `setting/change-rates`: the affected profiles, each rate moved by 5%. */
function answer(request: RateRequest, dryRun: boolean): RatePreview {
  const rows = PROFILES.filter((p) => !request.category || p.category === request.category);
  const up = (n: number) => +(n * 1.05).toFixed(2);
  return {
    dry_run: dryRun,
    saved: !dryRun,
    count: rows.length,
    factors: { before: FACTORS, after: request.category ? null : { ...FACTORS, per_kg: 199.5, color_per_kg: 430.5 } },
    profiles: rows.map((p) => ({
      id: p.id,
      before: { rate_meter: p.rate_meter, rate_bar: p.rate_bar, rate_meter_color: p.rate_meter_color, rate_bar_color: p.rate_bar_color },
      after: { rate_meter: up(p.rate_meter), rate_bar: up(p.rate_bar), rate_meter_color: up(p.rate_meter_color), rate_bar_color: up(p.rate_bar_color) },
    })),
  };
}

describe('UpdateRatesDialogComponent', () => {
  let fixture: ComponentFixture<UpdateRatesDialogComponent>;
  let component: UpdateRatesDialogComponent;
  let adapter: jasmine.SpyObj<CatalogueAdapter>;
  let updated: RatesUpdated[];

  function open(factors: PriceFactors | null = FACTORS): void {
    component.profiles = PROFILES;
    component.factors = factors;
    component.visible = true;
    component.ngOnChanges({ visible: new SimpleChange(false, true, false), profiles: new SimpleChange([], PROFILES, false) });
    fixture.detectChanges();
  }

  beforeEach(async () => {
    adapter = jasmine.createSpyObj<CatalogueAdapter>('CatalogueAdapter', ['changeRates', 'message']);
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

  it('asks the API for the preview and shows its figures for a sample window', fakeAsync(() => {
    adapter.changeRates.and.callFake((request, dryRun) => of(answer(request, dryRun)));
    open();
    expect(component.preview).toBeNull();
    component.form.patchValue({ percent: '5' });
    expect(component.previewing).toBeTrue();
    expect(adapter.changeRates).not.toHaveBeenCalled(); // waits for the typing to pause
    tick(PREVIEW_DELAY_MS);
    expect(adapter.changeRates).toHaveBeenCalledOnceWith({ mode: 'percent', category: null, percent: 5 }, true);
    // 5.4 m of frame and 5.0 m of sash, at the rates on the page and at the rates the API answered.
    expect(component.preview?.before).toBe(2261.76);
    expect(component.preview?.after).toBe(2374.9);
    expect(component.nextFactors).toEqual({ per_kg: 199.5, rate_bar: 5.8, color_per_kg: 430.5, color_rate_bar: 5.8 });
    expect(component.previewing).toBeFalse();
  }));

  it('saves with one call and reports the count the API answers', () => {
    adapter.changeRates.and.callFake((request, dryRun) => of(answer(request, dryRun)));
    open();
    component.form.patchValue({ percent: '5' });
    component.submit();
    expect(adapter.changeRates).toHaveBeenCalledOnceWith({ mode: 'percent', category: null, percent: 5 }, false);
    expect(updated).toEqual([{ count: 3 }]);
    expect(component.visible).toBeFalse();
  });

  it('changes one category with the same single call', fakeAsync(() => {
    adapter.changeRates.and.callFake((request, dryRun) => of(answer(request, dryRun)));
    open();
    component.form.patchValue({ category: 'Casement', percent: '-10' });
    tick(PREVIEW_DELAY_MS);
    expect(component.count).toBe(2);
    expect(component.nextFactors).toBeNull();
    component.submit();
    expect(adapter.changeRates.calls.mostRecent().args).toEqual([{ mode: 'percent', category: 'Casement', percent: -10 }, false]);
    expect(updated).toEqual([{ count: 2 }]);
  }));

  it('says at once why -150 gives no preview', fakeAsync(() => {
    open();
    component.form.patchValue({ percent: '-150' });
    tick(PREVIEW_DELAY_MS);
    fixture.detectChanges();
    expect(component.percentRefused).toBeTrue();
    expect(document.body.textContent).toContain('Enter a percentage from -90 to 500');
    expect(document.body.textContent).toContain('No preview: the percentage must be from -90 to 500.');
    component.form.patchValue({ percent: '' });
    expect(component.percentRefused).toBeFalse();
  }));

  it('sends nothing for a zero, an empty or an out-of-range entry', fakeAsync(() => {
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
    tick(PREVIEW_DELAY_MS);
    expect(adapter.changeRates).not.toHaveBeenCalled();
    expect(component.visible).toBeTrue();
  }));

  it('sets a new rate per kg for every profile', () => {
    adapter.changeRates.and.callFake((request, dryRun) => of(answer(request, dryRun)));
    open();
    component.setMode('rate');
    component.form.patchValue({ per_kg: '200' });
    component.submit();
    expect(adapter.changeRates).toHaveBeenCalledOnceWith(
      { mode: 'rate', category: null, factors: { per_kg: 200, rate_bar: 5.8, color_per_kg: 410, color_rate_bar: 5.8 } },
      false
    );
  });

  it('says so when the preview cannot be worked out, and still lets the change be saved', fakeAsync(() => {
    adapter.changeRates.and.returnValue(throwError(() => new Error('down')));
    open();
    component.form.patchValue({ percent: '5' });
    tick(PREVIEW_DELAY_MS);
    expect(component.preview).toBeNull();
    expect(component.previewError).toBe('The preview could not be worked out.');
    expect(component.count).toBe(3);
  }));

  it('names its close button for screen readers', () => {
    open();
    expect(document.querySelector('.p-dialog-header-close')?.getAttribute('aria-label')).toBe('Close');
  });

  it('starts on "New rate per kg" when no rate has been set yet', () => {
    open(null);
    expect(component.mode).toBe('rate');
    expect(component.canUsePercent).toBeFalse();
  });

  it('stays open and says what happened when the save fails', () => {
    adapter.changeRates.and.returnValue(throwError(() => new Error('down')));
    open();
    component.form.patchValue({ percent: '5' });
    component.submit();
    expect(component.visible).toBeTrue();
    expect(component.saving).toBeFalse();
    expect(component.error).toBe('The rates were not updated. Try again.');
    expect(updated).toEqual([]);
  });
});
