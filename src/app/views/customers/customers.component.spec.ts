import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { MenuModule } from 'primeng/menu';
import { of, Subject, throwError } from 'rxjs';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ToastService } from 'src/app/shared/services/toast.service';
import { UndoService } from 'src/app/shared/services/undo.service';
import { CustomerService } from './customer.service';
import { CustomersComponent } from './customers.component';

const CUSTOMERS = [
  { id: 3, name: 'Sharma Residency', phone: '9823456781', email: 'sharma@example.com', is_dealer: 0, state_code: '27' },
  { id: 4, name: 'Modern Homes LLP', phone: '9834567892', email: '', is_dealer: 1, gstin: '24ABCDE1234F1Z5' },
];
const STATES = { success: true, data: [{ code: '27', name: 'Maharashtra', abbreviation: 'MH' }] };
const ADDRESSES = [
  { id: 9, customer_id: 3, is_default: 0, city: 'Nashik', state: 'MH', pincode: '422010', zip_code: '422010' },
  { id: 7, customer_id: 3, is_default: 1, city: 'Mumbai', state: 'MH', pincode: '400050', zip_code: '400050' },
  // Saved before city and PIN code: the row then shows the state alone.
  { id: 8, customer_id: 4, is_default: 1, city: null, state: 'MH', pincode: null, zip_code: null },
];

describe('CustomersComponent', () => {
  let fixture: ComponentFixture<CustomersComponent>;
  let service: jasmine.SpyObj<CustomerService>;
  let undo: UndoService;
  let toast: jasmine.SpyObj<ToastService>;
  const el = (): HTMLElement => fixture.nativeElement;

  beforeEach(() => {
    service = jasmine.createSpyObj('CustomerService', ['getCustomerList', 'getStates', 'getAllAddresses', 'deleteCustomer']);
    service.getAllAddresses.and.returnValue(of({ success: true, data: ADDRESSES } as any));
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']);
    service.getStates.and.returnValue(of(STATES as any));
    TestBed.configureTestingModule({
      declarations: [CustomersComponent],
      imports: [RouterTestingModule, NoopAnimationsModule, FormsModule, MenuModule, SharedComponentsModule],
      providers: [
        { provide: CustomerService, useValue: service },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  function create(list: any): void {
    service.getCustomerList.and.returnValue(list);
    fixture = TestBed.createComponent(CustomersComponent);
    fixture.detectChanges();
  }

  it('shows skeleton rows while the list loads', () => {
    create(new Subject());
    expect(el().querySelectorAll('.sk-row').length).toBe(6);
    expect(el().querySelector('[role="status"]')?.textContent).toContain('Loading customers');
    expect(el().querySelector('table')).toBeNull();
  });

  it('shows "City - PIN" of the default address above the state, and finds a customer by city or PIN (T90)', () => {
    create(of({ success: true, data: CUSTOMERS }));
    const cells = Array.from(el().querySelectorAll('[data-c="place"]')).map((cell) => (cell.textContent || '').replace(/\s+/g, ' ').trim());
    expect(cells).toEqual(['Maharashtra', 'Mumbai - 400050Maharashtra']);
    expect(el().querySelector('thead')?.textContent).toContain('City and state');

    const component = fixture.componentInstance;
    component.search = 'mumb';
    expect(component.filtered.map((c) => c.name)).toEqual(['Sharma Residency']);
    component.search = '400050';
    expect(component.filtered.map((c) => c.name)).toEqual(['Sharma Residency']);
  });

  it('still lists the customers when their addresses cannot be read', () => {
    service.getAllAddresses.and.returnValue(throwError(() => new Error('offline')));
    create(of({ success: true, data: CUSTOMERS }));
    expect(el().querySelectorAll('tbody tr').length).toBe(2);
    const cells = Array.from(el().querySelectorAll('[data-c="place"]')).map((cell) => (cell.textContent || '').trim());
    expect(cells).toEqual(['—', 'Maharashtra']);
  });

  it('lists customers A to Z with state, GSTIN and price list', () => {
    create(of({ success: true, data: CUSTOMERS }));
    const rows = el().querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Modern Homes LLP');
    expect(rows[0].textContent).toContain('24ABCDE1234F1Z5');
    expect(rows[0].querySelector('.badge')?.textContent?.trim()).toBe('Dealer');
    expect(rows[1].textContent).toContain('Maharashtra');
    expect(rows[1].querySelector('.badge')?.textContent?.trim()).toBe('Retail');
    expect(el().querySelector('.table-foot')?.textContent).toContain('2 customers');
  });

  it('has exactly one primary button, and every control has a name', () => {
    create(of({ success: true, data: CUSTOMERS }));
    expect(el().querySelectorAll('.btn-primary').length).toBe(1);
    const more = el().querySelectorAll('.row-actions button');
    expect(more[0].getAttribute('aria-label')).toBe('More actions for Modern Homes LLP');
    expect(el().querySelector('input[type="search"]')?.getAttribute('aria-label')).toBe('Search customers');
  });

  it('shows the empty state, with the one primary button inside it', () => {
    create(of({ success: true, data: [] }));
    expect(el().querySelector('.empty h2')?.textContent).toContain('No customers yet');
    expect(el().querySelectorAll('.btn-primary').length).toBe(1);
    expect(el().querySelector('.empty .btn-primary')).not.toBeNull();
  });

  it('shows an inline error and loads again on "Try again"', () => {
    create(throwError(() => new Error('offline')));
    expect(el().querySelector('.callout')?.textContent).toContain('We could not load your customers');
    service.getCustomerList.and.returnValue(of({ success: true, data: CUSTOMERS } as any));
    (el().querySelector('.callout button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el().querySelectorAll('tbody tr').length).toBe(2);
  });

  it('still lists customers when the state list fails', () => {
    service.getStates.and.returnValue(throwError(() => new Error('offline')));
    create(of({ success: true, data: CUSTOMERS }));
    expect(el().querySelectorAll('tbody tr').length).toBe(2);
  });

  it('searches by name, phone or GSTIN', () => {
    create(of({ success: true, data: CUSTOMERS }));
    const component = fixture.componentInstance;
    component.search = '98234';
    expect(component.rows.map((row) => row.id)).toEqual([3]);
    component.search = '24abc';
    expect(component.rows.map((row) => row.id)).toEqual([4]);
    component.search = 'nobody';
    fixture.detectChanges();
    expect(el().querySelector('.empty h2')?.textContent).toContain('No customer matches');
  });

  it('pages ten at a time', () => {
    const many = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, name: `C${String(i).padStart(2, '0')}`, phone: '9' }));
    create(of({ success: true, data: many }));
    const component = fixture.componentInstance;
    expect(component.rows.length).toBe(10);
    component.go(1);
    component.go(1);
    expect(component.rows.length).toBe(3);
    component.go(1);
    expect(component.page).toBe(2);
  });

  it('offers "New quotation" for a customer in the row menu, with the customer chosen (m17)', () => {
    create(of({ success: true, data: CUSTOMERS }));
    const component = fixture.componentInstance;
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    component.openMenu(new Event('click'), component.customers[0]);
    expect(component.menuItems.filter((item) => !item.separator).map((item) => item.label)).toEqual(['Edit', 'New quotation', 'Delete']);
    component.menuItems[1].command!({} as any);
    expect(navigate).toHaveBeenCalledOnceWith(['/quotation'], { queryParams: { new: 1, customer: component.customers[0].id } });
  });

  it('delete takes the row away at once and sends nothing while "Undo" is offered', () => {
    create(of({ success: true, data: CUSTOMERS }));
    undo = TestBed.inject(UndoService);
    service.deleteCustomer.and.returnValue(of({ success: true, message: 'ok' } as any));
    const modern = fixture.componentInstance.customers[0];
    fixture.componentInstance.deleteCustomer(modern);
    expect(fixture.componentInstance.customers.map((row) => row.id)).toEqual([3]);
    expect(undo.offer$.value?.message).toBe('Modern Homes LLP deleted');
    expect(service.deleteCustomer).not.toHaveBeenCalled();
    // The toast went without "Undo": now the api is asked.
    undo.flush();
    expect(service.deleteCustomer).toHaveBeenCalledOnceWith(4);
    expect(fixture.componentInstance.customers.map((row) => row.id)).toEqual([3]);
  });

  it('"Undo" puts the customer back where it was and nothing is sent', () => {
    create(of({ success: true, data: CUSTOMERS }));
    undo = TestBed.inject(UndoService);
    const before = fixture.componentInstance.customers.map((row) => row.id);
    fixture.componentInstance.deleteCustomer(fixture.componentInstance.customers[0]);
    undo.undo();
    expect(fixture.componentInstance.customers.map((row) => row.id)).toEqual(before);
    expect(service.deleteCustomer).not.toHaveBeenCalled();
  });

  it('puts the customer back and says why when the api refuses the delete', () => {
    create(of({ success: true, data: CUSTOMERS }));
    undo = TestBed.inject(UndoService);
    const before = fixture.componentInstance.customers.map((row) => row.id);
    service.deleteCustomer.and.returnValue(of({ status: 0, message: 'This customer has bills.' } as any));
    fixture.componentInstance.deleteCustomer(fixture.componentInstance.customers[0]);
    undo.flush();
    expect(fixture.componentInstance.customers.map((row) => row.id)).toEqual(before);
    expect(toast.showError).toHaveBeenCalledWith('This customer has bills.');
  });
});
