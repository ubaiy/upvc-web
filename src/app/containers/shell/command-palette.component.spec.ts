import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { ApiHttpService } from '../../shared/services/api-http.service';
import { QuotationListService } from '../../views/quotation/quotation-list.service';
import { CommandPaletteComponent } from './command-palette.component';

const CUSTOMERS = [
  { id: 7, name: 'T73 Patel Constructions', phone: '9876543210' },
  { id: 8, name: 'Pune Retail', phone: '9123456780' },
  { id: 9, name: 'Patel Glass House', phone: '9000011111' },
];

const QUOTATION = { id: 36, number: 'Q-0014', name: 'Patel Villa', customerName: 'T73 Patel Constructions' };

describe('CommandPaletteComponent (Search, Ctrl K)', () => {
  let fixture: ComponentFixture<CommandPaletteComponent>;
  let component: CommandPaletteComponent;
  let api: jasmine.SpyObj<ApiHttpService>;
  let quotations: jasmine.SpyObj<QuotationListService>;
  let router: Router;

  const el = (): HTMLElement => fixture.nativeElement;
  const input = (): HTMLInputElement => el().querySelector('input') as HTMLInputElement;
  const options = (): string[] =>
    Array.from(el().querySelectorAll('[role="option"]')).map((o) => o.getAttribute('aria-label') || '');
  const sections = (): string[] => Array.from(el().querySelectorAll('.section')).map((s) => (s.textContent || '').trim());

  function type(value: string): void {
    input().value = value;
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function key(name: string): void {
    input().dispatchEvent(new KeyboardEvent('keydown', { key: name }));
    fixture.detectChanges();
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('ApiHttpService', ['get']);
    api.get.and.returnValue(of({ success: true, data: CUSTOMERS }));
    quotations = jasmine.createSpyObj('QuotationListService', ['page']);
    quotations.page.and.returnValue(of({ rows: [QUOTATION as any], total: 1, lastPage: 1 }));
    TestBed.configureTestingModule({
      declarations: [CommandPaletteComponent],
      imports: [SharedComponentsModule, RouterTestingModule],
      providers: [
        { provide: ApiHttpService, useValue: api },
        { provide: QuotationListService, useValue: quotations },
      ],
    });
    fixture = TestBed.createComponent(CommandPaletteComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    fixture.detectChanges();
  });

  it('opens with the cursor in the field and the pages listed, and asks the api nothing', () => {
    expect(document.activeElement).toBe(input());
    expect(options()).toContain('Customers');
    expect(api.get).not.toHaveBeenCalled();
    expect(quotations.page).not.toHaveBeenCalled();
  });

  it('finds a customer by name and a quotation by its customer (M11)', fakeAsync(() => {
    type('patel');
    expect(el().textContent).toContain('Looking for customers and quotations');
    tick(250);
    fixture.detectChanges();
    expect(sections()).toEqual(['Customers', 'Quotations']);
    // A name that starts with the text comes first.
    expect(options()).toEqual([
      'Patel Glass House, 9000011111',
      'T73 Patel Constructions, 9876543210',
      'Q-0014 · Patel Villa, T73 Patel Constructions',
    ]);
    expect(quotations.page).toHaveBeenCalledOnceWith({ status: 'all', search: 'patel', page: 1, perPage: 6 });
    expect(el().textContent).not.toContain('Nothing matches');
  }));

  it('finds a customer by a part of the phone number', fakeAsync(() => {
    quotations.page.and.returnValue(of({ rows: [], total: 0, lastPage: 1 }));
    type('91234');
    tick(250);
    fixture.detectChanges();
    expect(options()).toEqual(['Pune Retail, 9123456780']);
  }));

  it('opens the record with the arrow keys and Enter', fakeAsync(() => {
    const closed = jasmine.createSpy('closed');
    component.closed.subscribe(closed);
    type('patel');
    tick(250);
    fixture.detectChanges();
    key('ArrowDown');
    tick();
    expect(input().getAttribute('aria-activedescendant')).toBe('palette-option-1');
    key('Enter');
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/customers/edit/7');
    expect(closed).toHaveBeenCalled();

    type('q-0014');
    tick(250);
    fixture.detectChanges();
    key('Enter');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/quotation/detail/36');
  }));

  it('still lists pages, and reads the customer list once while it is open', fakeAsync(() => {
    type('cust');
    tick(250);
    fixture.detectChanges();
    expect(sections()[0]).toBe('Pages');
    expect(options()[0]).toBe('Customers');
    type('custo');
    tick(250);
    expect(api.get).toHaveBeenCalledTimes(1);
  }));

  it('says so when nothing matches, and when the records cannot be searched', fakeAsync(() => {
    quotations.page.and.returnValue(of({ rows: [], total: 0, lastPage: 1 }));
    type('zzzz');
    tick(250);
    fixture.detectChanges();
    expect(el().textContent).toContain('Nothing matches "zzzz".');

    quotations.page.and.returnValue(throwError(() => new Error('offline')));
    type('patel');
    tick(250);
    fixture.detectChanges();
    expect(el().textContent).toContain('Customers and quotations could not be searched.');
  }));
});
