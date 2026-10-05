import { DragDropModule } from '@angular/cdk/drag-drop';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MenuModule } from 'primeng/menu';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import { SharedComponentsModule } from '../../../shared/components/shared-components.module';
import { ToastService } from '../../../shared/services/toast.service';
import { ConfirmDialogComponent } from '../../bills/confirm-dialog.component';
import { QuotationService } from '../quotation.service';
import { sampleQuotation } from './detail/quotation-detail.testing';
import { SubQuotationComponent } from './sub-quotation.component';

@Component({ selector: 'app-summary-dialog', template: '' })
class SummaryStubComponent {
  @Input() visible = false;
  @Input() quotation: any = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<any>();
}

@Component({ selector: 'app-site-address-dialog', template: '' })
class SiteStubComponent {
  @Input() visible = false;
  @Input() quotationId: number | null = null;
  @Input() customerId: number | null = null;
  @Input() addressId: number | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();
}

@Component({ selector: 'app-send-quotation-dialog', template: '' })
class SendStubComponent {
  @Input() visible = false;
  @Input() quotation: any = null;
  @Output() closed = new EventEmitter<void>();
  @Output() sent = new EventEmitter<any>();
}

@Component({ selector: 'app-duplicate-dialog', template: '' })
class DuplicateStubComponent {
  @Input() visible = false;
  @Input() quotation: any = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<any>();
}

@Component({ selector: 'app-quotation-dialog', template: '' })
class EditStubComponent {
  @Input() visible = false;
  @Input() quotation: any = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<any>();
}

describe('SubQuotationComponent (quotation page)', () => {
  let fixture: ComponentFixture<SubQuotationComponent>;
  let component: SubQuotationComponent;
  let service: jasmine.SpyObj<QuotationService>;
  let toast: jasmine.SpyObj<ToastService>;
  let router: Router;
  let query: BehaviorSubject<any>;

  const el = (): HTMLElement => fixture.nativeElement;
  const text = (): string => (el().textContent || '').replace(/\s+/g, ' ');
  const primary = (): HTMLButtonElement | null => el().querySelector('.page-actions .btn-primary');
  const ok = (data: any) => of({ success: true, data, message: '' } as any);

  function create(response: any = ok(sampleQuotation()), queryParams: any = {}): void {
    service.getQuotation.and.returnValue(response);
    query = new BehaviorSubject(convertToParamMap(queryParams));
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { paramMap: of(convertToParamMap({ id: '14' })), queryParamMap: query },
    });
    fixture = TestBed.createComponent(SubQuotationComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture.detectChanges();
  }

  function show(overrides: any): void {
    create(ok(sampleQuotation(overrides)));
  }

  /** Opens a menu and returns its labels; `pick` runs one item. */
  function menu(open: () => void): { labels: string[]; pick: (label: string) => void } {
    open();
    const items = component.menuItems.filter((item) => !item.separator);
    return {
      labels: items.map((item) => item.label as string),
      pick: (label: string) => {
        items.find((item) => item.label === label)!.command!({} as any);
        fixture.detectChanges();
      },
    };
  }

  const pageMenu = () => menu(() => component.openMenu(new Event('click')));
  const lineMenu = (index = 0) => menu(() => component.openLineMenu(new Event('click'), component.view!.lines[index]));

  beforeEach(() => {
    service = jasmine.createSpyObj('QuotationService', [
      'getQuotation',
      'changeQuotationStatus',
      'createBill',
      'getQuotationPdf',
      'getBillPdf',
      'updateQuotationPrices',
      'duplicateLine',
      'renameLine',
      'removeLine',
      'removeQuotation',
      'reviseQuotation',
      'reorderLines',
    ]);
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']);
    TestBed.configureTestingModule({
      declarations: [
        SubQuotationComponent,
        SummaryStubComponent,
        SiteStubComponent,
        SendStubComponent,
        DuplicateStubComponent,
        EditStubComponent,
      ],
      imports: [RouterTestingModule, NoopAnimationsModule, FormsModule, SharedComponentsModule, DialogModule, MenuModule, ButtonModule, ConfirmDialogComponent, DragDropModule],
      providers: [
        { provide: QuotationService, useValue: service },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  /** "Create bill" in the confirm that the page button opens. */
  function confirmBill(): void {
    const yes = Array.from(el().querySelectorAll<HTMLButtonElement>('app-confirm-dialog button')).find((b) => b.textContent!.includes('Create bill'))!;
    yes.click();
    fixture.detectChanges();
  }

  it('shows a skeleton while loading, then the windows', () => {
    const pending = new Subject<any>();
    create(pending);
    expect(el().querySelector('.split')?.getAttribute('aria-busy')).toBe('true');
    expect(el().querySelectorAll('.skeleton').length).toBeGreaterThan(5);

    pending.next({ success: true, data: sampleQuotation() });
    pending.complete();
    fixture.detectChanges();
    expect(el().querySelectorAll('.skeleton').length).toBe(0);
    expect(el().querySelectorAll('.item').length).toBe(2);
    expect(el().querySelector('h1')?.textContent).toContain('Al-Rashid Villa Windows');
    expect(text()).toContain('Q-0003');
  });

  it('shows an inline error with "Try again" when the quotation does not load', () => {
    create(throwError(() => ({ status: 0 })));
    expect(text()).toContain('We could not load this quotation');
    service.getQuotation.and.returnValue(ok(sampleQuotation()));
    (el().querySelector('app-callout button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el().querySelectorAll('.item').length).toBe(2);
    expect(text()).not.toContain('We could not load');
  });

  it('shows each window with its label, specification and selling price', () => {
    create();
    const first = el().querySelector('.item') as HTMLElement;
    expect(first.textContent).toContain('Master bedroom');
    expect(first.textContent).toContain('Casement window · 1800 × 1200 mm · 5mm plain glass');
    expect(first.textContent).toContain('₹8,851.86');
    expect(first.textContent).toContain('₹380.72 / sq ft');
    expect(first.querySelector('img')?.getAttribute('alt')).toContain('Master bedroom');
    // A line saved without an image gets a drawn thumbnail.
    expect(el().querySelectorAll('.item')[1].querySelector('app-window-thumb')).not.toBeNull();
    expect(text()).toContain('2 items · 42.6 sq ft');
  });

  it('shows the total the API returned, with its tax lines, in the Summary card', () => {
    create();
    const summary = el().querySelector('[aria-labelledby="h-total"]') as HTMLElement;
    const flat = (summary.textContent || '').replace(/\s+/g, ' ');
    expect(flat).toContain('Subtotal₹17,567.81');
    expect(flat).toContain('CGST 9%₹1,581.10');
    expect(flat).toContain('SGST 9%₹1,581.10');
    expect(flat).toContain('Total₹20,730.00');
    expect(flat).toContain('Retail margin 20% · 50% Advance, 50% on Delivery');
    expect(flat).toContain('Valid until 3 Nov 2026');
  });

  function stateNote(sellerState: string | null): HTMLElement {
    const raw = sampleQuotation();
    raw.totals.tax.place_of_supply_assumed = true;
    raw.totals.tax.seller_state_code = sellerState;
    create(ok(raw));
    return el().querySelector('[data-q="state-missing"]') as HTMLElement;
  }

  it('sends the user to Settings when the company state is the one missing (M5)', () => {
    const note = stateNote(null);
    expect(note.textContent).toContain('Your company’s state is not set');
    expect(note.querySelector('a')?.getAttribute('href')).toBe('/profile?tab=company');
  });

  it('sends the user to the customer when only the customer state is missing (M5)', () => {
    const note = stateNote('24');
    expect(note.textContent).toContain('The customer’s state is not set');
    expect(note.querySelector('a')?.getAttribute('href')).toContain('/customers/edit/');
  });

  it('has one primary button, and it follows the status', () => {
    show({ status: 'draft' });
    expect(el().querySelectorAll('.btn-primary').length).toBe(1);
    expect(primary()?.textContent).toContain('Send quotation');
  });

  for (const [status, label] of [
    ['sent', 'Mark as accepted'],
    ['expired', 'Mark as accepted'],
    ['accepted', 'Create order'],
    ['declined', 'Revise quotation'],
  ]) {
    it(`offers "${label}" on a ${status} quotation`, () => {
      show({ status, sent_at: '2026-09-28T10:00:00.000000Z' });
      expect(el().querySelectorAll('.btn-primary').length).toBe(1);
      expect(primary()?.textContent).toContain(label);
    });
  }

  it('gives a draft with no windows one button: "Add a window"', () => {
    show({ quatation_product: [], totals: { ...sampleQuotation().totals, items: [], item_count: 0 } });
    expect(text()).toContain('No windows yet');
    const buttons = el().querySelectorAll('.btn-primary');
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain('Add a window');
    expect(primary()).toBeNull();
    (buttons[0] as HTMLButtonElement).click();
    expect(router.navigate).toHaveBeenCalledWith(['/quotation/detail', 14, 'add', 1]);
  });

  it('opens the send preview from "Send quotation", with no margin or tax question', () => {
    create();
    primary()!.click();
    fixture.detectChanges();
    expect(component.sendOpen).toBeTrue();
    expect(service.changeQuotationStatus).not.toHaveBeenCalled();
  });

  it('marks a sent quotation as accepted in one click', () => {
    show({ status: 'sent' });
    service.changeQuotationStatus.and.returnValue(ok({}));
    service.getQuotation.and.returnValue(ok(sampleQuotation({ status: 'accepted' })));
    primary()!.click();
    fixture.detectChanges();
    expect(service.changeQuotationStatus).toHaveBeenCalledWith(14, 'accepted');
    // The next step after acceptance is the order (card O2); the bill is beside it.
    expect(primary()?.textContent).toContain('Create order');
    expect(el().querySelector('.page-actions [data-action="bill"]')?.textContent).toContain('Create bill');
  });

  it('asks before it issues a bill, with the quotation number and the total', () => {
    show({ status: 'accepted' });
    el().querySelector<HTMLButtonElement>('.page-actions [data-action="bill"]')!.click();
    fixture.detectChanges();
    expect(service.createBill).not.toHaveBeenCalled();
    const dialog = el().querySelector('app-confirm-dialog')!;
    expect(dialog.textContent).toContain('Create the bill for ' + component.view!.number + '?');
    expect(dialog.textContent).toContain('tax invoice');
    expect(dialog.querySelector('dd.total')?.textContent).toContain('₹');
    Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent!.includes('Not now'))!.click();
    fixture.detectChanges();
    expect(el().querySelector('app-confirm-dialog')).toBeNull();
    expect(service.createBill).not.toHaveBeenCalled();
  });

  it('creates the bill after the confirm and links to it', () => {
    show({ status: 'accepted' });
    const bill = { id: 3, number: 'INV/26-27/0002', bill_date: '2026-10-04', total: 20730 };
    service.createBill.and.returnValue(ok(bill));
    service.getQuotation.and.returnValue(ok(sampleQuotation({ status: 'billed', bill })));
    const createBill = el().querySelector<HTMLButtonElement>('.page-actions [data-action="bill"]')!;
    expect(createBill.classList).toContain('btn-secondary');
    createBill.click();
    fixture.detectChanges();
    confirmBill();
    expect(service.createBill).toHaveBeenCalledWith(14);
    expect(el().querySelector('app-confirm-dialog')).toBeNull();
    expect(toast.showSuccess).toHaveBeenCalledWith('Bill INV/26-27/0002 created');
    expect(text()).toContain('Billed as INV/26-27/0002 on 4 Oct 2026 for ₹20,730.00');
    expect(primary()?.textContent).toContain('Download bill');
    expect(el().querySelector('.add-row')).toBeNull();
  });

  it('says what the company settings lack before the bill is created, with a link to Settings (M3)', () => {
    show({
      status: 'accepted',
      bill_warnings: [
        { code: 'seller_gstin_missing', message: 'Your company\'s GSTIN is not set. The bill is headed "Invoice".', settings_field: 'gstin', line_ids: [] },
        { code: 'hsn_missing', message: '2 windows have no HSN code, and no default HSN code is set.', settings_field: 'default_hsn_code', line_ids: [19, 20] },
      ],
    });
    el().querySelector<HTMLButtonElement>('.page-actions [data-action="bill"]')!.click();
    fixture.detectChanges();
    const dialog = el().querySelector('app-confirm-dialog') as HTMLElement;
    const note = dialog.querySelector('[data-q="bill-warnings"]') as HTMLElement;
    expect(note.textContent).toContain('Your company\'s GSTIN is not set.');
    expect(note.textContent).toContain('2 windows have no HSN code');
    const links = Array.from(note.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/profile?tab=company', '/profile?tab=pricing']);
    // Without the GSTIN the API heads the bill "Invoice".
    expect(dialog.textContent).toContain('This issues an invoice');
    // The bill can still be created: the API does not refuse it.
    expect(service.createBill).not.toHaveBeenCalled();
    service.createBill.and.returnValue(ok({ id: 3, number: 'INV/26-27/0002' }));
    confirmBill();
    expect(service.createBill).toHaveBeenCalledWith(14);
  });

  it('has no warning in the confirm when nothing is missing', () => {
    show({ status: 'accepted' });
    el().querySelector<HTMLButtonElement>('.page-actions [data-action="bill"]')!.click();
    fixture.detectChanges();
    expect(el().querySelector('app-confirm-dialog [data-q="bill-warnings"]')).toBeNull();
    expect(el().querySelector('app-confirm-dialog')?.textContent).toContain('This issues a tax invoice');
  });

  describe('site address (T90)', () => {
    const site = (): SiteStubComponent => fixture.debugElement.query(By.directive(SiteStubComponent)).componentInstance;

    it('shows the address as "City - PIN" and lets a draft change it; the page loads again for the new tax split', () => {
      const raw = sampleQuotation();
      raw.customer_address = JSON.stringify({ id: 5, address: 'Villa 14, Palm Street', city: 'Godhra', state: 'Gujarat', pincode: '389001', zip_code: '389001' });
      create(ok(raw));
      expect(el().querySelector('[data-q="site-address"]')?.textContent).toContain('Villa 14, Palm Street, Godhra - 389001, Gujarat');

      const change = el().querySelector('[data-q="change-site"]') as HTMLButtonElement;
      expect(change.textContent).toContain('Change');
      change.click();
      fixture.detectChanges();
      expect(site().visible).toBeTrue();
      expect(site().quotationId).toBe(14);
      expect(site().customerId).toBe(2);
      expect(site().addressId).toBe(5);

      service.getQuotation.calls.reset();
      site().saved.emit();
      fixture.detectChanges();
      expect(site().visible).toBeFalse();
      expect(service.getQuotation).toHaveBeenCalledTimes(1);
      expect(toast.showSuccess).toHaveBeenCalledWith('Site address changed');
    });

    it('offers to add one when the quotation has none', () => {
      const raw = sampleQuotation();
      raw.customer_address = null;
      create(ok(raw));
      expect(el().querySelector('[data-q="site-address"]')?.textContent).toContain('No site address yet.');
      expect(el().querySelector('[data-q="change-site"]')?.textContent).toContain('Add');
    });

    it('does not offer the change once the quotation is sent', () => {
      const raw = sampleQuotation();
      raw.status = 'sent';
      create(ok(raw));
      expect(el().querySelector('[data-q="site-address"]')).not.toBeNull();
      expect(el().querySelector('[data-q="change-site"]')).toBeNull();
    });
  });

  it('says which state decides the tax and why, and what the site address would give (M2)', () => {
    const raw = sampleQuotation();
    Object.assign(raw.totals.tax, {
      place_of_supply: '24',
      place_of_supply_name: 'Gujarat',
      place_of_supply_source: 'legacy',
      place_of_supply_reason: 'Kept as it was before the place of supply could be chosen.',
      place_of_supply_default: { code: '27', name: 'Maharashtra', source: 'site_address', reason: 'The state of the site address.' },
      missing_state: null,
    });
    create(ok(raw));
    const line = (el().querySelector('[data-q="place-of-supply"]')?.textContent || '').replace(/\s+/g, ' ');
    expect(line).toContain('Place of supply: Gujarat. Kept as it was before the place of supply could be chosen.');
    expect(line).toContain('The rule now gives Maharashtra: choose “Automatic” under “Change”.');
  });

  it('makes "Create order" the one primary button of an accepted quotation, with "Create bill" beside it', () => {
    show({ status: 'accepted' });
    expect(el().querySelectorAll('.btn-primary').length).toBe(1);
    const order = el().querySelector<HTMLAnchorElement>('.page-actions [data-action="order"]')!;
    expect(order.textContent).toContain('Create order');
    expect(order.classList).toContain('btn-primary');
    expect(order.getAttribute('href')).toBe('/orders/new?quotation=14');
    expect(el().querySelector('.page-actions [data-action="bill"]')?.textContent).toContain('Create bill');
  });

  it('says "Open order" and opens it once the quotation has an order', () => {
    show({ status: 'accepted', order: { id: 7, number: 'ORD/26-27/0007', stage: 'confirmed', status: 'active' } });
    const order = el().querySelector<HTMLAnchorElement>('.page-actions [data-action="order"]')!;
    expect(order.textContent).toContain('Open order');
    expect(order.getAttribute('href')).toBe('/orders/7');
  });

  it('offers the order on a billed quotation as a secondary action; "Download bill" stays primary', () => {
    show({ status: 'billed', bill: { id: 3, number: 'INV/26-27/0002', bill_date: '2026-10-04', total: 20730 } });
    expect(el().querySelectorAll('.btn-primary').length).toBe(1);
    expect(primary()?.textContent).toContain('Download bill');
    const order = el().querySelector('.page-actions [data-action="order"]')!;
    expect(order.textContent).toContain('Create order');
    expect(order.classList).toContain('btn-secondary');
  });

  it('has no order action before the quotation is accepted', () => {
    show({ status: 'sent', sent_at: '2026-09-28T10:00:00.000000Z' });
    expect(el().querySelector('[data-action="order"]')).toBeNull();
  });

  it('shows a refusal from the API inline, not as a silent failure', () => {
    show({ status: 'accepted' });
    service.createBill.and.returnValue(of({ status: 0, message: 'Quatation has no items to bill' } as any));
    el().querySelector<HTMLButtonElement>('.page-actions [data-action="bill"]')!.click();
    fixture.detectChanges();
    confirmBill();
    expect(el().querySelector('app-callout .danger')?.textContent).toContain('Quatation has no items to bill');
  });

  it('opens a window of a draft in the designer', () => {
    create();
    const link = el().querySelector('.item a.name') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/quotation/detail/14/edit/19/1');
  });

  it('asks for a revision before a sent quotation is changed, then opens the same window in it', () => {
    show({ status: 'sent', sent_at: '2026-09-28T10:00:00.000000Z' });
    expect(el().querySelector('.item a.name')).toBeNull();
    (el().querySelector('.item button.name') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.reviseIntent).toEqual({ kind: 'edit', position: 1 });
    expect(service.reviseQuotation).not.toHaveBeenCalled();

    service.reviseQuotation.and.returnValue(
      ok({ id: 31, number: 'Q-0003 R1', totals: { items: [{ id: 40 }, { id: 41 }] } })
    );
    component.confirmRevise();
    expect(service.reviseQuotation).toHaveBeenCalledWith(14);
    expect(router.navigate).toHaveBeenCalledWith(['/quotation/detail', 31, 'edit', 40, 1]);
  });

  it('asks for a revision before the summary of a sent quotation is changed', () => {
    show({ status: 'sent' });
    (el().querySelector('.terms .link') as HTMLButtonElement).click();
    expect(component.summaryOpen).toBeFalse();
    expect(component.reviseIntent).toEqual({ kind: 'summary' });
  });

  it('opens the summary dialog on a draft from "Change"', () => {
    create();
    (el().querySelector('.terms .link') as HTMLButtonElement).click();
    expect(component.summaryOpen).toBeTrue();
  });

  it('offers Duplicate for the quotation and for each window', () => {
    create();
    expect(pageMenu().labels).toEqual(['Edit details', 'Duplicate', 'Production', 'Update prices', 'Delete']);
    const line = lineMenu(0);
    expect(line.labels).toEqual(['Edit', 'Rename', 'Duplicate', 'Move down', 'Delete']);
    service.duplicateLine.and.returnValue(ok({ id: 50 }));
    line.pick('Duplicate');
    expect(service.duplicateLine).toHaveBeenCalledWith(19);
    expect(service.getQuotation).toHaveBeenCalledTimes(2);
  });

  describe('order of the windows (M8)', () => {
    const names = (): string[] => Array.from(el().querySelectorAll('.item .name')).map((n) => n.textContent!.trim());

    it('offers "Move down" on the first window and "Move up" on the last, and sends the whole order', () => {
      create();
      expect(lineMenu(1).labels).toEqual(['Edit', 'Name this window', 'Duplicate', 'Move up', 'Delete']);
      service.reorderLines.and.returnValue(ok({ quatation_id: 14, order: [20, 19] }));
      lineMenu(0).pick('Move down');
      expect(service.reorderLines).toHaveBeenCalledOnceWith(14, [20, 19]);
      // The page is read again: the order is the API's.
      expect(service.getQuotation).toHaveBeenCalledTimes(2);
      expect(el().querySelector('[role="status"].sr-only')?.textContent).toContain('Master bedroom is now 2 of 2');
    });

    it('moves the row dropped with the drag handle', () => {
      create();
      expect(el().querySelectorAll('.item .grip').length).toBe(2);
      service.reorderLines.and.returnValue(new Subject<any>());
      component.onLineDrop({ previousIndex: 1, currentIndex: 0 } as any);
      fixture.detectChanges();
      expect(service.reorderLines).toHaveBeenCalledOnceWith(14, [20, 19]);
      // The rows move at once, before the API answers.
      expect(names()[1]).toBe('Master bedroom');
    });

    it('puts the rows back and says why when the API refuses', () => {
      create();
      const before = names();
      service.reorderLines.and.returnValue(of({ status: 0, message: 'order must list every window of the quotation exactly once' } as any));
      lineMenu(0).pick('Move down');
      expect(names()).toEqual(before);
      expect(text()).toContain('order must list every window of the quotation exactly once');
      expect(service.getQuotation).toHaveBeenCalledTimes(1);
    });

    it('offers no move and no handle on a quotation that was sent, or with one window', () => {
      show({ status: 'sent' });
      expect(lineMenu(0).labels).toEqual(['Edit']);
      expect(el().querySelector('.item .grip')).toBeNull();
    });
  });

  it('offers what fits a sent quotation in the more menu', () => {
    show({ status: 'sent' });
    expect(pageMenu().labels).toEqual(['Edit details', 'Duplicate', 'Production', 'Revise (R1)', 'Send again', 'Mark as declined', 'Delete']);
  });

  it('keeps a billed quotation read only', () => {
    show({ status: 'billed', bill: { id: 3, number: 'INV/26-27/0002', bill_date: '2026-10-04', total: 20730 } });
    expect(pageMenu().labels).toEqual(['Duplicate', 'Production']);
    expect(el().querySelector('.item .btn-icon')).toBeNull();
    expect(el().querySelector('.terms .link')).toBeNull();
  });

  it('shows the price banner when the API says prices have changed, and updates them', () => {
    show({ prices_changed: true });
    expect(text()).toContain('Prices have changed since this quotation was priced');
    service.updateQuotationPrices.and.returnValue(ok({}));
    const repriced = sampleQuotation();
    repriced.totals.total = 21500;
    service.getQuotation.and.returnValue(ok(repriced));
    (el().querySelector('app-callout .warn button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(service.updateQuotationPrices).toHaveBeenCalledWith(14);
    expect(toast.showSuccess).toHaveBeenCalledWith('Prices updated. The total went from ₹20,730.00 to ₹21,500.00.');
    expect(text()).toContain('₹21,500.00');
  });

  it('says so on a copy whose prices differ from the original', () => {
    create(ok(sampleQuotation()), { repriced: '1' });
    expect(text()).toContain('Prices have changed since the original');
  });

  it('opens the copy after "Duplicate"', () => {
    create();
    component.onDuplicated({ id: 40, number: 'Q-0010', pricesChanged: true });
    expect(router.navigate).toHaveBeenCalledWith(['/quotation/detail', 40], { queryParams: { repriced: 1 } });
  });

  it('links to Production for a quotation with windows, as a secondary action', () => {
    create();
    pageMenu().pick('Production');
    expect(router.navigate).toHaveBeenCalledWith(['/production', 14]);
  });

  it('has no Production link while there is no window', () => {
    show({ quatation_product: [], totals: { ...sampleQuotation().totals, items: [], item_count: 0 } });
    expect(pageMenu().labels).not.toContain('Production');
  });

  it('marks an earlier version as read only and points to the current one', () => {
    show({
      status: 'sent',
      superseded_by_id: 31,
      revisions: [
        { id: 14, number: 'Q-0003', status: 'sent', is_current: false },
        { id: 31, number: 'Q-0003 R1', status: 'draft', is_current: true },
      ],
    });
    expect(text()).toContain('This is an earlier version');
    expect(primary()?.textContent).toContain('Open current version');
    primary()!.click();
    expect(router.navigate).toHaveBeenCalledWith(['/quotation/detail', 31]);
    expect(el().querySelector('[aria-labelledby="h-versions"]')?.textContent).toContain('Q-0003 R1');
  });

  it('confirms before a window is deleted', () => {
    create();
    lineMenu(1).pick('Delete');
    expect(service.removeLine).not.toHaveBeenCalled();
    expect(component.lineToDelete?.id).toBe(20);
    service.removeLine.and.returnValue(ok({}));
    component.confirmDeleteLine();
    expect(service.removeLine).toHaveBeenCalledWith(20);
  });

  it('names a window', () => {
    create();
    lineMenu(1).pick('Name this window');
    component.renameValue = ' Kitchen ';
    service.renameLine.and.returnValue(ok({}));
    component.saveRename();
    expect(service.renameLine).toHaveBeenCalledWith(20, 'Kitchen');
  });

  it('gives every button an accessible name', () => {
    create();
    const unnamed = Array.from(el().querySelectorAll('button')).filter(
      (button) => !(button.textContent || '').trim() && !button.getAttribute('aria-label')
    );
    expect(unnamed.length).toBe(0);
  });
});
