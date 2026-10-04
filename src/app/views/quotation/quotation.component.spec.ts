import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { DialogModule } from 'primeng/dialog';
import { MenuModule } from 'primeng/menu';
import { ButtonModule } from 'primeng/button';
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { ToastService } from '../../shared/services/toast.service';
import { PAGE_SIZE, QuotationComponent, SEARCH_DELAY_MS } from './quotation.component';
import { QuotationRow, readStatus, toQuotationRow } from './quotation-list.model';
import { QuotationListQuery, QuotationListService, QuotationPage } from './quotation-list.service';
import { QuotationService } from './quotation.service';

@Component({ selector: 'app-quotation-dialog', template: '' })
class DialogStubComponent {
  @Input() visible = false;
  @Input() quotation: QuotationRow | null = null;
  @Input() customerId: number | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<number>();
}

@Component({ selector: 'app-duplicate-quotation-dialog', template: '' })
class DuplicateStubComponent {
  @Input() visible = false;
  @Input() quotation: QuotationRow | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<number>();
}

const ROWS = [
  { id: 14, quatation_identity: '6ac2034603094', quatation_name: 'Al-Rashid Villa Windows', name: 'Ahmed Al-Rashid', phone: '9812345670', customer_id: 2, is_convert_bill: 0, grand_total: 25039.21, total: 29546, item_count: 3 },
  { id: 15, quatation_identity: '6ac2034603095', quatation_name: 'Sharma Flat Renovation', name: 'Sharma Residency', phone: '9823456781', customer_id: 3, is_convert_bill: 0, grand_total: 14159.58, total: 16708, item_count: 1 },
  { id: 17, quatation_identity: '6ac2034603097', quatation_name: 'Sharma Flat Renovation (Copy)', name: 'Sharma Residency', phone: '9823456781', customer_id: 3, is_convert_bill: 1, grand_total: 14159.58, total: 16708, item_count: 1 },
];

/** Answers one page the way `quatation/list` does: status and search first, newest (highest id) first, then the page. */
function serve(data: any[], query: QuotationListQuery): QuotationPage {
  const needle = query.search.trim().toLowerCase();
  const matching = data
    .filter((raw) => query.status === 'all' || readStatus(raw) === query.status)
    .filter((raw) => !needle || [raw.quatation_name, raw.name, raw.number].some((v) => (v || '').toLowerCase().includes(needle)))
    .sort((a, b) => b.id - a.id);
  const start = (query.page - 1) * query.perPage;
  return {
    rows: matching.slice(start, start + query.perPage).map(toQuotationRow),
    total: matching.length,
    lastPage: Math.max(1, Math.ceil(matching.length / query.perPage)),
  };
}

function countsOf(data: any[]): Record<string, number> {
  const counts: Record<string, number> = { all: data.length, draft: 0, sent: 0, accepted: 0, declined: 0, expired: 0, billed: 0 };
  data.forEach((raw) => counts[readStatus(raw)]++);
  return counts;
}

describe('QuotationComponent (list)', () => {
  let fixture: ComponentFixture<QuotationComponent>;
  let component: QuotationComponent;
  let service: jasmine.SpyObj<QuotationService>;
  let list: jasmine.SpyObj<QuotationListService>;
  /** What the stubbed API holds. */
  let data: any[];
  let toast: jasmine.SpyObj<ToastService>;
  let router: Router;
  let query: BehaviorSubject<any>;

  const el = (): HTMLElement => fixture.nativeElement;
  const text = (): string => (el().textContent || '').replace(/\s+/g, ' ');

  /** `source` is the rows the API holds, or an observable to answer the first request with. */
  function create(source: any[] | Observable<QuotationPage> = ROWS, params: any = {}): void {
    data = Array.isArray(source) ? source : ROWS;
    list.page.and.callFake((query) => of(serve(data, query)));
    list.counts.and.callFake(() => of(countsOf(data)));
    if (!Array.isArray(source)) {
      list.page.and.returnValue(source);
    }
    query = new BehaviorSubject(convertToParamMap(params));
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { queryParamMap: query, snapshot: { get queryParamMap() { return query.value; } } },
    });
    fixture = TestBed.createComponent(QuotationComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = jasmine.createSpyObj('QuotationService', ['deleteQuotation', 'getQuotation']);
    list = jasmine.createSpyObj('QuotationListService', ['page', 'counts']);
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']);
    TestBed.configureTestingModule({
      declarations: [QuotationComponent, DialogStubComponent, DuplicateStubComponent],
      imports: [RouterTestingModule, NoopAnimationsModule, FormsModule, SharedComponentsModule, DialogModule, MenuModule, ButtonModule],
      providers: [
        { provide: QuotationService, useValue: service },
        { provide: QuotationListService, useValue: list },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  it('shows skeleton rows while loading, then one row per quotation', () => {
    const pending = new Subject<QuotationPage>();
    create(pending);
    expect(el().querySelectorAll('.q-skeleton').length).toBe(6);
    expect(el().querySelector('section.card')?.getAttribute('aria-busy')).toBe('true');

    pending.next(serve(ROWS, { status: 'all', search: '', page: 1, perPage: PAGE_SIZE }));
    pending.complete();
    fixture.detectChanges();
    expect(el().querySelectorAll('.q-skeleton').length).toBe(0);
    expect(el().querySelectorAll('.q-row').length).toBe(3);
    expect(text()).toContain('3 quotations');
  });

  it('shows the number and the customer-facing total in rupees, never the hash', () => {
    create();
    const first = el().querySelector('.q-row') as HTMLElement;
    expect(first.textContent).toContain('Sharma Flat Renovation (Copy)');
    expect(first.textContent).toContain('No. 17');
    expect(first.textContent).toContain('₹16,708.00');
    expect(text()).not.toContain('6ac2034603094');
    expect(text()).toContain('₹29,546.00');
  });

  it('has exactly one primary button, with an accessible name on every button and input', () => {
    create();
    expect(el().querySelectorAll('.btn-primary').length).toBe(1);
    expect(el().querySelector('.btn-primary')?.textContent).toContain('New quotation');
    el().querySelectorAll('button, input').forEach((node) => {
      const name = node.getAttribute('aria-label') || (node.textContent || '').trim();
      expect(name).withContext(node.outerHTML).not.toBe('');
    });
    expect(el().querySelector('.row-actions button')?.getAttribute('aria-label')).toBe(
      'More actions for Sharma Flat Renovation (Copy)'
    );
  });

  it('marks billed quotations, and leaves the tabs out when the counts cannot be read', () => {
    create();
    const badges = Array.from(el().querySelectorAll('.q-row .badge')).map((b) => (b.textContent || '').trim());
    expect(badges).toEqual(['Billed', 'Draft', 'Draft']);
    expect(el().querySelector('.tabs')).not.toBeNull();

    list.counts.and.returnValue(throwError(() => new Error('down')));
    component.load();
    fixture.detectChanges();
    expect(el().querySelector('.tabs')).toBeNull();
    expect(el().querySelectorAll('.q-row').length).toBe(3);
  });

  it('shows tabs with the counts of the API, and asks the API for the tab that is opened', () => {
    create(ROWS.map((row, i) => ({ ...row, number: `Q-00${row.id}`, status: ['sent', 'draft', 'billed'][i] })));
    const tabs = Array.from(el().querySelectorAll('.tab')) as HTMLElement[];
    expect(tabs.map((t) => (t.textContent || '').replace(/\s+/g, ''))).toEqual(['All3', 'Draft1', 'Sent1', 'Accepted0', 'Billed1']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');

    tabs[2].click();
    fixture.detectChanges();
    expect(list.page.calls.mostRecent().args[0]).toEqual({ status: 'sent', search: '', page: 1, perPage: PAGE_SIZE });
    expect(el().querySelectorAll('.q-row').length).toBe(1);
    expect(text()).toContain('Q-0014');
    expect(text()).toContain('1 quotation');
  });

  it('asks the API to search once the typing pauses, and offers a way back when nothing matches', fakeAsync(() => {
    create();
    const calls = list.page.calls.count();
    component.search = 'al-r';
    component.onSearch();
    component.search = 'al-rashid';
    component.onSearch();
    expect(list.page.calls.count()).toBe(calls); // still typing
    tick(SEARCH_DELAY_MS);
    fixture.detectChanges();
    expect(list.page.calls.count()).toBe(calls + 1);
    expect(list.page.calls.mostRecent().args[0].search).toBe('al-rashid');
    expect(el().querySelectorAll('.q-row').length).toBe(1);

    component.search = 'nothing like this';
    component.onSearch();
    tick(SEARCH_DELAY_MS);
    fixture.detectChanges();
    expect(el().querySelectorAll('.q-row').length).toBe(0);
    expect(text()).toContain('No quotations match “nothing like this”.');
    expect(el().querySelector('.empty')).toBeNull(); // the company still has quotations
    (el().querySelector('.q-none button') as HTMLElement).click();
    fixture.detectChanges();
    expect(el().querySelectorAll('.q-row').length).toBe(3);
  }));

  it('shows the "Updated" column once rows carry a date', () => {
    create();
    expect(text()).not.toContain('Updated');
    data = ROWS.map((row) => ({ ...row, updated_at: new Date().toISOString() }));
    component.load();
    fixture.detectChanges();
    expect(Array.from(el().querySelectorAll('th')).map((th) => (th.textContent || '').trim())).toContain('Updated');
    expect(el().querySelector('.q-row')?.textContent).toContain('Today');
  });

  it('shows an empty state with the one primary button when there is no quotation', () => {
    create([]);
    expect(text()).toContain('No quotations yet');
    expect(el().querySelector('table')).toBeNull();
    expect(el().querySelectorAll('.btn-primary').length).toBe(1);
    (el().querySelector('.empty .btn-primary') as HTMLElement).click();
    expect(component.dialogOpen).toBeTrue();
  });

  it('shows an inline error with "Try again" that reloads', () => {
    create(throwError(() => ({ status: 0 })));
    expect(text()).toContain('We could not load your quotations.');
    expect(el().querySelector('table')).toBeNull();

    list.page.and.callFake((query) => of(serve(ROWS, query)));
    (el().querySelector('app-callout button') as HTMLElement).click();
    fixture.detectChanges();
    expect(el().querySelectorAll('.q-row').length).toBe(3);
    expect(text()).not.toContain('We could not load');
  });

  it('opens a quotation from its row, but not from the row menu button', () => {
    create();
    (el().querySelector('.q-row td:nth-child(4)') as HTMLElement).click();
    expect(router.navigate).toHaveBeenCalledWith(['/quotation/detail', 17]);

    (router.navigate as jasmine.Spy).calls.reset();
    (el().querySelector('.row-actions button') as HTMLElement).click();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('offers open, edit, duplicate and delete; a billed quotation cannot be renamed or deleted', () => {
    create();
    const visible = () => component.menuItems.filter((i) => i.visible !== false && !i.separator).map((i) => i.label);
    component.openMenu(new Event('click'), component.rows[1]);
    expect(visible()).toEqual(['Open', 'Edit details', 'Duplicate', 'Delete']);
    component.openMenu(new Event('click'), component.rows[0]);
    expect(visible()).toEqual(['Open', 'Duplicate']);
  });

  it('opens the new-quotation dialog from the button', () => {
    create();
    expect(component.dialogOpen).toBeFalse();
    (el().querySelector('.btn-primary') as HTMLElement).click();
    expect(component.dialogOpen).toBeTrue();
    expect(component.editRow).toBeNull();
  });

  it('opens the new-quotation dialog from ?new=1 and tidies the address when it closes', () => {
    create(ROWS, { new: '1' });
    expect(component.dialogOpen).toBeTrue();
    component.closeDialog();
    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({ queryParams: {}, replaceUrl: true }));
  });

  it('opens the dialog for the quotation named by ?edit=, once the list has loaded', () => {
    const pending = new Subject<QuotationPage>();
    create(pending, { edit: '15' });
    expect(component.dialogOpen).toBeFalse();
    pending.next(serve(ROWS, { status: 'all', search: '', page: 1, perPage: PAGE_SIZE }));
    pending.complete();
    expect(component.dialogOpen).toBeTrue();
    expect(component.editRow?.id).toBe(15);
  });

  it('fetches the quotation named by ?edit= when it is not on the page that is showing', () => {
    service.getQuotation.and.returnValue(of({ success: true, message: '', data: { id: 99, quatation_name: 'Old one', customer_id: 2 } }));
    create(ROWS, { edit: '99' });
    expect(service.getQuotation).toHaveBeenCalledOnceWith(99);
    expect(component.dialogOpen).toBeTrue();
    expect(component.editRow?.name).toBe('Old one');
  });

  it('opens the new-quotation dialog for the customer named by ?new=1&customer=', () => {
    create(ROWS, { new: '1', customer: '3' });
    expect(component.dialogOpen).toBeTrue();
    expect(component.newForCustomer).toBe(3);
  });

  it('opens the copy the API made and says when its prices differ', () => {
    create();
    component.duplicateRow = component.rows[0];
    component.onDuplicated({ id: 40, pricesChanged: true });
    expect(component.duplicateRow).toBeNull();
    expect(toast.showSuccess).toHaveBeenCalledWith('Quotation duplicated. Prices have changed since the original.');
    expect(router.navigate).toHaveBeenCalledWith(['/quotation/detail', 40]);
  });

  it('goes to the quotation page after a save', () => {
    create();
    component.openNew();
    component.onSaved(31);
    expect(component.dialogOpen).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/quotation/detail', 31]);
  });

  it('deletes after a confirmation that names the quotation and its amount', () => {
    create();
    service.deleteQuotation.and.returnValue(of({ success: true, message: 'Deleted', data: [] }));
    component.deleteRow = component.rows[1];
    fixture.detectChanges();
    const dialog = document.querySelector('.p-dialog') as HTMLElement;
    const message = (dialog.textContent || '').replace(/\s+/g, ' ');
    expect(message).toContain('Delete this quotation?');
    expect(message).toContain('“Sharma Flat Renovation” (No. 15) and its window, worth ₹16,708.00, will be deleted.');
    expect(message).toContain('Keep it');

    data = ROWS.filter((row) => row.id !== 15); // what the API holds after the delete
    component.confirmDelete();
    fixture.detectChanges();
    expect(service.deleteQuotation).toHaveBeenCalledWith(15);
    expect(component.rows.map((r) => r.id)).toEqual([17, 14]);
    expect((el().querySelector('.tab .count')?.textContent || '').trim()).toBe('2');
    expect(component.deleteRow).toBeNull();
    expect(toast.showSuccess).toHaveBeenCalled();
  });

  it('asks the API for one page at a time', () => {
    const many = Array.from({ length: PAGE_SIZE * 2 + 3 }, (_, i) => ({ ...ROWS[0], id: i + 1, quatation_name: `Q ${i + 1}` }));
    create(many);
    expect(list.page.calls.mostRecent().args[0]).toEqual({ status: 'all', search: '', page: 1, perPage: PAGE_SIZE });
    expect(el().querySelectorAll('.q-row').length).toBe(PAGE_SIZE);
    expect(text()).toContain(`1–${PAGE_SIZE} of ${many.length} quotations`);
    component.next();
    component.next();
    component.next(); // already on the last page: nothing more is asked
    fixture.detectChanges();
    expect(list.page.calls.mostRecent().args[0].page).toBe(3);
    expect(list.page.calls.count()).toBe(3);
    expect(el().querySelectorAll('.q-row').length).toBe(3);
    expect(text()).toContain(`${PAGE_SIZE * 2 + 1}–${many.length} of ${many.length} quotations`);
    const buttons = Array.from(el().querySelectorAll('.table-foot button')) as HTMLButtonElement[];
    expect(buttons[1].disabled).toBeTrue();
    expect(buttons[0].disabled).toBeFalse();
  });
});
