import { SimpleChange } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { of, throwError } from 'rxjs';

import { SharedComponentsModule } from '../../../shared/components/shared-components.module';
import { LocationService } from '../../../shared/services/location.service';
import { SiteAddressComponent } from '../site-address/site-address.component';
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
      'getMarginOptions',
      'addCustomerInline',
      'addQuotationDetail',
      'editQuotationDetail',
      'getCustomerAddresses',
      'addCustomerAddress',
      'getGstStates',
      'getCompanyState',
    ]);
    // The site address of a new quotation: no saved address unless a test gives one.
    service.getCustomerAddresses.and.returnValue(of({ success: true, message: '', data: [] }));
    service.getGstStates.and.returnValue(
      of({ success: true, message: '', data: [{ code: '24', name: 'Gujarat', abbreviation: 'GJ' }, { code: '27', name: 'Maharashtra', abbreviation: 'MH' }] } as any)
    );
    service.getCompanyState.and.returnValue(of('24'));
    const location = jasmine.createSpyObj<LocationService>('LocationService', ['lookupPin', 'cities']);
    location.cities.and.returnValue(of([]));
    location.lookupPin.and.callFake((pin: string) =>
      of(
        pin === '395007'
          ? { pincode: pin, city: 'Surat', district: 'Surat', stateCode: '24', stateName: 'Gujarat', localities: [] }
          : pin === '400050'
          ? { pincode: pin, city: 'Mumbai', district: 'Mumbai', stateCode: '27', stateName: 'Maharashtra', localities: ['Bandra West'] }
          : null
      )
    );
    service.getCustomerOptions.and.returnValue(of({ success: true, message: '', data: CUSTOMERS }));
    // No price lists by default: the field stays hidden and the API applies the customer's own.
    service.getMarginOptions.and.returnValue(of({ success: true, message: '', data: [] }));
    TestBed.configureTestingModule({
      declarations: [QuotationDialogComponent],
      imports: [
        NoopAnimationsModule,
        RouterTestingModule,
        ReactiveFormsModule,
        SharedComponentsModule,
        DialogModule,
        DropdownModule,
        ButtonModule,
        SiteAddressComponent,
      ],
      providers: [
        { provide: QuotationService, useValue: service },
        { provide: LocationService, useValue: location },
      ],
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

  it('pre-selects the price list of the customer, until the user picks another', () => {
    service.getCustomerOptions.and.returnValue(
      of({
        success: true,
        message: '',
        data: [
          { ...CUSTOMERS[0], default_order_type_margin_id: 1 },
          { ...CUSTOMERS[1], default_order_type_margin_id: 2 },
        ],
      })
    );
    service.getMarginOptions.and.returnValue(
      of({ success: true, message: '', data: [{ id: 1, name: 'Retail', mark_up: '20' }, { id: 2, name: 'Dealer', mark_up: '10' }] })
    );
    service.addQuotationDetail.and.returnValue(of({ success: true, message: '', data: { id: 31 } }));
    open();
    const labels = Array.from(body().querySelectorAll('label.label')).map((l) => (l.textContent || '').trim());
    expect(labels).toEqual(['Customer', 'Quotation name', 'Price list']);
    expect(component.margins.map((m) => m.label)).toEqual(['Retail (20%)', 'Dealer (10%)']);
    const margin = component.form.controls['order_type_margin_id'];
    const [first, second] = component.customers;

    component.form.controls['customer_id'].setValue(first.id);
    expect(margin.value).toBe(first.marginId);
    component.form.controls['customer_id'].setValue(second.id);
    expect(margin.value).toBe(second.marginId);

    margin.setValue(first.marginId);
    component.onMarginChange();
    component.form.controls['customer_id'].setValue(first.id);
    component.form.controls['customer_id'].setValue(second.id);
    expect(margin.value).toBe(first.marginId);

    component.submit();
    expect(service.addQuotationDetail.calls.mostRecent().args[0].order_type_margin_id).toBe(first.marginId);
  });

  it('starts with the customer named by the page that opened it', () => {
    component.customerId = 3;
    open();
    expect(component.form.controls['customer_id'].value).toBe(3);
    expect(component.form.controls['quatation_name'].value).toBe('Sharma Residency – windows');
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

  describe('site address (T90)', () => {
    const ADDRESSES = [
      { id: 8, customer_id: 3, is_default: 0, address: 'Site office', address_line2: null, city: 'Pune', state: 'MH', zip_code: '411001', pincode: '411001' },
      { id: 7, customer_id: 3, is_default: 1, address: 'B-203 Sunrise Towers', address_line2: 'Linking Road', city: 'Mumbai', state: 'MH', zip_code: '400050', pincode: '400050' },
    ];

    /** Types into a field of the dialog the way a keyboard does. */
    function type(selector: string, value: string): void {
      const input = body().querySelector(selector) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      tick(400);
      fixture.detectChanges();
    }

    function chooseCustomer(id: number): void {
      component.form.controls['customer_id'].setValue(id);
      fixture.detectChanges();
    }

    beforeEach(() => {
      service.addQuotationDetail.and.returnValue(of({ success: true, message: '', data: { id: 31 } }));
    });

    it('shows nothing about an address until a customer is chosen, then the default address on one line', () => {
      service.getCustomerAddresses.and.returnValue(of({ success: true, message: '', data: ADDRESSES }));
      open();
      expect(body().querySelector('app-site-address')).toBeNull();

      chooseCustomer(3);
      expect(service.getCustomerAddresses).toHaveBeenCalledOnceWith(3);
      expect(body().querySelector('[data-site="now"]')?.textContent?.replace(/\s+/g, ' ')).toContain(
        'B-203 Sunrise Towers, Linking Road, Mumbai - 400050, Maharashtra'
      );
      expect(body().querySelector('[data-site="toggle"]')?.textContent).toContain('Change');
      expect(body().querySelector('#' + component.site!.uid + '-pin')).withContext('closed until asked for').toBeNull();

      component.submit();
      expect(service.addQuotationDetail).toHaveBeenCalledWith({
        customer_id: 3,
        quatation_name: 'Sharma Residency – windows',
        customer_address_id: 7,
      });
    });

    it('writes the quotation to another saved address when it is chosen', () => {
      service.getCustomerAddresses.and.returnValue(of({ success: true, message: '', data: ADDRESSES }));
      open();
      chooseCustomer(3);
      (body().querySelector('[data-site="toggle"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const radios = Array.from(body().querySelectorAll('.site-option input')) as HTMLInputElement[];
      expect(radios.length).withContext('two saved addresses and "Another address"').toBe(3);
      expect(radios[0].checked).withContext('the default address first, chosen').toBeTrue();
      radios[1].dispatchEvent(new Event('change'));
      fixture.detectChanges();
      component.submit();
      expect(service.addQuotationDetail.calls.mostRecent().args[0].customer_address_id).toBe(8);
      expect(service.addCustomerAddress).not.toHaveBeenCalled();
    });

    it('a Mumbai PIN on a new site address of a Gujarat customer moves it to Maharashtra, saves it to the customer and sends its id', fakeAsync(() => {
      service.getCustomerAddresses.and.returnValue(
        of({ success: true, message: '', data: [{ ...ADDRESSES[1], city: 'Surat', state: 'Gujarat', zip_code: '395007', pincode: '395007' }] })
      );
      service.addCustomerAddress.and.returnValue(of({ success: true, message: '', data: { id: 21, customer_id: 3, is_default: 0, address: 'T90 Shop 4', city: 'Mumbai', state: 'Maharashtra', pincode: '400050' } }));
      open();
      chooseCustomer(3);
      (body().querySelector('[data-site="toggle"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      (body().querySelector('[data-site="new"]') as HTMLInputElement).dispatchEvent(new Event('change'));
      fixture.detectChanges();
      const uid = component.site!.uid;
      expect((body().querySelector('#' + uid + '-state') as HTMLSelectElement).value).withContext('starts in the company state').toBe('24');

      type('#' + uid + '-line', 'T90 Shop 4');
      type('#' + uid + '-pin', '400050');
      expect((body().querySelector('#' + uid + '-city') as HTMLInputElement).value).toBe('Mumbai');
      expect((body().querySelector('#' + uid + '-state') as HTMLSelectElement).value).toBe('27');

      component.submit();
      tick();
      expect(service.addCustomerAddress).toHaveBeenCalledOnceWith(
        jasmine.objectContaining({
          customer_id: 3,
          is_default: 0,
          address: 'T90 Shop 4',
          city: 'Mumbai',
          district: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400050',
          zip_code: '400050',
        })
      );
      // The state of this address is what the api takes the place of supply from: IGST, as a change of state gives.
      expect(service.addQuotationDetail.calls.mostRecent().args[0]).toEqual({
        customer_id: 3,
        quatation_name: 'Sharma Residency – windows',
        customer_address_id: 21,
      });
    }));

    it('does not save the new address twice when the quotation fails and the user tries again', fakeAsync(() => {
      service.addCustomerAddress.and.returnValue(of({ success: true, message: '', data: { id: 21, customer_id: 3, is_default: 1, address: 'T90 Shop 4', city: 'Surat', state: 'Gujarat', pincode: '395007' } }));
      service.addQuotationDetail.and.returnValue(throwError(() => ({ error: { message: 'Server is busy' } })));
      open();
      chooseCustomer(3);
      (body().querySelector('[data-site="toggle"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const uid = component.site!.uid;
      type('#' + uid + '-line', 'T90 Shop 4');
      type('#' + uid + '-pin', '395007');
      component.submit();
      tick();
      fixture.detectChanges();
      expect(text()).toContain('Server is busy');
      expect(service.addCustomerAddress.calls.mostRecent().args[0].is_default).withContext('the first address of the customer').toBe(1);

      service.addQuotationDetail.and.returnValue(of({ success: true, message: '', data: { id: 31 } }));
      component.submit();
      tick();
      expect(service.addCustomerAddress).toHaveBeenCalledTimes(1);
      expect(service.addQuotationDetail.calls.mostRecent().args[0].customer_address_id).toBe(21);
    }));

    it('says what a half-typed site address still needs, and sends nothing', fakeAsync(() => {
      open();
      chooseCustomer(3);
      (body().querySelector('[data-site="toggle"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      type('#' + component.site!.uid + '-line', 'T90 Shop 4');
      component.submit();
      fixture.detectChanges();
      expect(text()).toContain('Enter a 6-digit PIN code.');
      expect(text()).toContain('Enter the city.');
      expect(service.addCustomerAddress).not.toHaveBeenCalled();
      expect(service.addQuotationDetail).not.toHaveBeenCalled();
    }));

    it('a new customer takes the site address typed with it; an unknown PIN is sent as typed', fakeAsync(() => {
      service.addCustomerInline.and.returnValue(of({ success: true, message: '', data: { id: 9, name: 'T90 Anil Kulkarni', phone: '9890011223' } }));
      open();
      component.filterText = 'T90 Anil Kulkarni';
      component.startNewCustomer();
      tick();
      fixture.detectChanges();
      component.form.controls['customer_phone'].setValue('9890011223');
      expect(body().querySelector('[data-site="now"]')?.textContent).toContain('Optional. It can be added later.');
      (body().querySelector('[data-site="toggle"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const uid = component.site!.uid;
      type('#' + uid + '-line', 'Plot 9');
      type('#' + uid + '-pin', '999999');
      expect(text()).toContain('This PIN is not in our list.');
      type('#' + uid + '-city', 'Navagam');

      component.submit();
      tick();
      expect(service.addCustomerInline).toHaveBeenCalledOnceWith({
        name: 'T90 Anil Kulkarni',
        phone: '9890011223',
        state_code: '24',
        address: { address: 'Plot 9', address_line2: null, city: 'Navagam', district: null, state: 'Gujarat', zip_code: '999999', pincode: '999999' },
      });
      expect(service.addCustomerAddress).not.toHaveBeenCalled();
      expect(service.addQuotationDetail).toHaveBeenCalledWith({ customer_id: 9, quatation_name: 'T90 Anil Kulkarni – windows' });
    }));

    it('is not offered while a quotation is renamed or moved', () => {
      open(ROW);
      expect(body().querySelector('app-site-address')).toBeNull();
    });
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

  beforeEach(() => {
    service = jasmine.createSpyObj('QuotationService', ['getCustomerOptions', 'copyQuotation']);
    service.getCustomerOptions.and.returnValue(of({ success: true, message: '', data: CUSTOMERS }));
    TestBed.configureTestingModule({
      declarations: [DuplicateQuotationDialogComponent],
      imports: [NoopAnimationsModule, RouterTestingModule, ReactiveFormsModule, SharedComponentsModule, DialogModule, DropdownModule, ButtonModule],
      providers: [{ provide: QuotationService, useValue: service }],
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
    const dialogText = (document.querySelector('.p-dialog')?.textContent || '').replace(/\s+/g, ' ');
    expect(dialogText).toContain('Duplicate this quotation?');
    expect(dialogText).toContain('with 1 window, at today’s prices');
    expect(dialogText).not.toContain('Area');
  });

  it('asks the API for the copy with one request and reports a change of prices', () => {
    service.copyQuotation.and.returnValue(
      of({ success: true, message: '', data: { id: 40, copy: { prices_changed: true, not_repriced: [] } } })
    );
    const saved = jasmine.createSpy('saved');
    component.saved.subscribe(saved);
    component.form.patchValue({ customer_id: 2 });
    component.submit();

    expect(service.copyQuotation).toHaveBeenCalledOnceWith(15, { customer_id: 2, quatation_name: 'Sharma Flat Renovation (Copy)' });
    expect(saved).toHaveBeenCalledOnceWith({ id: 40, pricesChanged: true });
  });

  it('stays open and shows the refusal when the copy is not made', () => {
    service.copyQuotation.and.returnValue(of({ status: 0, message: 'Invalid customer id' } as any));
    const saved = jasmine.createSpy('saved');
    component.saved.subscribe(saved);
    component.submit();
    expect(component.saveError).toBe('Invalid customer id');
    expect(saved).not.toHaveBeenCalled();
  });

  it('asks for a customer before copying', () => {
    component.form.patchValue({ customer_id: null });
    component.submit();
    expect(component.customerError).toBe('Choose a customer.');
    expect(service.copyQuotation).not.toHaveBeenCalled();
  });
});
