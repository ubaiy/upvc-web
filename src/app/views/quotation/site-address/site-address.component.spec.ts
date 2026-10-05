import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { LocationService } from 'src/app/shared/services/location.service';
import { QuotationService } from '../quotation.service';
import { SiteAddressDialogComponent } from './site-address-dialog.component';
import { SiteAddressComponent } from './site-address.component';

const STATES = [
  { code: '24', name: 'Gujarat', abbreviation: 'GJ' },
  { code: '27', name: 'Maharashtra', abbreviation: 'MH' },
];
const ADDRESSES = [
  { id: 8, customer_id: 3, is_default: 0, address: 'Site office', address_line2: null, city: null, state: 'MH', zip_code: null, pincode: null },
  { id: 7, customer_id: 3, is_default: 1, address: '14 Lake View', address_line2: 'Adajan', city: 'Surat', district: 'Surat', state: 'Gujarat', zip_code: '395007', pincode: '395007' },
];
const ok = (data: any) => of({ success: true, message: '', data } as any);

@Component({
  template: `<app-site-address [customerId]="customerId" [selectedId]="selectedId" [collapsed]="collapsed"></app-site-address>`,
})
class HostComponent {
  customerId: number | null = 3;
  selectedId: number | null = null;
  collapsed = true;
  @ViewChild(SiteAddressComponent) site!: SiteAddressComponent;
}

function mocks() {
  const service = jasmine.createSpyObj<QuotationService>('QuotationService', [
    'getCustomerAddresses',
    'addCustomerAddress',
    'getGstStates',
    'getCompanyState',
    'setSiteAddress',
  ]);
  service.getCustomerAddresses.and.returnValue(ok(ADDRESSES));
  service.getGstStates.and.returnValue(ok(STATES));
  service.getCompanyState.and.returnValue(of('24'));
  service.setSiteAddress.and.returnValue(ok({ id: 14 }));
  const location = jasmine.createSpyObj<LocationService>('LocationService', ['lookupPin', 'cities']);
  location.cities.and.returnValue(of([]));
  location.lookupPin.and.callFake((pin: string) =>
    of(pin === '400050' ? { pincode: pin, city: 'Mumbai', district: 'Mumbai', stateCode: '27', stateName: 'Maharashtra', localities: [] } : null)
  );
  return { service, location };
}

describe('SiteAddressComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let service: jasmine.SpyObj<QuotationService>;

  const el = (): HTMLElement => fixture.nativeElement;
  const text = (): string => (el().textContent || '').replace(/\s+/g, ' ');

  function type(selector: string, value: string): void {
    const input = el().querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    tick(400);
    fixture.detectChanges();
  }

  beforeEach(() => {
    const made = mocks();
    service = made.service;
    TestBed.configureTestingModule({
      declarations: [HostComponent],
      imports: [SiteAddressComponent],
      providers: [
        { provide: QuotationService, useValue: service },
        { provide: LocationService, useValue: made.location },
      ],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  it('closed, it says where the quotation goes: the default address, "City - PIN"', () => {
    fixture.detectChanges();
    expect(el().querySelector('[data-site="now"]')?.textContent?.replace(/\s+/g, ' ')).toContain('14 Lake View, Adajan, Surat - 395007, Gujarat');
    expect(el().querySelector('[data-site="toggle"]')?.textContent).toContain('Change');
    expect(el().querySelectorAll('input').length).toBe(0);
    let id: number | null | undefined;
    host.site.resolve(3).subscribe((value) => (id = value));
    expect(id).toBe(7);
    expect(host.site.hasProblem()).toBeFalse();
  });

  it('open, it lists the saved addresses, the default first, and an address from before city and PIN reads without them', () => {
    host.collapsed = false;
    host.selectedId = 8;
    fixture.detectChanges();
    const options = Array.from(el().querySelectorAll('.site-option')).map((option) => (option.textContent || '').replace(/\s+/g, ' ').trim());
    expect(options).toEqual(['14 Lake View, AdajanSurat - 395007, GujaratDefault', 'Site officeMaharashtra', 'Another address']);
    const radios = Array.from(el().querySelectorAll('.site-option input')) as HTMLInputElement[];
    expect(radios.map((radio) => radio.checked)).withContext('the address the quotation has now').toEqual([false, true, false]);
    expect(el().querySelector('[role="radiogroup"]')?.getAttribute('aria-labelledby')).toBe(host.site.uid + '-label');
  });

  it('takes a new address PIN first, saves it to the customer and gives its id; a second call reuses it', fakeAsync(() => {
    service.addCustomerAddress.and.returnValue(ok({ id: 21, customer_id: 3, is_default: 0, address: 'T90 Shop 4', city: 'Mumbai', state: 'Maharashtra', pincode: '400050' }));
    host.collapsed = false;
    fixture.detectChanges();
    (el().querySelector('[data-site="new"]') as HTMLInputElement).dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const uid = host.site.uid;
    const fields = Array.from(el().querySelectorAll('.site-new input, .site-new select')).map((field) => field.id.replace(uid + '-', ''));
    expect(fields).toEqual(['pin', 'line', 'line2', 'city', 'state']);

    type('#' + uid + '-line', 'T90 Shop 4');
    type('#' + uid + '-pin', '400050');
    expect(host.site.newAddress()).toEqual(jasmine.objectContaining({ city: 'Mumbai', district: 'Mumbai', state_code: '27', zip_code: '400050' }));
    expect(host.site.hasProblem()).toBeFalse();

    let id: number | null | undefined;
    host.site.resolve(3).subscribe((value) => (id = value));
    expect(id).toBe(21);
    expect(service.addCustomerAddress.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ customer_id: 3, is_default: 0, state: 'Maharashtra', pincode: '400050' })
    );
    fixture.detectChanges();
    expect(text()).toContain('T90 Shop 4');

    host.site.resolve(3).subscribe((value) => (id = value));
    expect(id).toBe(21);
    expect(service.addCustomerAddress).toHaveBeenCalledTimes(1);
  }));

  it('passes on the reason when the api refuses the new address', fakeAsync(() => {
    service.addCustomerAddress.and.returnValue(of({ status: 0, message: 'pincode must be a 6 digit PIN code that does not start with 0' } as any));
    host.collapsed = false;
    fixture.detectChanges();
    (el().querySelector('[data-site="new"]') as HTMLInputElement).dispatchEvent(new Event('change'));
    fixture.detectChanges();
    type('#' + host.site.uid + '-line', 'T90 Shop 4');
    type('#' + host.site.uid + '-pin', '400050');
    let error: any;
    host.site.resolve(3).subscribe({ error: (err) => (error = err) });
    expect(error).toBe('pincode must be a 6 digit PIN code that does not start with 0');
  }));

  it('with no saved address it offers to add one; left empty it asks for nothing', fakeAsync(() => {
    service.getCustomerAddresses.and.returnValue(ok([]));
    fixture.detectChanges();
    expect(text()).toContain('This customer has no address yet.');
    (el().querySelector('[data-site="toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el().querySelector('.site-option')).toBeNull();
    expect(el().querySelector('#' + host.site.uid + '-pin')).not.toBeNull();
    expect((el().querySelector('#' + host.site.uid + '-state') as HTMLSelectElement).value).toBe('24');
    expect(host.site.hasProblem()).toBeFalse();
    expect(host.site.newAddress()).toBeNull();
    let id: number | null | undefined;
    host.site.resolve(3).subscribe((value) => (id = value));
    expect(id).toBeNull();

    type('#' + host.site.uid + '-line', 'T90 Shop 4');
    expect(host.site.hasProblem()).toBeTrue();
    fixture.detectChanges();
    expect(text()).toContain('Enter a 6-digit PIN code.');
  }));

  it('for a customer still being typed it shows the form only, and gives the address to send with the customer', fakeAsync(() => {
    host.customerId = null;
    fixture.detectChanges();
    expect(service.getCustomerAddresses).not.toHaveBeenCalled();
    expect(text()).toContain('Optional. It can be added later.');
    (el().querySelector('[data-site="toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    type('#' + host.site.uid + '-line', 'Plot 9');
    type('#' + host.site.uid + '-city', 'Navagam');
    type('#' + host.site.uid + '-pin', '999999');
    expect(host.site.newAddressPayload()).toEqual({
      address: 'Plot 9',
      address_line2: null,
      city: 'Navagam',
      district: null,
      state: 'Gujarat',
      zip_code: '999999',
      pincode: '999999',
    });
  }));

  it('says so when the addresses cannot be loaded, offers to try again, and does not block the quotation', () => {
    service.getCustomerAddresses.and.returnValue(throwError(() => ({ status: 0 })));
    fixture.detectChanges();
    expect(text()).toContain('We could not load this customer’s addresses. The quotation will use the default one.');
    expect(host.site.hasProblem()).toBeFalse();
    let id: number | null | undefined;
    host.site.resolve(3).subscribe((value) => (id = value));
    expect(id).toBeNull();

    service.getCustomerAddresses.and.returnValue(ok(ADDRESSES));
    (el().querySelector('.callout button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el().querySelector('[data-site="now"]')?.textContent).toContain('14 Lake View');
  });

  it('loads the addresses of another customer when the customer changes', () => {
    fixture.detectChanges();
    service.getCustomerAddresses.and.returnValue(ok([{ ...ADDRESSES[0], id: 30, customer_id: 4, is_default: 1, address: 'Plot 4' }]));
    host.customerId = 4;
    fixture.detectChanges();
    expect(service.getCustomerAddresses).toHaveBeenCalledWith(4);
    expect(el().querySelector('[data-site="now"]')?.textContent).toContain('Plot 4');
    expect(service.getGstStates).withContext('the states are asked for once').toHaveBeenCalledTimes(1);
  });
});

describe('SiteAddressDialogComponent', () => {
  let fixture: ComponentFixture<SiteAddressDialogComponent>;
  let dialog: SiteAddressDialogComponent;
  let service: jasmine.SpyObj<QuotationService>;
  const body = (): HTMLElement => document.querySelector('.p-dialog') as HTMLElement;

  beforeEach(() => {
    const made = mocks();
    service = made.service;
    TestBed.configureTestingModule({
      imports: [SiteAddressDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: QuotationService, useValue: service },
        { provide: LocationService, useValue: made.location },
      ],
    });
    fixture = TestBed.createComponent(SiteAddressDialogComponent);
    dialog = fixture.componentInstance;
    dialog.quotationId = 14;
    dialog.customerId = 3;
    dialog.addressId = 7;
    dialog.visible = true;
    fixture.detectChanges();
  });

  it('opens on the address of the quotation, with the choices in view', () => {
    expect(body().textContent).toContain('Site address');
    const radios = Array.from(body().querySelectorAll('.site-option input')) as HTMLInputElement[];
    expect(radios.map((radio) => radio.checked)).toEqual([true, false, false]);
  });

  it('saves another address to the quotation and says it was saved', () => {
    const saved = jasmine.createSpy('saved');
    dialog.saved.subscribe(saved);
    const radios = Array.from(body().querySelectorAll('.site-option input')) as HTMLInputElement[];
    radios[1].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    dialog.submit();
    expect(service.setSiteAddress).toHaveBeenCalledOnceWith(14, 3, 8);
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the address was not changed', () => {
    const saved = jasmine.createSpy('saved');
    dialog.saved.subscribe(saved);
    dialog.submit();
    expect(service.setSiteAddress).not.toHaveBeenCalled();
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog and shows the reason when the api refuses', () => {
    service.setSiteAddress.and.returnValue(throwError(() => ({ error: { message: 'A billed quotation cannot be changed.' } })));
    const saved = jasmine.createSpy('saved');
    dialog.saved.subscribe(saved);
    (Array.from(body().querySelectorAll('.site-option input')) as HTMLInputElement[])[1].dispatchEvent(new Event('change'));
    dialog.submit();
    fixture.detectChanges();
    expect(body().textContent).toContain('A billed quotation cannot be changed.');
    expect(saved).not.toHaveBeenCalled();
    expect(dialog.saving).toBeFalse();
  });
});
