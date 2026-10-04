import { SimpleChange } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { of, throwError } from 'rxjs';

import { SharedComponentsModule } from '../../../shared/components/shared-components.module';
import { DropdownService } from '../../../shared/services/dropdown.service';
import { QuotationRow } from '../quotation-list.model';
import { QuotationService } from '../quotation.service';
import { DuplicateQuotationDialogComponent } from './duplicate-quotation-dialog.component';
import { normalisePhone, QuotationDialogComponent } from './quotation-dialog.component';

const CUSTOMERS = [
  { id: 3, name: 'Sharma Residency', phone: '9823456781' },
  { id: 2, name: 'Ahmed Al-Rashid', phone: '9812345670' },
];

const ROW: QuotationRow = {
  id: 15,
  name: 'Sharma Flat Renovation',
  number: 'No. 15',
  customerId: 3,
  customerName: 'Sharma Residency',
  phone: '9823456781',
  windows: 1,
  status: 'draft',
  total: 16708,
  updatedAt: null,
};

describe('normalisePhone', () => {
  it('keeps ten digits and drops +91, a leading 0, spaces and dashes', () => {
    expect(normalisePhone('98123 45670')).toBe('9812345670');
    expect(normalisePhone('+91 98123-45670')).toBe('9812345670');
    expect(normalisePhone('09812345670')).toBe('9812345670');
    expect(normalisePhone('12345')).toBe('12345');
  });
});

describe('QuotationDialogComponent', () => {
  let fixture: ComponentFixture<QuotationDialogComponent>;
  let component: QuotationDialogComponent;
  let service: jasmine.SpyObj<QuotationService>;

  const body = (): HTMLElement => document.querySelector('.p-dialog') as HTMLElement;
  const text = (): string => (body()?.textContent || '').replace(/\s+/g, ' ');

  function open(quotation: QuotationRow | null = null): void {
    component.quotation = quotation;
    component.visible = true;
    component.ngOnChanges({ visible: new SimpleChange(false, true, false) });
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = jasmine.createSpyObj('QuotationService', [
      'getCustomerOptions',
      'addCustomerInline',
      'addQuotationDetail',
      'editQuotationDetail',
    ]);
    service.getCustomerOptions.and.returnValue(of({ success: true, message: '', data: CUSTOMERS }));
    TestBed.configureTestingModule({
      declarations: [QuotationDialogComponent],
      imports: [NoopAnimationsModule, RouterTestingModule, ReactiveFormsModule, SharedComponentsModule, DialogModule, DropdownModule, ButtonModule],
      providers: [{ provide: QuotationService, useValue: service }],
    });
    fixture = TestBed.createComponent(QuotationDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('asks two things: the customer and a quotation name', () => {
    open();
    expect(text()).toContain('New quotation');
    const labels = Array.from(body().querySelectorAll('label.label')).map((l) => (l.textContent || '').trim());
    expect(labels).toEqual(['Customer', 'Quotation name']);
    expect(component.customers.map((c) => c.name)).toEqual(['Ahmed Al-Rashid', 'Sharma Residency']);
    expect(text()).toContain('Create quotation');
    expect(text()).not.toContain('Address');
    expect(text()).not.toContain('Area');
  });

  it('fills the quotation name from the customer until the user types one', () => {
    open();
    component.form.controls['customer_id'].setValue(3);
    expect(component.form.controls['quatation_name'].value).toBe('Sharma Residency – windows');

    component.form.controls['quatation_name'].setValue('Flat 4B balcony');
    component.onNameInput();
    component.form.controls['customer_id'].setValue(2);
    expect(component.form.controls['quatation_name'].value).toBe('Flat 4B balcony');
  });

  it('creates a quotation for an existing customer with one request', () => {
    service.addQuotationDetail.and.returnValue(of({ success: true, message: '', data: { id: 31 } }));
    const saved = jasmine.createSpy('saved');
    component.saved.subscribe(saved);
    open();
    component.form.controls['customer_id'].setValue(3);
    component.submit();

    expect(service.addCustomerInline).not.toHaveBeenCalled();
    expect(service.addQuotationDetail).toHaveBeenCalledWith({ customer_id: 3, quatation_name: 'Sharma Residency – windows' });
    expect(saved).toHaveBeenCalledWith(31);
  });

  it('says what is missing instead of sending the form', () => {
    open();
    component.submit();
    fixture.detectChanges();
    expect(text()).toContain('Choose a customer, or add a new one.');
    expect(service.addQuotationDetail).not.toHaveBeenCalled();

    component.startNewCustomer();
    component.form.patchValue({ customer_name: '  ', customer_phone: '12345' });
    component.submit();
    fixture.detectChanges();
    expect(text()).toContain('Enter the customer’s name.');
    expect(text()).toContain('Enter a 10-digit phone number.');
    expect(body().querySelector('#nq-new-phone')?.getAttribute('aria-invalid')).toBe('true');
    expect(service.addCustomerInline).not.toHaveBeenCalled();
  });

  it('adds a new customer with a name and a phone only, then the quotation', () => {
    service.addCustomerInline.and.returnValue(of({ success: true, message: '', data: { id: 9, name: 'Anil Kulkarni', phone: '9890011223' } }));
    service.addQuotationDetail.and.returnValue(of({ success: true, message: '', data: { id: 32 } }));
    const saved = jasmine.createSpy('saved');
    component.saved.subscribe(saved);
    open();
    component.filterText = 'Anil Kulkarni';
    component.startNewCustomer();
    fixture.detectChanges();

    const labels = Array.from(body().querySelectorAll('label.label')).map((l) => (l.textContent || '').trim());
    expect(labels).toEqual(['Customer name', 'Phone', 'Quotation name']);
    expect(component.form.controls['customer_name'].value).toBe('Anil Kulkarni');
    expect(component.form.controls['quatation_name'].value).toBe('Anil Kulkarni – windows');

    component.form.controls['customer_phone'].setValue('+91 98900 11223');
    component.submit();
    expect(service.addCustomerInline).toHaveBeenCalledWith({ name: 'Anil Kulkarni', phone: '9890011223' });
    expect(service.addQuotationDetail).toHaveBeenCalledWith({ customer_id: 9, quatation_name: 'Anil Kulkarni – windows' });
    expect(saved).toHaveBeenCalledWith(32);
  });

  it('does not add the customer twice when the quotation fails and the user tries again', () => {
    service.addCustomerInline.and.returnValue(of({ success: true, message: '', data: { id: 9, name: 'Anil Kulkarni', phone: '9890011223' } }));
    service.addQuotationDetail.and.returnValue(throwError(() => ({ error: { message: 'Server is busy' } })));
    open();
    component.startNewCustomer();
    component.form.patchValue({ customer_name: 'Anil Kulkarni', customer_phone: '9890011223' });
    component.submit();
    fixture.detectChanges();
    expect(text()).toContain('Server is busy');
    expect(component.mode).toBe('existing');
    expect(component.form.controls['customer_id'].value).toBe(9);

    service.addQuotationDetail.and.returnValue(of({ success: true, message: '', data: { id: 33 } }));
    component.submit();
    expect(service.addCustomerInline).toHaveBeenCalledTimes(1);
    expect(service.addQuotationDetail).toHaveBeenCalledTimes(2);
  });

  it('points out a customer that already exists, by name or phone', () => {
    open();
    component.startNewCustomer();
    component.form.patchValue({ customer_name: 'someone new', customer_phone: '98234 56781' });
    fixture.detectChanges();
    expect(component.duplicate?.id).toBe(3);
    expect(text()).toContain('Sharma Residency is already a customer.');

    component.chooseExisting(component.duplicate);
    expect(component.mode).toBe('existing');
    expect(component.form.controls['customer_id'].value).toBe(3);
  });

  it('starts on a new customer when the company has none', () => {
    service.getCustomerOptions.and.returnValue(of({ success: true, message: '', data: [] }));
    open();
    expect(component.mode).toBe('new');
  });

  it('still lets a customer be typed when the customer list fails to load', () => {
    service.getCustomerOptions.and.returnValue(throwError(() => ({ status: 0 })));
    open();
    expect(text()).toContain('We could not load your customers.');
    service.getCustomerOptions.and.returnValue(of({ success: true, message: '', data: CUSTOMERS }));
    (body().querySelector('app-callout button') as HTMLElement).click();
    fixture.detectChanges();
    expect(text()).not.toContain('We could not load your customers.');
    expect(component.customers.length).toBe(2);
  });

  it('renames a quotation or moves it to another customer', () => {
    service.editQuotationDetail.and.returnValue(of({ success: true, message: '', data: { id: 15 } }));
    const saved = jasmine.createSpy('saved');
    component.saved.subscribe(saved);
    open(ROW);
    expect(text()).toContain('Edit quotation');
    expect(text()).toContain('Save changes');
    expect(component.form.controls['quatation_name'].value).toBe('Sharma Flat Renovation');

    component.form.controls['customer_id'].setValue(2);
    expect(component.form.controls['quatation_name'].value).toBe('Sharma Flat Renovation');
    component.submit();
    expect(service.editQuotationDetail).toHaveBeenCalledWith({ id: 15, customer_id: 2, quatation_name: 'Sharma Flat Renovation' });
    expect(saved).toHaveBeenCalledWith(15);
  });

  it('shows the API message when a request is refused', () => {
    service.addQuotationDetail.and.returnValue(of({ success: false, message: 'Invalid customer id', data: null }));
    open();
    component.form.controls['customer_id'].setValue(3);
    component.submit();
    fixture.detectChanges();
    expect(text()).toContain('Invalid customer id');
    expect(component.saving).toBeFalse();
  });
});

describe('DuplicateQuotationDialogComponent', () => {
  let fixture: ComponentFixture<DuplicateQuotationDialogComponent>;
  let component: DuplicateQuotationDialogComponent;
  let service: jasmine.SpyObj<QuotationService>;

  const spec = { category_type: 'Slidding', width: 1800, height: 1200, color_id: 1, glazz_id: 4, is_track: '2 Track', mullion: [] };
  const DETAIL = {
    id: 15,
    quatation_name: 'Sharma Flat Renovation',
    customer_id: 3,
    quatation_product: [
      { id: 70, quantity: 2, image: 'img.png', costhead_information: JSON.stringify({ old_post_data: spec }) },
      { id: 71, quantity: 1, image: null, costhead_information: '{}' },
    ],
  };

  beforeEach(() => {
    service = jasmine.createSpyObj('QuotationService', [
      'getCustomerOptions',
      'getQuotationDetail',
      'addQuotationDetail',
      'quotationManageProduct',
    ]);
    service.getCustomerOptions.and.returnValue(of({ success: true, message: '', data: CUSTOMERS }));
    service.getQuotationDetail.and.returnValue(of({ success: true, message: '', data: DETAIL as any }));
    const dropdowns = {
      allDropDowns: () =>
        of({
          success: true,
          data: {
            profile_color: [{ id: 1, color_name: 'White', color_code: '#fff' }, { id: 2, color_name: 'Walnut', color_code: '#5a3' }],
            costhead: [{ id: 4, name: '5 mm plain' }],
            slidding_type: ['2 Track', '3 Track'],
          },
        }),
    };
    TestBed.configureTestingModule({
      declarations: [DuplicateQuotationDialogComponent],
      imports: [NoopAnimationsModule, RouterTestingModule, ReactiveFormsModule, SharedComponentsModule, DialogModule, DropdownModule, ButtonModule],
      providers: [
        { provide: QuotationService, useValue: service },
        { provide: DropdownService, useValue: dropdowns },
      ],
    });
    fixture = TestBed.createComponent(DuplicateQuotationDialogComponent);
    component = fixture.componentInstance;
    component.quotation = ROW;
    component.visible = true;
    component.ngOnChanges({ visible: new SimpleChange(false, true, false) });
    fixture.detectChanges();
  });

  it('defaults to the same customer and "<name> (Copy)", with no address or area', () => {
    expect(component.form.controls['customer_id'].value).toBe(3);
    expect(component.form.controls['quatation_name'].value).toBe('Sharma Flat Renovation (Copy)');
    expect(component.windowCount).toBe(2);
    expect(component.hasSliding).toBeTrue();
    const dialogText = (document.querySelector('.p-dialog')?.textContent || '').replace(/\s+/g, ' ');
    expect(dialogText).toContain('Duplicate this quotation?');
    expect(dialogText).not.toContain('Address');
    expect(dialogText).not.toContain('Area');
  });

  it('makes the new quotation, then re-posts each window that has a saved specification', () => {
    service.addQuotationDetail.and.returnValue(of({ success: true, message: '', data: { id: 40 } }));
    service.quotationManageProduct.and.returnValue(of({ success: true, message: '', data: {} as any }));
    const saved = jasmine.createSpy('saved');
    component.saved.subscribe(saved);
    component.form.patchValue({ customer_id: 2, color_id: 2, is_track: '3 Track' });
    component.submit();

    expect(service.addQuotationDetail).toHaveBeenCalledWith({ customer_id: 2, quatation_name: 'Sharma Flat Renovation (Copy)' });
    expect(service.quotationManageProduct).toHaveBeenCalledTimes(1);
    const payload = service.quotationManageProduct.calls.mostRecent().args[0];
    expect(payload).toEqual(
      jasmine.objectContaining({ quatation_id: 40, quantity: 2, width: 1800, height: 1200, profile_color: '#5a3', image: 'img.png' })
    );
    expect(payload.parts[0]).toEqual(jasmine.objectContaining({ color_id: 2, glazz_id: 4, is_track: '3 Track' }));
    expect(saved).toHaveBeenCalledWith(40);
  });

  it('offers to open the copy when a window could not be copied', () => {
    service.addQuotationDetail.and.returnValue(of({ success: true, message: '', data: { id: 41 } }));
    service.quotationManageProduct.and.returnValue(throwError(() => ({ status: 500 })));
    const saved = jasmine.createSpy('saved');
    component.saved.subscribe(saved);
    component.submit();
    expect(component.partialId).toBe(41);
    expect(component.saveError).toContain('Some windows could not be copied');
    expect(saved).not.toHaveBeenCalled();
    component.openPartial();
    expect(saved).toHaveBeenCalledWith(41);
  });
});
