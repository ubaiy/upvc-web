import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { DialogModule } from 'primeng/dialog';
import { MenuModule } from 'primeng/menu';
import { ButtonModule } from 'primeng/button';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { ToastService } from '../../shared/services/toast.service';
import { PAGE_SIZE, QuotationComponent } from './quotation.component';
import { QuotationRow } from './quotation-list.model';
import { QuotationService } from './quotation.service';

@Component({ selector: 'app-quotation-dialog', template: '' })
class DialogStubComponent {
  @Input() visible = false;
  @Input() quotation: QuotationRow | null = null;
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

describe('QuotationComponent (list)', () => {
  let fixture: ComponentFixture<QuotationComponent>;
  let component: QuotationComponent;
  let service: jasmine.SpyObj<QuotationService>;
  let toast: jasmine.SpyObj<ToastService>;
  let router: Router;
  let query: BehaviorSubject<any>;

  const el = (): HTMLElement => fixture.nativeElement;
  const text = (): string => (el().textContent || '').replace(/\s+/g, ' ');

  function create(response: any = of({ success: true, data: ROWS }), params: any = {}): void {
    service.getAllQuotations.and.returnValue(response);
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
    service = jasmine.createSpyObj('QuotationService', ['getAllQuotations', 'deleteQuotation']);
    toast = jasmine.createSpyObj('ToastService', ['showSuccess', 'showError']);
    TestBed.configureTestingModule({
      declarations: [QuotationComponent, DialogStubComponent, DuplicateStubComponent],
      imports: [RouterTestingModule, NoopAnimationsModule, FormsModule, SharedComponentsModule, DialogModule, MenuModule, ButtonModule],
      providers: [
        { provide: QuotationService, useValue: service },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  it('shows skeleton rows while loading, then one row per quotation', () => {
    const pending = new Subject<any>();
    create(pending);
    expect(el().querySelectorAll('.q-skeleton').length).toBe(6);
    expect(el().querySelector('section.card')?.getAttribute('aria-busy')).toBe('true');

    pending.next({ success: true, data: ROWS });
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

  it('hides the status tabs until the API reports statuses, and marks billed quotations', () => {
    create();
    expect(el().querySelector('.tabs')).toBeNull();
    const badges = Array.from(el().querySelectorAll('.q-row .badge')).map((b) => (b.textContent || '').trim());
    expect(badges).toEqual(['Billed', 'Draft', 'Draft']);
  });

  it('shows tabs with counts once statuses arrive, and filters by them', () => {
    const withStatus = ROWS.map((row, i) => ({ ...row, number: `Q-00${row.id}`, status: ['sent', 'draft', 'billed'][i] }));
    create(of({ success: true, data: withStatus }));
    const tabs = Array.from(el().querySelectorAll('.tab')) as HTMLElement[];
    expect(tabs.map((t) => (t.textContent || '').replace(/\s+/g, ''))).toEqual(['All3', 'Draft1', 'Sent1', 'Accepted0', 'Billed1']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');

    tabs[2].click();
    fixture.detectChanges();
    expect(el().querySelectorAll('.q-row').length).toBe(1);
    expect(text()).toContain('Q-0014');
    expect(text()).toContain('1 quotation');
  });

  it('searches by name, customer or number and offers a way back when nothing matches', () => {
    create();
    component.search = 'al-rashid';
    component.onSearch();
    fixture.detectChanges();
    expect(el().querySelectorAll('.q-row').length).toBe(1);

    component.search = 'nothing like this';
    fixture.detectChanges();
    expect(el().querySelectorAll('.q-row').length).toBe(0);
    expect(text()).toContain('No quotations match “nothing like this”.');
    (el().querySelector('.q-none button') as HTMLElement).click();
    fixture.detectChanges();
    expect(el().querySelectorAll('.q-row').length).toBe(3);
  });

  it('shows an empty state with the one primary button when there is no quotation', () => {
    create(of({ success: true, data: [] }));
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

    service.getAllQuotations.and.returnValue(of({ success: true, data: ROWS }) as any);
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
    create(of({ success: true, data: ROWS }), { new: '1' });
    expect(component.dialogOpen).toBeTrue();
    component.closeDialog();
    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({ queryParams: {}, replaceUrl: true }));
  });

  it('opens the dialog for the quotation named by ?edit=, once the list has loaded', () => {
    const pending = new Subject<any>();
    create(pending, { edit: '15' });
    expect(component.dialogOpen).toBeFalse();
    pending.next({ success: true, data: ROWS });
    pending.complete();
    expect(component.dialogOpen).toBeTrue();
    expect(component.editRow?.id).toBe(15);
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

    component.confirmDelete();
    fixture.detectChanges();
    expect(service.deleteQuotation).toHaveBeenCalledWith(15);
    expect(component.rows.map((r) => r.id)).toEqual([17, 14]);
    expect(component.deleteRow).toBeNull();
    expect(toast.showSuccess).toHaveBeenCalled();
  });

  it('pages a long list', () => {
    const many = Array.from({ length: PAGE_SIZE * 2 + 3 }, (_, i) => ({ ...ROWS[0], id: i + 1, quatation_name: `Q ${i + 1}` }));
    create(of({ success: true, data: many }));
    expect(el().querySelectorAll('.q-row').length).toBe(PAGE_SIZE);
    expect(text()).toContain(`1–${PAGE_SIZE} of ${many.length} quotations`);
    component.next();
    component.next();
    component.next();
    fixture.detectChanges();
    expect(el().querySelectorAll('.q-row').length).toBe(3);
    const buttons = Array.from(el().querySelectorAll('.table-foot button')) as HTMLButtonElement[];
    expect(buttons[1].disabled).toBeTrue();
    expect(buttons[0].disabled).toBeFalse();
  });
});
