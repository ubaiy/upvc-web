import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { BillsService } from '../../bills/bills.service';
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
  let bills: jasmine.SpyObj<BillsService>;
  let toast: jasmine.SpyObj<ToastService>;
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
    ]);
    bills = jasmine.createSpyObj('BillsService', ['getQuotations', 'getBillsList']);
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']);
    service.getStates.and.returnValue(ok(STATES));
    service.getCompanySettings.and.returnValue(ok({ state_code: '24' }));
    service.getCustomerDetail.and.returnValue(ok(CUSTOMER));
    service.addCustomer.and.returnValue(ok({ id: 11 }));
    service.editCustomer.and.returnValue(ok({ id: 3 }));
    service.addCustomerAddress.and.returnValue(ok());
    service.editCustomerAddress.and.returnValue(ok());
    bills.getQuotations.and.returnValue(
      ok([
        { id: 17, customer_id: 3, quatation_name: 'Sharma Flat Renovation', quatation_identity: 'abc', total: 16708, is_convert_bill: 1 },
        { id: 18, customer_id: 4, quatation_name: 'Someone else', quatation_identity: 'zzz' },
      ])
    );
    bills.getBillsList.and.returnValue(ok([{ id: 2, customer_id: 3, quatation_identity: 'abc', grand_total: 14159.58 }]));

    TestBed.configureTestingModule({
      declarations: [DetailsComponent],
      imports: [RouterTestingModule, ReactiveFormsModule, SharedComponentsModule],
      providers: [
        { provide: CustomerService, useValue: service },
        { provide: BillsService, useValue: bills },
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
      expect(bills.getQuotations).not.toHaveBeenCalled();
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

    it('sets the state from a valid GSTIN and refuses a state that disagrees', () => {
      component.form.patchValue({ name: 'Amit Mehta', phone: '9812345670', gstin: '27abcde1234f1z5' });
      component.onGstinChange();
      expect(component.form.value.gstin).toBe('27ABCDE1234F1Z5');
      expect(component.addresses.at(0).value.state_code).toBe('27');
      component.addresses.at(0).patchValue({ state_code: '24' });
      expect(component.stateMismatch).toBeTrue();
      component.submit();
      expect(service.addCustomer).not.toHaveBeenCalled();
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
      expect(text).toContain('₹14,159.58');
      expect(el().querySelector('app-quote-status')?.textContent).toContain('Billed');
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

    it('shows an inline error with "Try again" when the history fails, and keeps the form', () => {
      bills.getBillsList.and.returnValue(throwError(() => new Error('offline')));
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
});
