import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Observable, Subject, of, throwError } from 'rxjs';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { LocalStoreService } from 'src/app/shared/services/local-storage.service';
import { DashboardComponent } from './dashboard.component';
import { DashboardService } from './dashboard.service';
import { HomeView, buildHomeView } from './home-data';

const FIGURES = {
  total_customer: 2,
  total_quatation: 2,
  total_quatation_product: 5,
  total_revenue_quatation: 141595.8,
  total_revenue_quatation_current_month: 141595.8,
  total_revenue_quatation_converted_to_bill: 14159.58,
  total_revenue_quatation_converted_to_bill_current_month: 14159.58,
};

const VIEW = buildHomeView(
  FIGURES,
  [
    { id: 14, quatation_name: 'Al-Rashid Villa Windows', name: 'Ahmed Al-Rashid', total: 141595.8, item_count: 3 },
    { id: 15, quatation_name: 'Sharma Flat Renovation', name: 'Sharma Residency', grand_total: 14159.58, is_convert_bill: 1 },
  ],
  new Date(2026, 9, 4)
);

describe('DashboardComponent (Home)', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let el: HTMLElement;
  let home: jasmine.Spy<() => Observable<HomeView>>;

  function create(result: Observable<HomeView>): void {
    home = jasmine.createSpy('getHome').and.returnValue(result);
    TestBed.configureTestingModule({
      imports: [RouterTestingModule, SharedComponentsModule],
      declarations: [DashboardComponent],
      providers: [
        { provide: DashboardService, useValue: { getHome: home } },
        { provide: LocalStoreService, useValue: { getItem: () => ({ name: 'Husain' }) } },
      ],
    });
    fixture = TestBed.createComponent(DashboardComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  const text = (selector: string) => Array.from(el.querySelectorAll(selector)).map((node) => node.textContent!.trim());

  it('greets the signed-in user by name', () => {
    create(of(VIEW));
    expect(el.querySelector('h1')!.textContent).toMatch(/^Good (morning|afternoon|evening), Husain$/);
  });

  it('shows skeletons while loading, and tells a screen reader', () => {
    create(new Subject<HomeView>());
    expect(el.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(el.querySelector('[role="status"]')!.textContent).toContain('Loading');
    expect(el.querySelector('app-stat')).toBeNull();
  });

  it('shows three figures in rupees with Indian grouping', () => {
    create(of(VIEW));
    expect(text('app-stat .k')).toEqual(['Quoted this month', 'Open quotations', 'Billed this month']);
    expect(text('app-stat .v')).toEqual(['₹1,41,596', '₹1,41,596', '₹14,160']);
  });

  it('lists what needs attention with one link per row to the quotation', () => {
    create(of(VIEW));
    const rows = el.querySelectorAll('.todo');
    expect(rows.length).toBe(1);
    expect(rows[0].querySelector('.badge')!.textContent!.trim()).toBe('Draft');
    expect(rows[0].querySelector('.num')!.textContent!.trim()).toBe('₹1,41,595.80');
    const action = rows[0].querySelector('a.btn') as HTMLAnchorElement;
    expect(action.textContent!.trim()).toBe('Continue');
    expect(action.getAttribute('aria-label')).toBe('Continue: Al-Rashid Villa Windows');
    expect(action.getAttribute('href')).toBe('/quotation/detail/14');
  });

  it('lists recent quotations with status and total', () => {
    create(of(VIEW));
    expect(text('tbody a.title')).toEqual(['Sharma Flat Renovation', 'Al-Rashid Villa Windows']);
    expect(text('tbody .badge')).toEqual(['Billed', 'Draft']);
    expect(text('tbody td.num')).toEqual(['₹14,159.58', '₹1,41,595.80']);
  });

  it('has exactly one primary button', () => {
    create(of(VIEW));
    expect(text('.btn-primary')).toEqual(['New quotation']);
  });

  it('shows an empty state with the one primary button when there is no quotation', () => {
    create(of(buildHomeView(FIGURES, [])));
    expect(el.querySelector('.empty h2')!.textContent).toBe('No quotations yet');
    expect(el.querySelectorAll('.btn-primary').length).toBe(1);
    expect(el.querySelector('.empty .btn-primary')).not.toBeNull();
    expect(el.querySelector('.todo')).toBeNull();
  });

  it('says so when nothing needs attention', () => {
    create(of(buildHomeView(FIGURES, [{ id: 15, name: 'Sharma Residency', is_convert_bill: 1 }])));
    expect(el.querySelector('p.todo')!.textContent).toContain('Nothing is waiting for you');
  });

  it('shows an inline error and loads again on "Try again"', () => {
    create(throwError(() => new Error('offline')));
    const alert = el.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('We could not load');
    expect(el.querySelector('app-stat')).toBeNull();

    home.and.returnValue(of(VIEW));
    (alert.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(home).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.querySelectorAll('app-stat').length).toBe(3);
  });
});
