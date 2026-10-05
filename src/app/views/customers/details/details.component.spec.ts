import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { AddressFieldsComponent } from 'src/app/shared/components/address-fields/address-fields.component';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { LocationService } from 'src/app/shared/services/location.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { CustomerService } from '../customer.service';
import { DetailsComponent } from './details.component';

const STATES = [
  { code: '24', name: 'Gujarat', abbreviation: 'GJ' },
  { code: '27', name: 'Maharashtra', abbreviation: 'MH' },
];
const CUSTOMER = {
  id: 3,
  name: 'Sharma Residency',
  phone: '9823456781',
  email: 'sharma@example.com',
  is_dealer: 0,
  addresses: [
    { id: 8, address: 'Site office', is_default: 0, city: 'Pune', state: 'MH', zip_code: '411001' },
    { id: 7, address: 'B-203 Sunrise Towers', is_default: 1, city: 'Mumbai', state: 'MH', zip_code: '400050' },
  ],
};
const ok = (data: any = {}) => of({ success: true, data, message: 'ok' } as any);

describe('DetailsComponent (customer page)', () => {
  let fixture: ComponentFixture<DetailsComponent>;
  let component: DetailsComponent;
  let service: jasmine.SpyObj<CustomerService>;
  let toast: jasmine.SpyObj<ToastService>;
  let location: jasmine.SpyObj<LocationService>;

  /** Types a PIN code into an address block and waits for the lookup. */
  function typePin(index: number, pin: string): void {
    const input = fixture.nativeElement.querySelector('#addr-pin-' + index) as HTMLInputElement;
    input.value = pin;
    input.dispatchEvent(new Event('input'));
    tick(400);
    fixture.detectChanges();
  }
  let router: Router;
  const el = (): HTMLElement => fixture.nativeElement;

  function create(route: { id?: number; edit: boolean }): void {
    service = jasmine.createSpyObj('CustomerService', [
      'getStates',
      'getCompanySettings',
      'getCustomerDetail',
      'addCustomer',
      'editCustomer',
      'addCustomerAddress',
      'editCustomerAddress',
      'deleteCustomerAddress',
      'makeDefaultAddress',
      'getCustomerQuotations',
      'getCustomerBills',
    ]);
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']);
    location = jasmine.createSpyObj('LocationService', ['lookupPin', 'cities']);
    location.cities.and.returnValue(of([]));
    location.lookupPin.and.callFake((pin: string) =>
      of(
        pin === '395007'
          ? { pincode: pin, city: 'Surat', district: 'Surat', stateCode: '24', stateName: 'Gujarat', localities: ['Adajan'] }
          : pin === '400050'
          ? { pincode: pin, city: 'Mumbai', district: 'Mumbai Suburban', stateCode: '27', stateName: 'Maharashtra', localities: [] }
          : null
      )
    );
    service.getStates.and.returnValue(ok(STATES));
    service.getCompanySettings.and.returnValue(ok({ state_code: '24' }));
    service.getCustomerDetail.and.returnValue(ok(CUSTOMER));
    service.addCustomer.and.returnValue(ok({ id: 11 }));
    service.editCustomer.and.returnValue(ok({ id: 3 }));
    service.addCustomerAddress.and.returnValue(ok());
    service.editCustomerAddress.and.returnValue(ok());
    service.getCustomerQuotations.and.returnValue(
      ok([
        { id: 17, customer_id: 3, quatation_name: 'Sharma Flat Renovation', quatation_identity: 'abc', number: 'Q-0005', total: 16708, is_convert_bill: 1 },
        { id: 18, customer_id: 4, quatation_name: 'Someone else', quatation_identity: 'zzz' },
      ])
    );
    service.getCustomerBills.and.returnValue(ok([{ id: 2, customer_id: 3, quatation_identity: 'abc', grand_total: 14159.58 }]));

    TestBed.configureTestingModule({
      declarations: [DetailsComponent],
      imports: [RouterTestingModule, ReactiveFormsModule, SharedComponentsModule, AddressFieldsComponent],
      providers: [
        { provide: LocationService, useValue: location },
        { provide: CustomerService, useValue: service },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmationDialogService, useValue: jasmine.createSpyObj('ConfirmationDialogService', ['confirm']) },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { params: { id: route.id }, data: { edit: route.edit } } },
        },
      ],
    });
    fixture = TestBed.createComponent(DetailsComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture.detectChanges();
  }

  describe('new customer', () => {
    beforeEach(() => create({ edit: false }));

    it('is one form: name, phone, email, GSTIN, price list and an address in the company state', () => {
      expect(el().querySelector('h1')?.textContent).toContain('New customer');
      ['cust-name', 'cust-phone', 'cust-email', 'cust-gstin', 'addr-line-0', 'addr-city-0', 'addr-pin-0', 'addr-state-0'].forEach(
        (id) => expect(el().querySelector(`label[for="${id}"]`)).withContext(id).not.toBeNull()
      );
      expect(component.addresses.at(0).value.state_code).toBe('24');
      expect(el().querySelectorAll('.btn-primary').length).toBe(1);
      expect(service.getCustomerQuotations).not.toHaveBeenCalled();
    });

    it('saves with a name and a phone only, in one request', () => {
      component.form.patchValue({ name: 'Amit Mehta', phone: '9812345670' });
      component.submit();
      expect(service.addCustomer).toHaveBeenCalledTimes(1);
      const body: any = service.addCustomer.calls.mostRecent().args[0];
      expect(body.name).toBe('Amit Mehta');
      expect(body.address).toBeUndefined();
      expect(service.addCustomerAddress).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/customers/edit', 11]);
      expect(toast.showSuccess).toHaveBeenCalledWith('Amit Mehta added');
    });

    it('sends the first address with the customer and later ones on their own', () => {
      component.form.patchValue({ name: 'Amit Mehta', phone: '9812345670' });
      component.addresses.at(0).patchValue({ address: '12 MG Road', city: 'Dahod', zip_code: '389151' });
      component.addAddress();
      component.addresses.at(1).patchValue({ address: 'Plot 4', city: 'Pune', state_code: '27', zip_code: '411001' });
      component.submit();
      const body: any = service.addCustomer.calls.mostRecent().args[0];
      expect(body.address.state).toBe('Gujarat');
      expect(service.addCustomerAddress).toHaveBeenCalledTimes(1);
      const second: any = service.addCustomerAddress.calls.mostRecent().args[0];
      expect(second.customer_id).toBe(11);
      expect(second.is_default).toBe(0);
      expect(second.state).toBe('Maharashtra');
    });

    it('does not send an invalid form and says what to fix', () => {
      component.form.patchValue({ name: '', phone: '123', gstin: 'WRONG' });
      component.addresses.at(0).patchValue({ address: '12 MG Road' });
      component.submit();
      fixture.detectChanges();
      expect(service.addCustomer).not.toHaveBeenCalled();
      const text = el().textContent || '';
      expect(text).toContain("Enter the customer's name.");
      expect(text).toContain('Enter a 10-digit mobile number.');
      expect(text).toContain('A GSTIN has 15 characters');
      expect(text).toContain('Enter the city.');
      expect(text).toContain('Enter a 6-digit PIN code.');
      expect(el().querySelector('#cust-name')?.getAttribute('aria-invalid')).toBe('true');
    });

    it('asks for the PIN code first; PIN 395007 fills Surat and Gujarat, and they are saved (T90)', fakeAsync(() => {
      const ids = Array.from(el().querySelectorAll('.address input, .address select')).map((field) => field.id);
      expect(ids).toEqual(['addr-pin-0', 'addr-line-0', 'addr-line2-0', 'addr-city-0', 'addr-state-0']);

      component.form.patchValue({ name: 'T90 Amit Mehta', phone: '9812345670' });
      component.addresses.at(0).patchValue({ address: '12 Ring Road', state_code: '27' });
      typePin(0, '395007');
      expect(component.addresses.at(0).value).toEqual(
        jasmine.objectContaining({ city: 'Surat', district: 'Surat', state_code: '24', zip_code: '395007' })
      );
      (el().querySelector('.af-areas .af-chip') as HTMLButtonElement).click();
      component.submit();
      const body: any = service.addCustomer.calls.mostRecent().args[0];
      expect(body.address).toEqual({
        address: '12 Ring Road',
        address_line2: 'Adajan',
        city: 'Surat',
        district: 'Surat',
        state: 'Gujarat',
        zip_code: '395007',
        pincode: '395007',
      });
      expect(body.state_code).toBe('24');
    }));

    it('saves a PIN code and a city the directory does not have, as typed (T90)', fakeAsync(() => {
      component.form.patchValue({ name: 'T90 Amit Mehta', phone: '9812345670' });
      component.addresses.at(0).patchValue({ address: 'Plot 4', city: 'Navagam' });
      typePin(0, '999999');
      expect(el().textContent).toContain('This PIN is not in our list.');
      component.submit();
      expect(service.addCustomer).toHaveBeenCalledTimes(1);
      const body: any = service.addCustomer.calls.mostRecent().args[0];
      expect(body.address).toEqual(jasmine.objectContaining({ city: 'Navagam', district: null, state: 'Gujarat', zip_code: '999999' }));
    }));

    it('puts the cursor in the first field that has a message (m16)', fakeAsync(() => {
      document.body.appendChild(el());
      component.form.patchValue({ name: 'Amit Mehta', phone: '123' });
      component.submit();
      fixture.detectChanges();
      tick();
      expect(document.activeElement?.id).toBe('cust-phone');
      el().remove();
    }));

    it('asks before the page is left with typed changes, whatever link is used (m15)', async () => {
      expect(component.canLeave()).withContext('nothing typed').toBeTrue();
      expect(el().querySelector('[data-leave="ask"]')).toBeNull();

      component.form.patchValue({ name: 'Amit' });
      component.form.markAsDirty();
      const stay = component.canLeave() as Promise<boolean>;
      fixture.detectChanges();
      expect(el().querySelector('[data-leave="ask"]')?.textContent).toContain('This customer has changes that are not saved.');
      (el().querySelector('[data-leave="stay"]') as HTMLButtonElement).click();
      expect(await stay).withContext('"Keep editing" keeps the page').toBeFalse();
      fixture.detectChanges();
      expect(el().querySelector('[data-leave="ask"]')).toBeNull();

      const go = component.canLeave() as Promise<boolean>;
      fixture.detectChanges();
      (el().querySelector('[data-leave="go"]') as HTMLButtonElement).click();
      expect(await go).toBeTrue();
    });

    it('lets the page go without a question once the customer is saved', () => {
      component.form.patchValue({ name: 'Amit Mehta', phone: '9812345670' });
      component.form.markAsDirty();
      component.submit();
      expect(component.canLeave()).toBeTrue();
    });

    it('suggests the state of an empty first address from a valid GSTIN', () => {
      component.form.patchValue({ name: 'Amit Mehta', phone: '9812345670', gstin: '27abcde1234f1z5' });
      component.onGstinChange();
      expect(component.form.value.gstin).toBe('27ABCDE1234F1Z5');
      expect(component.addresses.at(0).value.state_code).toBe('27');
    });

    it('saves a customer whose GSTIN is of one state and whose address is in another (B1)', () => {
      component.form.patchValue({ name: 'Amit Mehta', phone: '9812345670', gstin: '24AABCP1234A1Z5' });
      component.addresses.at(0).patchValue({ address: 'Plot 4', city: 'Pune', state_code: '27', zip_code: '411001' });
      component.onGstinChange();
      expect(component.addresses.at(0).value.state_code).withContext('a written address keeps its state').toBe('27');
      component.submit();
      fixture.detectChanges();
      expect(service.addCustomer).toHaveBeenCalledTimes(1);
      const body: any = service.addCustomer.calls.mostRecent().args[0];
      expect(body.gstin).toBe('24AABCP1234A1Z5');
      expect(body.address.state).toBe('Maharashtra');
      expect(el().textContent).not.toContain('belongs to another state');
    });

    it('keeps the form and shows the reason when the API refuses', () => {
      service.addCustomer.and.returnValue(throwError(() => ({ error: { message: 'gstin is not a valid GSTIN' } })));
      component.form.patchValue({ name: 'Amit Mehta', phone: '9812345670' });
      component.submit();
      expect(toast.showError).toHaveBeenCalledWith('gstin is not a valid GSTIN');
      expect(component.saving).toBeFalse();
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe('existing customer', () => {
    beforeEach(() => create({ id: 3, edit: true }));

    it('fills the form, default address first, with old state text matched to the list', () => {
      expect(el().querySelector('h1')?.textContent).toContain('Sharma Residency');
      expect(component.addresses.length).toBe(2);
      expect(component.addresses.at(0).value.id).toBe(7);
      expect(component.addresses.at(0).value.state_code).toBe('27');
    });

    it('lists the quotations and bills of this customer only, money through the INR pipe', () => {
      const text = el().textContent || '';
      expect(text).toContain('Sharma Flat Renovation');
      expect(text).not.toContain('Someone else');
      expect(text).toContain('₹16,708.00');
      expect(text).toContain('Bill 2');
      expect(text).toContain('Q-0005');
      expect(el().querySelector('app-quote-status')?.textContent).toContain('Billed');
    });

    it('links to the payments of this customer (card PAY2)', () => {
      const link = el().querySelector('a.payments-link');
      expect(link?.textContent).toContain('Payments');
      expect(link?.getAttribute('href')).toBe('/payments?customer=3');
    });

    it('updates the customer and only the address that changed', () => {
      component.form.patchValue({ price_list: 'dealer' });
      component.addresses.at(1).patchValue({ city: 'Nashik' });
      component.addresses.at(1).markAsDirty();
      component.submit();
      const body: any = service.editCustomer.calls.mostRecent().args[0];
      expect(body.id).toBe(3);
      expect(body.is_dealer).toBe(1);
      expect(body.address).toBeUndefined();
      expect(service.editCustomerAddress).toHaveBeenCalledTimes(1);
      const address: any = service.editCustomerAddress.calls.mostRecent().args[0];
      expect(address.id).toBe(8);
      expect(address.city).toBe('Nashik');
      expect(address.is_default).toBe(0);
      expect(toast.showSuccess).toHaveBeenCalledWith('Customer saved');
    });

    it('a PIN typed into a saved address marks it changed, so it is sent (T90)', fakeAsync(() => {
      typePin(1, '395007');
      component.submit();
      expect(service.editCustomerAddress).toHaveBeenCalledTimes(1);
      const address: any = service.editCustomerAddress.calls.mostRecent().args[0];
      expect(address).toEqual(jasmine.objectContaining({ id: 8, city: 'Surat', district: 'Surat', state: 'Gujarat', zip_code: '395007' }));
    }));

    it('shows an inline error with "Try again" when the history fails, and keeps the form', () => {
      service.getCustomerBills.and.returnValue(throwError(() => new Error('offline')));
      component.loadHistory();
      fixture.detectChanges();
      expect(el().querySelector('.callout')?.textContent).toContain('quotations and bills');
      expect(el().querySelector('#cust-name')).not.toBeNull();
    });
  });

  it('shows an inline error with "Try again" when the customer cannot be loaded', () => {
    create({ id: 3, edit: true });
    service.getCustomerDetail.and.returnValue(throwError(() => new Error('offline')));
    component.load();
    fixture.detectChanges();
    expect(el().querySelector('.callout')?.textContent).toContain('We could not load this customer');
    expect(el().querySelector('#cust-name')).toBeNull();
  });

  describe('wired to the customer endpoints (T76)', () => {
    beforeEach(() => create({ id: 3, edit: true }));

    it('asks the API for this customer only', () => {
      expect(service.getCustomerQuotations).toHaveBeenCalledOnceWith(3);
      expect(service.getCustomerBills).toHaveBeenCalledOnceWith(3);
    });

    it('links to a new quotation for this customer', () => {
      const link = Array.from(el().querySelectorAll('a')).find((a) => (a.textContent || '').includes('New quotation'));
      expect(link?.getAttribute('href')).toBe('/quotation?new=1&customer=3');
    });

    it('makes a saved address the default and moves it to the top', () => {
      const count = component.addresses.length;
      if (count < 2) {
        component.addAddress();
        component.addresses.at(count).patchValue({ id: 99, address: '12 MG Road', city: 'Pune', zip_code: '411001' });
      }
      const last = component.addresses.length - 1;
      const id = component.addresses.at(last).value.id;
      expect(component.canMakeDefault(0)).toBeFalse();
      expect(component.canMakeDefault(last)).toBeTrue();
      service.makeDefaultAddress.and.returnValue(ok([]));
      component.makeDefault(last);
      expect(service.makeDefaultAddress).toHaveBeenCalledOnceWith(id);
      expect(component.addresses.at(0).value.id).toBe(id);
      expect(toast.showSuccess).toHaveBeenCalledWith('Default address changed');
    });

    it('leaves the order alone when the API refuses', () => {
      component.addAddress();
      const last = component.addresses.length - 1;
      component.addresses.at(last).patchValue({ id: 98, address: '1 Ring Road', city: 'Surat', zip_code: '395001' });
      const first = component.addresses.at(0).value.id;
      service.makeDefaultAddress.and.returnValue(of({ success: false, message: 'Invalid address id' } as any));
      component.makeDefault(last);
      expect(component.addresses.at(0).value.id).toBe(first);
      expect(toast.showError).toHaveBeenCalledWith('Invalid address id');
    });
  });

  describe('an address saved before city and PIN code were asked for (T90)', () => {
    beforeEach(() => {
      create({ id: 3, edit: true });
      service.getCustomerDetail.and.returnValue(
        ok({ ...CUSTOMER, addresses: [{ id: 7, address: 'B-203 Sunrise Towers', is_default: 1, city: null, district: null, state: 'MH', zip_code: null }] })
      );
      component.load();
      fixture.detectChanges();
    });

    it('opens with empty city and PIN and saves the customer without asking for them', () => {
      expect(component.addresses.at(0).value).toEqual(jasmine.objectContaining({ city: '', district: '', zip_code: '', state_code: '27' }));
      component.form.patchValue({ phone: '9812345670' });
      component.submit();
      fixture.detectChanges();
      expect(service.editCustomer).toHaveBeenCalledTimes(1);
      expect(service.editCustomerAddress).withContext('untouched: not sent').not.toHaveBeenCalled();
      expect(el().textContent).not.toContain('Enter the city.');
    });

    it('once it is edited it asks for the city, which the api requires, and saves with the PIN still empty', () => {
      const block = component.addresses.at(0);
      // As typing does: the address is marked changed, then takes the value.
      block.markAsDirty();
      block.patchValue({ address_line2: 'Near the lake' });
      component.submit();
      fixture.detectChanges();
      expect(service.editCustomer).not.toHaveBeenCalled();
      expect(el().textContent).toContain('Enter the city.');
      expect(el().textContent).not.toContain('Enter a 6-digit PIN code.');

      block.patchValue({ city: 'Thane' });
      component.submit();
      const address: any = service.editCustomerAddress.calls.mostRecent().args[0];
      expect(address).toEqual(
        jasmine.objectContaining({ id: 7, address_line2: 'Near the lake', city: 'Thane', zip_code: '', pincode: null, state: 'Maharashtra' })
      );
    });

    it('shows what the api says when the saved PIN code belongs to another state', () => {
      service.getCustomerDetail.and.returnValue(
        ok({
          ...CUSTOMER,
          addresses: [
            {
              id: 7,
              address: 'B-203 Sunrise Towers',
              is_default: 1,
              city: 'Mumbai',
              state: 'Gujarat',
              state_code: '24',
              pincode: '400050',
              zip_code: '400050',
              warnings: [
                { code: 'state_mismatch', message: 'PIN code 400050 is in Maharashtra (Mumbai) in the PIN code directory; the state given is Gujarat.' },
              ],
            },
          ],
        })
      );
      component.load();
      fixture.detectChanges();
      expect(el().querySelector('[data-af="mismatch"]')?.textContent).toContain('PIN code 400050 is in Maharashtra (Mumbai)');
      expect(component.form.valid).withContext('a warning, never a refusal').toBeTrue();
    });

    it('still refuses a PIN code that is not 6 digits', () => {
      component.addresses.at(0).patchValue({ zip_code: '1234' });
      component.submit();
      fixture.detectChanges();
      expect(service.editCustomer).not.toHaveBeenCalled();
      expect(el().textContent).toContain('Enter a 6-digit PIN code.');
    });
  });
});
