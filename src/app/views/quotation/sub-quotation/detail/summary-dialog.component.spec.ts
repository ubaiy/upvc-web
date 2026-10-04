import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { of, throwError } from 'rxjs';

import { SharedComponentsModule } from '../../../../shared/components/shared-components.module';
import { QuotationService } from '../../quotation.service';
import { DuplicateDialogComponent } from './duplicate-dialog.component';
import { toQuotationView } from './quotation-detail.model';
import { sampleQuotation } from './quotation-detail.testing';
import { SummaryDialogComponent } from './summary-dialog.component';

const ok = (data: any) => of({ success: true, data, message: '' } as any);
const opened = { visible: { currentValue: true, previousValue: false, firstChange: false, isFirstChange: () => false } };

describe('SummaryDialogComponent', () => {
  let fixture: ComponentFixture<SummaryDialogComponent>;
  let component: SummaryDialogComponent;
  let service: jasmine.SpyObj<QuotationService>;

  function open(overrides: any = {}): void {
    component.quotation = toQuotationView(sampleQuotation(overrides));
    component.visible = true;
    component.ngOnChanges(opened);
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = jasmine.createSpyObj('QuotationService', ['getMarginOptions', 'getPaymentTermOptions', 'saveQuotationSummary']);
    service.getMarginOptions.and.returnValue(
      ok([
        { id: 1, name: 'Retail', mark_up: '20' },
        { id: 2, name: 'Dealer', mark_up: '10' },
      ])
    );
    service.getPaymentTermOptions.and.returnValue(ok([{ id: 1, name: '50% Advance, 50% on Delivery' }]));
    TestBed.configureTestingModule({
      declarations: [SummaryDialogComponent],
      imports: [NoopAnimationsModule, FormsModule, SharedComponentsModule, DialogModule, ButtonModule],
      providers: [{ provide: QuotationService, useValue: service }],
    });
    fixture = TestBed.createComponent(SummaryDialogComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => fixture.destroy());

  it('starts from what the quotation has', () => {
    open({ discount_type: 'percent', discount_value: 5 });
    expect(component.marginId).toBe(1);
    expect(component.termId).toBe(1);
    expect(component.discountType).toBe('percent');
    expect(component.discountValue).toBe(5);
    expect(component.validUntil).toBe('2026-11-03');
    expect(component.margins.map((m) => m.label)).toEqual(['Retail (20%)', 'Dealer (10%)']);
  });

  it('labels every field', () => {
    open();
    for (const id of ['sum-margin', 'sum-terms', 'sum-valid']) {
      expect(document.body.querySelector(`label[for="${id}"]`)).withContext(id).not.toBeNull();
    }
  });

  it('saves margin, terms, discount, validity and the GST setting in one request', () => {
    open();
    component.marginId = 2;
    component.setDiscountType('amount');
    component.discountValue = 500;
    component.validUntil = '2026-12-01';
    service.saveQuotationSummary.and.returnValue(ok({ id: 14, totals: {} }));
    const saved = jasmine.createSpy('saved');
    component.saved.subscribe(saved);
    component.submit();
    expect(service.saveQuotationSummary).toHaveBeenCalledWith(14, {
      discount_type: 'amount',
      discount_value: 500,
      prices_include_gst: false,
      order_type_margin_id: 2,
      payment_term_id: 1,
      valid_until: '2026-12-01',
    });
    expect(saved).toHaveBeenCalled();
  });

  it('removes a discount by sending zero', () => {
    open({ discount_type: 'percent', discount_value: 5 });
    component.setDiscountType('none');
    service.saveQuotationSummary.and.returnValue(ok({}));
    component.submit();
    expect(service.saveQuotationSummary.calls.mostRecent().args[1].discount_value).toBe(0);
  });

  it('refuses a discount above 100% before anything is sent', () => {
    open();
    component.setDiscountType('percent');
    component.discountValue = 120;
    component.submit();
    expect(component.discountError).toContain('100%');
    expect(service.saveQuotationSummary).not.toHaveBeenCalled();
  });

  it('shows what the API refused', () => {
    open();
    service.saveQuotationSummary.and.returnValue(of({ status: 0, message: 'Quatation is already converted to a bill' } as any));
    component.submit();
    expect(component.saveError).toBe('Quatation is already converted to a bill');
  });

  it('offers "Try again" when the lists do not load', () => {
    service.getMarginOptions.and.returnValue(throwError(() => ({ status: 0 })));
    open();
    expect(component.loadError).toContain('could not load');
    service.getMarginOptions.and.returnValue(ok([{ id: 1, name: 'Retail', mark_up: '20' }]));
    component.load();
    expect(component.loadError).toBe('');
    expect(component.margins.length).toBe(1);
  });
});

describe('DuplicateDialogComponent', () => {
  let fixture: ComponentFixture<DuplicateDialogComponent>;
  let component: DuplicateDialogComponent;
  let service: jasmine.SpyObj<QuotationService>;

  beforeEach(() => {
    service = jasmine.createSpyObj('QuotationService', ['getCustomerChoices', 'copyQuotation']);
    service.getCustomerChoices.and.returnValue(
      ok([
        { id: 2, name: 'Ahmed Al-Rashid', phone: '9812345670' },
        { id: 3, name: 'Sharma Residency', phone: '9823456781' },
      ])
    );
    TestBed.configureTestingModule({
      declarations: [DuplicateDialogComponent],
      imports: [NoopAnimationsModule, FormsModule, SharedComponentsModule, DialogModule, ButtonModule, DropdownModule],
      providers: [{ provide: QuotationService, useValue: service }],
    });
    fixture = TestBed.createComponent(DuplicateDialogComponent);
    component = fixture.componentInstance;
    component.quotation = toQuotationView(sampleQuotation());
    component.visible = true;
    component.ngOnChanges(opened);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('offers the same customer and a name for the copy', () => {
    expect(component.customerId).toBe(2);
    expect(component.name).toBe('Al-Rashid Villa Windows (Copy)');
    expect(component.customers.length).toBe(2);
  });

  it('copies through the API for the chosen customer and reports changed prices', () => {
    component.customerId = 3;
    service.copyQuotation.and.returnValue(ok({ id: 40, number: 'Q-0010', copy: { prices_changed: true } }));
    const saved = jasmine.createSpy('saved');
    component.saved.subscribe(saved);
    component.submit();
    expect(service.copyQuotation).toHaveBeenCalledWith(14, { customer_id: 3, quatation_name: 'Al-Rashid Villa Windows (Copy)' });
    expect(saved).toHaveBeenCalledWith({ id: 40, number: 'Q-0010', pricesChanged: true });
  });

  it('shows a refusal in the dialog', () => {
    service.copyQuotation.and.returnValue(of({ status: 0, message: 'Invalid customer id' } as any));
    component.submit();
    expect(component.saveError).toBe('Invalid customer id');
  });
});
