import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MenuModule } from 'primeng/menu';
import { of, Subject, throwError } from 'rxjs';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ConfirmationDialogService } from 'src/app/shared/services/confirmationdialog.service';
import { ToastService } from 'src/app/shared/services/toast.service';
import { CustomerService } from '../../customers/customer.service';
import { BillsService } from '../bills.service';
import { ListComponent } from './list.component';

const BILLS = [
  { id: 2, quatation_identity: '6ac205d330246', grand_total: 14159.58, customer_id: 3, name: 'Sharma Residency' },
  { id: 1, quatation_identity: 'gone', grand_total: 100, customer_id: 4, name: 'Modern Homes LLP' },
];
const QUOTATIONS = [{ id: 17, quatation_identity: '6ac205d330246', quatation_name: 'Sharma Flat Renovation', number: 'Q-0005', total: 20050 }];
const ok = (data: any = {}) => of({ success: true, data, message: 'ok' } as any);

describe('ListComponent (bills)', () => {
  let fixture: ComponentFixture<ListComponent>;
  let service: jasmine.SpyObj<BillsService>;
  let customers: jasmine.SpyObj<CustomerService>;
  let confirm: jasmine.SpyObj<ConfirmationDialogService>;
  let toast: jasmine.SpyObj<ToastService>;
  const el = (): HTMLElement => fixture.nativeElement;

  beforeEach(() => {
    service = jasmine.createSpyObj('BillsService', ['getBillsList', 'getQuotations', 'downloadBillPdf', 'cancelBill']);
    customers = jasmine.createSpyObj('CustomerService', ['getCustomerDetail']);
    confirm = jasmine.createSpyObj('ConfirmationDialogService', ['confirm']);
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']);
    service.getQuotations.and.returnValue(ok(QUOTATIONS));
    TestBed.configureTestingModule({
      declarations: [ListComponent],
      imports: [RouterTestingModule, NoopAnimationsModule, FormsModule, MenuModule, DialogModule, ButtonModule, SharedComponentsModule],
      providers: [
        { provide: BillsService, useValue: service },
        { provide: CustomerService, useValue: customers },
        { provide: ConfirmationDialogService, useValue: confirm },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  function create(list: any): void {
    service.getBillsList.and.returnValue(list);
    fixture = TestBed.createComponent(ListComponent);
    fixture.detectChanges();
  }

  it('shows skeleton rows while the list loads', () => {
    create(new Subject());
    expect(el().querySelectorAll('.sk-row').length).toBe(6);
    expect(el().querySelector('[role="status"]')?.textContent).toContain('Loading bills');
  });

  it('lists number, customer, a link back to the quotation, and the amount through the INR pipe', () => {
    create(ok(BILLS));
    const rows = el().querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Bill 2');
    expect(rows[0].textContent).toContain('Sharma Residency');
    expect(rows[0].textContent).toContain('₹20,050.00');
    expect(rows[0].textContent).toContain('Q-0005');
    const link = Array.from(rows[0].querySelectorAll('a')).find((a) => a.textContent?.includes('Sharma Flat Renovation'));
    expect(link?.getAttribute('href')).toBe('/quotation/detail/17');
    expect(rows[1].textContent).toContain('gone');
    expect(rows[1].querySelector('a[href^="/quotation"]')).toBeNull();
    expect(rows[0].querySelector('.row-actions button')?.getAttribute('aria-label')).toBe('More actions for Bill 2');
  });

  it('shows the empty state with the one primary button', () => {
    create(ok([]));
    expect(el().querySelector('.empty h2')?.textContent).toContain('No bills yet');
    expect(el().querySelectorAll('.btn-primary').length).toBe(1);
  });

  it('shows an inline error and loads again on "Try again"', () => {
    create(throwError(() => new Error('offline')));
    expect(el().querySelector('.callout')?.textContent).toContain('We could not load your bills');
    service.getBillsList.and.returnValue(ok(BILLS));
    (el().querySelector('.callout button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el().querySelectorAll('tbody tr').length).toBe(2);
  });

  it('still lists bills, without links, when the quotations cannot be read', () => {
    service.getQuotations.and.returnValue(throwError(() => new Error('offline')));
    create(ok(BILLS));
    expect(el().querySelectorAll('tbody tr').length).toBe(2);
    expect(el().querySelector('a[href^="/quotation"]')).toBeNull();
  });

  it('offers payments, download, the quotation and cancel in the row menu', () => {
    create(ok(BILLS));
    const component = fixture.componentInstance;
    component.openMenu(new MouseEvent('click'), component.bills[0]);
    expect(component.menuItems.filter((item) => item.label).map((item) => item.label)).toEqual([
      'Record payment',
      'Payments',
      'Download PDF',
      'Open quotation',
      'Cancel bill',
    ]);
    component.openMenu(new MouseEvent('click'), component.bills[1]);
    expect(component.menuItems.filter((item) => item.label).map((item) => item.label)).toEqual([
      'Record payment',
      'Payments',
      'Download PDF',
      'Cancel bill',
    ]);
  });

  it('opens the payments of the bill, with Record payment already open (card PAY2)', () => {
    create(ok(BILLS));
    const component = fixture.componentInstance;
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const run = (label: string) => component.menuItems.find((item) => item.label === label)?.command?.({} as any);
    component.openMenu(new MouseEvent('click'), component.bills[0]);
    run('Record payment');
    expect(navigate).toHaveBeenCalledWith(['/payments/bill', 2], { queryParams: { record: 1 } });
    run('Payments');
    expect(navigate).toHaveBeenCalledWith(['/payments/bill', 2]);
  });

  it('does not offer Record payment on a cancelled bill', () => {
    create(ok(BILLS));
    const component = fixture.componentInstance;
    component.bills = component.bills.map((row) => ({ ...row, cancelled: true }));
    component.openMenu(new MouseEvent('click'), component.bills[0]);
    const labels = component.menuItems.map((item) => item.label);
    expect(labels).not.toContain('Record payment');
    expect(labels).toContain('Payments');
  });

  it('downloads in one step, taking the GSTIN from the customer', () => {
    create(ok(BILLS));
    customers.getCustomerDetail.and.returnValue(ok({ id: 3, gstin: '27ABCDE1234F1Z5' }));
    service.downloadBillPdf.and.returnValue(of(new Blob(['pdf'])));
    spyOn(window, 'open');
    fixture.componentInstance.download(fixture.componentInstance.bills[0]);
    expect(service.downloadBillPdf).toHaveBeenCalledWith({ bill_id: 2, customer_gst_no: '27ABCDE1234F1Z5', download: true });
    expect(window.open).toHaveBeenCalled();
    expect(fixture.componentInstance.downloading).toBeNull();
  });

  it('still downloads when the customer no longer exists', () => {
    create(ok(BILLS));
    customers.getCustomerDetail.and.returnValue(throwError(() => new Error('404')));
    service.downloadBillPdf.and.returnValue(of(new Blob(['pdf'])));
    spyOn(window, 'open');
    fixture.componentInstance.download(fixture.componentInstance.bills[0]);
    expect(service.downloadBillPdf).toHaveBeenCalledWith({ bill_id: 2, customer_gst_no: '', download: true });
  });

  it('cancels a bill after confirmation, with the reason typed, and keeps the row, marked cancelled', () => {
    create(ok(BILLS));
    service.cancelBill.and.returnValue(ok());
    fixture.componentInstance.cancel(fixture.componentInstance.bills[0]);
    fixture.detectChanges();
    expect(service.cancelBill).not.toHaveBeenCalled();
    expect((document.querySelector('.p-dialog')?.textContent || '').replace(/\s+/g, ' ')).toContain('Cancel Bill 2?');
    fixture.componentInstance.cancelReason = 'Wrong customer';
    fixture.componentInstance.confirmCancel();
    expect(service.cancelBill).toHaveBeenCalledOnceWith(2, 'Wrong customer');
    expect(fixture.componentInstance.cancelling).toBeNull();
    expect(fixture.componentInstance.bills.map((row) => row.cancelled)).toEqual([true, false]);
    fixture.detectChanges();
    expect(el().querySelector('tbody tr .badge-danger')?.textContent).toContain('Cancelled');
    fixture.componentInstance.openMenu(new MouseEvent('click'), fixture.componentInstance.bills[0]);
    expect(fixture.componentInstance.menuItems.some((item) => item.label === 'Cancel bill')).toBeFalse();
    expect(toast.showSuccess).toHaveBeenCalledWith('Bill 2 cancelled');
  });
});
