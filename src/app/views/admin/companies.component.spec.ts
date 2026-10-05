import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';

import { environment } from '../../../environments/environment';
import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { BUSINESS, company } from './admin.testing';
import { CompaniesComponent } from './companies.component';

const URL = `${environment.API_URL}/admin/companies`;

const ROWS = [
  company(1, 'Hakimi Enterprise', {
    status: 'active', stored_status: 'active', plan: BUSINESS, trial_ends_at: null, ends_on: null, grace_ends_on: null, days_left: null,
    seats: { used: 3, allowed: 15, plan: 15, override: null },
  }),
  company(2, 'Asha Windows'),
  company(3, 'Trial Ending', { ends_on: '2026-10-08', days_left: 3 }),
  company(4, 'Payment Due', { status: 'grace', ends_on: '2026-10-02', days_left: 4 }),
  company(5, 'Locked One', { status: 'locked', read_only: true, ends_on: '2026-09-01', days_left: null }),
  company(6, 'Paused', { status: 'suspended', read_only: true, suspended_at: '2026-10-04T00:00:00+00:00' }),
];

describe('CompaniesComponent', () => {
  let fixture: ComponentFixture<CompaniesComponent>;
  let component: CompaniesComponent;
  let http: HttpTestingController;
  let el: HTMLElement;

  const names = () => Array.from(el.querySelectorAll('tbody tr a.title')).map((a) => a.textContent!.trim());

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [CompaniesComponent],
      imports: [HttpClientTestingModule, RouterTestingModule, FormsModule, SharedComponentsModule],
    });
    fixture = TestBed.createComponent(CompaniesComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function loaded(): void {
    http.expectOne(URL).flush({ success: true, data: { companies: ROWS, total: ROWS.length } });
    fixture.detectChanges();
  }

  it('lists the companies that need attention first: locked, payment due, ending soon', () => {
    loaded();
    expect(names()).toEqual(['Locked One', 'Payment Due', 'Trial Ending', 'Paused', 'Asha Windows', 'Hakimi Enterprise']);
    expect(el.querySelector('.page-header .sub')?.textContent).toContain('6 companies, 3 need attention');
  });

  it('shows plan, status, seats and the end day of each company', () => {
    loaded();
    const row = Array.from(el.querySelectorAll('tbody tr')).find((tr) => tr.textContent!.includes('Payment Due'))!;
    const text = row.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Payment due: locks in 5 days');
    expect(text).toContain('Growth');
    expect(text).toContain('1 of 5');
    expect(text).toContain('2 Oct 2026');
    expect(text).toContain('Trial ended');
    const owner = Array.from(el.querySelectorAll('tbody tr')).find((tr) => tr.textContent!.includes('Hakimi'))!;
    expect(owner.textContent).toContain('3 of 15');
    expect(owner.textContent).toContain('No end date');
    expect(row.querySelector('a.title')?.getAttribute('href')).toBe('/admin/companies/4');
  });

  it('filters by status, by plan and by a part of the name', () => {
    loaded();
    component.status = 'grace';
    component.apply();
    fixture.detectChanges();
    expect(names()).toEqual(['Payment Due']);

    component.status = '';
    component.plan = 'business';
    component.apply();
    fixture.detectChanges();
    expect(names()).toEqual(['Hakimi Enterprise']);

    component.plan = '';
    component.search = 'asha';
    component.apply();
    fixture.detectChanges();
    expect(names()).toEqual(['Asha Windows']);

    component.search = 'nobody';
    component.apply();
    fixture.detectChanges();
    expect(el.textContent).toContain('No company matches');
  });

  it('sorts by name, and by the day that comes first', () => {
    loaded();
    component.order = 'name';
    component.apply();
    expect(component.rows.map((row) => row.name)).toEqual(['Asha Windows', 'Hakimi Enterprise', 'Locked One', 'Paused', 'Payment Due', 'Trial Ending']);
    component.order = 'ending';
    component.apply();
    expect(component.rows[0].name).toBe('Locked One');
    expect(component.rows[component.rows.length - 1].name).toBe('Hakimi Enterprise');
  });

  it('shows the api\'s own words and "Try again" when the list is refused', () => {
    http.expectOne(URL).flush({ success: false, code: 'platform_admin_only', message: 'This is for the platform admin only.' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(el.querySelector('.callout')?.textContent).toContain('This is for the platform admin only.');
    (el.querySelector('.callout button') as HTMLButtonElement).click();
    loaded();
    expect(names().length).toBe(6);
  });
});
