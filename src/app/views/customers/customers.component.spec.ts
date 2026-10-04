import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { MenuModule } from 'primeng/menu';
import { of, Subject, throwError } from 'rxjs';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { CustomerService } from './customer.service';
import { CustomersComponent } from './customers.component';

const CUSTOMERS = [
  { id: 3, name: 'Sharma Residency', phone: '9823456781', email: 'sharma@example.com', is_dealer: 0, state_code: '27' },
  { id: 4, name: 'Modern Homes LLP', phone: '9834567892', email: '', is_dealer: 1, gstin: '24ABCDE1234F1Z5' },
];
const STATES = { success: true, data: [{ code: '27', name: 'Maharashtra', abbreviation: 'MH' }] };

describe('CustomersComponent', () => {
  let fixture: ComponentFixture<CustomersComponent>;
  let service: jasmine.SpyObj<CustomerService>;
  let confirm: jasmine.SpyObj<ConfirmationDialogService>;
  let toast: jasmine.SpyObj<ToastService>;
  const el = (): HTMLElement => fixture.nativeElement;

  beforeEach(() => {
    service = jasmine.createSpyObj('CustomerService', ['getCustomerList', 'getStates', 'deleteCustomer']);
    confirm = jasmine.createSpyObj('ConfirmationDialogService', ['confirm']);
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']);
    service.getStates.and.returnValue(of(STATES as any));
    TestBed.configureTestingModule({
      declarations: [CustomersComponent],
      imports: [RouterTestingModule, NoopAnimationsModule, FormsModule, MenuModule, SharedComponentsModule],
      providers: [
        { provide: CustomerService, useValue: service },
        { provide: ConfirmationDialogService, useValue: confirm },
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

  it('deletes after confirmation and drops the row', () => {
    create(of({ success: true, data: CUSTOMERS }));
    service.deleteCustomer.and.returnValue(of({ success: true, message: 'ok' } as any));
    confirm.confirm.and.callFake((_h, _m, _i, accept) => accept());
    const modern = fixture.componentInstance.customers[0];
    fixture.componentInstance.deleteCustomer(modern);
    expect(service.deleteCustomer).toHaveBeenCalledWith(4);
    expect(fixture.componentInstance.customers.map((row) => row.id)).toEqual([3]);
    expect(toast.showSuccess).toHaveBeenCalledWith('Modern Homes LLP deleted');
  });
});
