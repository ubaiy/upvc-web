import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { ToastService } from 'src/app/shared/services/toast.service';
import { PaymentTermsCardComponent } from './payment-terms-card.component';
import { PaymentTermsService } from './payment-terms.service';

const TERMS = [
  { id: 1, name: '50% Advance', description: 'Half advance with order, balance before dispatch' },
  { id: 2, name: '100% Advance', description: 'Full payment with order' },
];

describe('PaymentTermsCardComponent', () => {
  let fixture: ComponentFixture<PaymentTermsCardComponent>;
  let component: PaymentTermsCardComponent;
  let service: jasmine.SpyObj<PaymentTermsService>;
  let toast: jasmine.SpyObj<ToastService>;
  let el: HTMLElement;

  function create(list: any = { success: true, data: TERMS }) {
    service = jasmine.createSpyObj('PaymentTermsService', ['getPaymentTypeList', 'addPaymentType', 'editPaymentType', 'deletePaymentTerms']);
    service.getPaymentTypeList.and.returnValue(list.subscribe ? list : of(list));
    service.addPaymentType.and.returnValue(of({ success: true } as any));
    service.editPaymentType.and.returnValue(of({ success: true } as any));
    service.deletePaymentTerms.and.returnValue(of({ success: true } as any));
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']);
    TestBed.configureTestingModule({
      imports: [PaymentTermsCardComponent, NoopAnimationsModule],
      providers: [
        { provide: PaymentTermsService, useValue: service },
        { provide: ToastService, useValue: toast },
      ],
    });
    fixture = TestBed.createComponent(PaymentTermsCardComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  it('lists the terms with the sentence the customer reads', () => {
    create();
    expect(el.querySelectorAll('tbody tr').length).toBe(2);
    expect(el.textContent).toContain('Half advance with order, balance before dispatch');
    const labels = Array.from(el.querySelectorAll('tbody button')).map((b) => b.getAttribute('aria-label'));
    expect(labels).toContain('Edit 50% Advance');
    expect(labels).toContain('Delete 100% Advance');
  });

  it('shows an empty state when there are none', () => {
    create({ success: true, data: [] });
    expect(el.textContent).toContain('No payment terms yet');
  });

  it('shows an inline error with "Try again" when the list fails', () => {
    create(throwError(() => new Error('offline')));
    expect(el.querySelector('.callout button')?.textContent).toContain('Try again');
  });

  it('adds a term', () => {
    create();
    component.open();
    component.form.setValue({ name: '30 days credit', description: ' Payment within 30 days of delivery ' });
    component.save();
    expect(service.addPaymentType).toHaveBeenCalledWith(
      jasmine.objectContaining({ name: '30 days credit', description: 'Payment within 30 days of delivery' })
    );
    expect(toast.showSuccess).toHaveBeenCalledWith('Payment term added');
  });

  it('edits a term by its id', () => {
    create();
    component.open(TERMS[0] as any);
    component.form.patchValue({ description: '50% now, 50% before dispatch' });
    component.save();
    expect(service.editPaymentType).toHaveBeenCalledWith(jasmine.objectContaining({ id: 1, description: '50% now, 50% before dispatch' }));
  });

  it('needs both a name and the printed sentence', () => {
    create();
    component.open();
    component.save();
    expect(service.addPaymentType).not.toHaveBeenCalled();
  });

  it('deletes after a confirmation', () => {
    create();
    component.remove(TERMS[1] as any);
    fixture.detectChanges();
    const dialog = el.querySelector('app-confirm-dialog')!;
    expect(Array.from(dialog.querySelectorAll('button')).map((b) => b.textContent!.trim())).toEqual(['Keep it', 'Delete payment term']);
    expect(service.deletePaymentTerms).not.toHaveBeenCalled();
    (dialog.querySelector('.btn-danger') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(service.deletePaymentTerms).toHaveBeenCalledWith(2);
    expect(toast.showSuccess).toHaveBeenCalledWith('Payment term deleted');
  });
});
