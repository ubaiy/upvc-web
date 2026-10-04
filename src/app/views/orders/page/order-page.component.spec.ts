import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { MenuModule } from 'primeng/menu';
import { Subject, of, throwError } from 'rxjs';

import { SharedComponentsModule } from '../../../shared/components/shared-components.module';
import { ToastService } from '../../../shared/services/toast.service';
import { ConfirmDialogComponent } from '../../bills/confirm-dialog.component';
import { UndoService } from '../../../shared/services/undo.service';
import { DocumentPreviewComponent } from '../../payments/shared/document-preview.component';
import { ReasonDialogComponent } from '../../payments/shared/reason-dialog.component';
import { toOrderPage } from '../orders.adapter';
import { OrdersService } from '../orders.service';
import { rawOrderPage } from '../orders.testing';
import { OrderPageComponent } from './order-page.component';

@Component({ selector: 'app-account-payments', template: '', exportAs: 'payments' })
class PaymentsStubComponent {
  @Input() orderId: number | null = null;
  @Output() changed = new EventEmitter<any>();
  focusPanel = jasmine.createSpy('focusPanel');
}

const ok = (raw: any) => of({ ok: true as const, data: toOrderPage(raw), message: '' });

describe('OrderPageComponent', () => {
  let fixture: ComponentFixture<OrderPageComponent>;
  let component: OrderPageComponent;
  let service: jasmine.SpyObj<OrdersService>;
  let toast: jasmine.SpyObj<ToastService>;
  let undo: jasmine.SpyObj<UndoService>;

  const el = (): HTMLElement => fixture.nativeElement;
  const text = (): string => (el().textContent || '').replace(/\s+/g, ' ');
  const button = (label: string): HTMLButtonElement | undefined =>
    (Array.from(el().querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.textContent!.includes(label));
  const link = (label: string): HTMLAnchorElement | undefined =>
    (Array.from(el().querySelectorAll('a')) as HTMLAnchorElement[]).find((a) => a.textContent!.includes(label));

  async function create(response: any = ok(rawOrderPage())): Promise<void> {
    service.show.and.returnValue(response);
    fixture = TestBed.createComponent(OrderPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Reading a Blob, and a form taking its disabled state, are real async work: wait, then draw. */
  async function settle(stable = true): Promise<void> {
    for (let i = 0; i < 100; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (!component.busy) {
        break;
      }
    }
    fixture.detectChanges();
    if (stable) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  function type(id: string, value: string): void {
    const box = el().querySelector('#' + id) as HTMLInputElement;
    box.value = value;
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = jasmine.createSpyObj('OrdersService', ['show', 'setStage', 'update', 'cancel', 'challan']);
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError', 'showInfo']);
    undo = jasmine.createSpyObj('UndoService', ['offer']);
    TestBed.configureTestingModule({
      declarations: [OrderPageComponent, PaymentsStubComponent, ReasonDialogComponent, DocumentPreviewComponent],
      imports: [RouterTestingModule, NoopAnimationsModule, FormsModule, MenuModule, SharedComponentsModule, ConfirmDialogComponent],
      providers: [
        { provide: OrdersService, useValue: service },
        { provide: ToastService, useValue: toast },
        { provide: UndoService, useValue: undo },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '1' })) } },
      ],
    });
  });

  it('shows a skeleton while the order loads', async () => {
    await create(new Subject());
    expect(el().querySelector('[role="status"]')?.textContent).toContain('Loading the order');
    expect(el().querySelectorAll('.sk-row').length).toBe(3);
    expect(service.show).toHaveBeenCalledWith('1');
  });

  it('shows an inline error with "Try again"', async () => {
    await create(throwError(() => ({ error: { message: 'Invalid order id' } })));
    expect(text()).toContain('We could not load this order. Invalid order id');
    service.show.and.returnValue(ok(rawOrderPage()));
    button('Try again')!.click();
    fixture.detectChanges();
    expect(el().querySelector('h1')?.textContent).toContain('ORD/26-27/0001');
  });

  it('has exactly one primary button: the next stage, in the api\'s words', async () => {
    await create();
    const primary = el().querySelectorAll('.btn-primary');
    expect(primary.length).toBe(1);
    expect(primary[0].textContent).toContain('Start production');
    expect(primary[0].classList).toContain('btn-lg');
    expect(text()).toContain('Al-Rashid Villa Windows · Ahmed Al-Rashid');
    expect(el().querySelector('.meta')?.textContent).toContain('Confirmed');
    expect(el().querySelector('.meta')?.textContent).toContain('Part paid');
  });

  it('moves to the next stage in one tap and offers Undo, which posts the stage it came from', async () => {
    await create();
    service.setStage.and.returnValue(ok(rawOrderPage({ stage: 'in_production' })));
    button('Start production')!.click();
    fixture.detectChanges();
    expect(service.setStage).toHaveBeenCalledWith(1, 'in_production');
    expect(el().querySelector('.btn-primary')?.textContent).toContain('Mark ready');
    const offer = undo.offer.calls.mostRecent().args[0];
    expect(offer.message).toBe('ORD/26-27/0001 is now In production');

    service.setStage.and.returnValue(ok(rawOrderPage({ stage: 'confirmed' })));
    offer.undo!();
    fixture.detectChanges();
    expect(service.setStage).toHaveBeenCalledWith(1, 'confirmed');
    expect(el().querySelector('.btn-primary')?.textContent).toContain('Start production');
    expect(undo.offer).toHaveBeenCalledTimes(1);
  });

  it('says why the stage was not changed', async () => {
    await create();
    service.setStage.and.returnValue(of({ ok: false as const, message: 'date cannot be before the order date' }));
    button('Start production')!.click();
    fixture.detectChanges();
    expect(text()).toContain('The stage was not changed. date cannot be before the order date');
    service.setStage.and.returnValue(throwError(() => ({ status: 0 })));
    button('Start production')!.click();
    fixture.detectChanges();
    expect(text()).toContain('The stage was not changed. Check your connection.');
    expect(button('Try again')).toBeDefined();
  });

  it('shows the six stages with who did each and when', async () => {
    await create(ok(rawOrderPage({ stage: 'ready' })));
    const steps = Array.from(el().querySelectorAll('.track li'));
    expect(steps.length).toBe(6);
    expect(steps.filter((s) => s.classList.contains('done')).length).toBe(3);
    expect(steps[2].getAttribute('aria-current')).toBe('step');
    expect(steps[0].textContent!.replace(/\s+/g, ' ')).toContain('Confirmed4 Oct · Super Admin');
    expect(steps[4].textContent).toContain('Not yet');
  });

  it('saves the promised date only when it was changed', async () => {
    await create();
    expect((el().querySelector('#promised-date') as HTMLInputElement).value).toBe('2026-10-18');
    expect(button('Save date')).toBeUndefined();
    type('promised-date', '2026-10-25');
    service.update.and.returnValue(ok(rawOrderPage({ promised_date: '2026-10-25' })));
    button('Save date')!.click();
    fixture.detectChanges();
    expect(service.update).toHaveBeenCalledWith(1, { promised_date: '2026-10-25' });
    expect(toast.showSuccess).toHaveBeenCalledWith('Promised date saved');
    expect(button('Save date')).toBeUndefined();
  });

  it('saves the delivery details for the challan, and shows a refusal inline', async () => {
    await create();
    type('vehicle', 'GJ 01 XY 9999');
    service.update.and.returnValue(of({ ok: false as const, message: 'Order is cancelled' }));
    button('Save delivery details')!.click();
    fixture.detectChanges();
    expect(service.update).toHaveBeenCalledWith(1, { vehicle_number: 'GJ 01 XY 9999', transporter: 'Own vehicle', notes: 'Unload at the rear gate.' });
    expect(text()).toContain('Order is cancelled');
  });

  it('keeps the workshop note apart from the delivery note of the challan', async () => {
    await create();
    expect((el().querySelector('#workshop-note') as HTMLTextAreaElement).value).toBe('Site visit before install.');
    expect((el().querySelector('#order-notes') as HTMLTextAreaElement).value).toBe('Unload at the rear gate.');
    expect(button('Save note')).toBeUndefined();
    type('workshop-note', 'Use the long ladder');
    service.update.and.returnValue(ok(rawOrderPage({ workshop_note: 'Use the long ladder' })));
    button('Save note')!.click();
    await settle();
    expect(service.update).toHaveBeenCalledOnceWith(1, { workshop_note: 'Use the long ladder' });
    expect(toast.showSuccess).toHaveBeenCalledWith('Workshop note saved');
  });

  it('links to the quotation, the production pack, the bill and the payments', async () => {
    await create(ok(rawOrderPage({ bill: { id: 3, number: 'INV/26-27/0002', bill_date: '2026-10-05', total: 35456 } })));
    expect(link('Quotation')?.getAttribute('href')).toBe('/quotation/detail/14');
    expect(link('Production pack')?.getAttribute('href')).toBe('/production/14');
    expect(link('Production pack')?.textContent).toContain('Q-0003/P1 · not verified');
    expect(link('Bill')?.getAttribute('href')).toBe('/payments/bill/3');
    expect(link('Bill')?.textContent).toContain('INV/26-27/0002');
    expect(link('Ahmed Al-Rashid')?.getAttribute('href')).toBe('/customers/edit/2');
    expect(el().querySelector('a.call')?.getAttribute('href')).toBe('tel:9812345670');
    const payments = fixture.debugElement.query((d) => d.componentInstance instanceof PaymentsStubComponent).componentInstance;
    expect(payments.orderId).toBe(1);
    button('Payments')!.click();
    expect(payments.focusPanel).toHaveBeenCalled();
  });

  it('says "Not billed yet" when the job has no bill', async () => {
    await create();
    expect(text()).toContain('Not billed yet. The bill is made from the quotation.');
  });

  it('shows the windows and the amounts as the api returns them, through the INR pipe', async () => {
    await create();
    const rows = Array.from(el().querySelectorAll('tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' '));
    expect(rows[0]).toContain('Window 1 · Window');
    expect(rows[0]).toContain('1800 × 1200 mm');
    expect(rows[0]).toContain('₹8,851.86');
    const amounts = el().querySelector('.dl')!.textContent!.replace(/\s+/g, ' ');
    expect(amounts).toContain('Subtotal₹30,047.05');
    expect(amounts).toContain('CGST 9%₹2,704.23');
    expect(amounts).toContain('SGST 9%₹2,704.23');
    expect(amounts).toContain('Round off₹0.49');
    expect(amounts).toContain('Total₹35,456.00');
    expect(amounts).not.toContain('Discount');
  });

  it('refreshes the head when a payment is recorded below', async () => {
    await create();
    service.show.and.returnValue(ok(rawOrderPage({ received: 35456, balance: 0, payment_status: 'paid' })));
    fixture.debugElement.query((d) => d.componentInstance instanceof PaymentsStubComponent).componentInstance.changed.emit(null);
    fixture.detectChanges();
    expect(service.show).toHaveBeenCalledTimes(2);
    expect(el().querySelector('.meta')?.textContent).toContain('Paid');
  });

  it('previews the challan from the api page and downloads its PDF', async () => {
    await create();
    service.challan.and.callFake((_id: number, format: string) =>
      of({ blob: new Blob([format === 'html' ? '<p>CHALLAN</p>' : '%PDF'], { type: format === 'html' ? 'text/html' : 'application/pdf' }), fileName: 'Delivery-challan-DC-26-27-0001-Ahmed-Al-Rashid.pdf' }) as any
    );
    button('Preview')!.click();
    await settle();
    expect(service.challan).toHaveBeenCalledWith(1, 'html');
    expect(el().querySelector('app-document-preview')?.textContent).toContain('Delivery challan DC/26-27/0001 · preview');

    const anchor = spyOn(HTMLAnchorElement.prototype, 'click');
    button('Download PDF')!.click();
    // The saved file's address is released ten seconds later: do not wait for that timer.
    await settle(false);
    expect(service.challan).toHaveBeenCalledWith(1, 'pdf', true);
    expect(anchor).toHaveBeenCalled();
  });

  it('says why the challan could not be opened, with "Try again"', async () => {
    await create();
    service.challan.and.returnValue(throwError(() => new Error('Invalid order id')));
    button('Preview')!.click();
    fixture.detectChanges();
    expect(text()).toContain('The challan could not be opened. Invalid order id');
    expect(button('Try again')).toBeDefined();
  });

  it('offers the way back and "Cancel order" in the more menu', async () => {
    await create(ok(rawOrderPage({ stage: 'ready' })));
    spyOn(component.moreMenu!, 'toggle');
    component.openMenu(new MouseEvent('click'));
    expect(component.menuItems.filter((i) => i.label).map((i) => i.label)).toEqual([
      'Move back to Confirmed',
      'Move back to In production',
      'Cancel order',
    ]);
    service.setStage.and.returnValue(ok(rawOrderPage({ stage: 'in_production' })));
    component.menuItems[1].command!({} as any);
    expect(service.setStage).toHaveBeenCalledWith(1, 'in_production');
    expect(undo.offer).not.toHaveBeenCalled();
    expect(toast.showSuccess).toHaveBeenCalledWith('ORD/26-27/0001 is now In production');
  });

  it('cancels with a reason; the api refusal stays in the dialog', async () => {
    await create();
    spyOn(component.moreMenu!, 'toggle');
    component.openMenu(new MouseEvent('click'));
    component.menuItems.find((i) => i.label === 'Cancel order')!.command!({} as any);
    fixture.detectChanges();
    const dialog = fixture.debugElement.query((d) => d.componentInstance instanceof ReasonDialogComponent).componentInstance;
    expect(el().querySelector('app-reason-dialog')?.textContent).toContain('Cancel ORD/26-27/0001?');

    // An order is not cancelled without a reason.
    (el().querySelector('app-reason-dialog form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(service.cancel).not.toHaveBeenCalled();
    expect(el().querySelector('app-reason-dialog [role="alert"]')?.textContent).toContain('Write the reason in a few words.');

    service.cancel.and.returnValue(of({ ok: false as const, message: 'Order has ₹17,728.00 received against it; record a refund before cancelling' }));
    dialog.confirmed.emit('Customer withdrew');
    fixture.detectChanges();
    expect(service.cancel).toHaveBeenCalledWith(1, 'Customer withdrew');
    expect(el().querySelector('app-reason-dialog')?.textContent).toContain('record a refund before cancelling');

    service.cancel.and.returnValue(ok(rawOrderPage({ status: 'cancelled', next_stage: null, cancelled_at: '2026-10-05T10:00:00+00:00', cancel_reason: 'Customer withdrew' })));
    dialog.confirmed.emit('Customer withdrew');
    fixture.detectChanges();
    await settle();
    expect(el().querySelector('app-reason-dialog')).toBeNull();
    expect(text()).toContain('This order was cancelled on 5 Oct 2026. Reason: Customer withdrew.');
    expect(el().querySelector('.btn-primary')).toBeNull();
    expect(el().querySelector('[aria-label="More actions for this order"]')).toBeNull();
    expect((el().querySelector('#promised-date') as HTMLInputElement).disabled).toBeTrue();
  });

  it('asks before closing an order that still owes money, and shows the amount due', async () => {
    await create(ok(rawOrderPage({ stage: 'installed', total: 35456, received: 19000, balance: 16456 })));
    button('Close order')!.click();
    fixture.detectChanges();
    expect(service.setStage).not.toHaveBeenCalled();
    const dialog = el().querySelector('app-confirm-dialog')!;
    expect(dialog.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(dialog.textContent).toContain('Close ORD/26-27/0001 with ₹16,456.00 still to pay?');
    expect(dialog.textContent!.replace(/\s+/g, ' ')).toContain('Still to pay₹16,456.00');

    (Array.from(dialog.querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.textContent!.includes('Keep it open'))!.click();
    fixture.detectChanges();
    expect(el().querySelector('app-confirm-dialog')).toBeNull();
    expect(service.setStage).not.toHaveBeenCalled();

    button('Close order')!.click();
    fixture.detectChanges();
    service.setStage.and.returnValue(ok(rawOrderPage({ stage: 'closed', balance: 16456 })));
    (Array.from(el().querySelectorAll('app-confirm-dialog button')) as HTMLButtonElement[]).find((b) => b.textContent!.includes('Close order'))!.click();
    fixture.detectChanges();
    expect(service.setStage).toHaveBeenCalledWith(1, 'closed');
    expect(el().querySelector('app-confirm-dialog')).toBeNull();
    expect(undo.offer).toHaveBeenCalledTimes(1);
  });

  it('closes a paid order in one tap', async () => {
    await create(ok(rawOrderPage({ stage: 'installed', received: 35456, balance: 0, payment_status: 'paid' })));
    service.setStage.and.returnValue(ok(rawOrderPage({ stage: 'closed', balance: 0 })));
    button('Close order')!.click();
    fixture.detectChanges();
    expect(el().querySelector('app-confirm-dialog')).toBeNull();
    expect(service.setStage).toHaveBeenCalledWith(1, 'closed');
  });

  it('offers only the way back on a closed order, not "Cancel order"', async () => {
    await create(ok(rawOrderPage({ stage: 'closed' })));
    spyOn(component.moreMenu!, 'toggle');
    component.openMenu(new MouseEvent('click'));
    const labels = component.menuItems.filter((i) => i.label).map((i) => i.label);
    expect(labels).toContain('Move back to Installed');
    expect(labels).not.toContain('Cancel order');
  });

  it('refuses a promised date before the order date in plain words, without asking the api', async () => {
    await create();
    type('promised-date', '2026-10-01');
    button('Save date')!.click();
    fixture.detectChanges();
    expect(service.update).not.toHaveBeenCalled();
    expect(text()).toContain('The promised date cannot be before the order date, 4 Oct 2026.');
    expect(text()).not.toContain('promised_date');
  });

  it('says beside Dispatch that the goods leave without a bill', async () => {
    await create(ok(rawOrderPage({ stage: 'ready' })));
    expect(text()).toContain('This order has no bill yet. The goods go out on the delivery challan alone');
  });

  it('says nothing about a bill when the order has one, or is not near dispatch', async () => {
    await create(ok(rawOrderPage({ stage: 'ready', bill: { id: 4, number: 'INV/26-27/0003', bill_date: '2026-10-05', total: 35456 } })));
    expect(text()).not.toContain('This order has no bill yet');
  });

  it('has no primary button on a closed order', async () => {
    await create(ok(rawOrderPage({ stage: 'closed' })));
    expect(el().querySelector('.btn-primary')).toBeNull();
  });

  it('names every button, link and field', async () => {
    await create();
    for (const control of Array.from(el().querySelectorAll('button, a'))) {
      expect((control.getAttribute('aria-label') || control.textContent || '').trim()).not.toBe('');
    }
    for (const control of Array.from(el().querySelectorAll('input, textarea'))) {
      expect(el().querySelector(`label[for="${control.id}"]`)).withContext(control.id).not.toBeNull();
    }
  });
});
