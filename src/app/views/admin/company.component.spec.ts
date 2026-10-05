import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { DialogModule } from 'primeng/dialog';

import { environment } from '../../../environments/environment';
import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { AdminCompany } from './admin.models';
import { BUSINESS, GROWTH, company } from './admin.testing';
import { CompanyAction, CompanyComponent } from './company.component';

const API = `${environment.API_URL}/admin`;

const PAYMENT = {
  id: 9, company_id: 2, plan: 'growth', amount_paise: 749700, amount: 7497, mode: 'upi' as const, reference: 'UTR123', note: null,
  paid_on: '2026-10-05', months: 3, period_from: '2026-10-05', period_to: '2027-01-04', recorded_by: 4, created_at: '2026-10-05T12:00:00+00:00',
};

function asha(changes = {}, more: Partial<AdminCompany> = {}): AdminCompany {
  return company(2, 'Asha Windows', changes, {
    users: [{ id: 7, name: 'Asha', email: 'asha@example.test', created_at: '2026-10-01T10:00:00+00:00' }],
    payments: [],
    ...more,
  });
}

describe('CompanyComponent', () => {
  let fixture: ComponentFixture<CompanyComponent>;
  let component: CompanyComponent;
  let http: HttpTestingController;
  let el: HTMLElement;

  function create(first: AdminCompany = asha()): void {
    TestBed.configureTestingModule({
      declarations: [CompanyComponent],
      imports: [HttpClientTestingModule, RouterTestingModule, FormsModule, DialogModule, NoopAnimationsModule, SharedComponentsModule],
      providers: [{ provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '2' }) } } }],
    });
    fixture = TestBed.createComponent(CompanyComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${API}/companies/2`).flush({ success: true, data: first });
    http.expectOne(`${API}/plans`).flush({ success: true, data: { plans: [GROWTH, BUSINESS] } });
    fixture.detectChanges();
  }

  /** Opens the dialog of an action, fills it in, and goes to "this is what will happen". */
  function ask(action: CompanyAction, values: Partial<CompanyComponent['form']> = {}): void {
    component.open(action);
    Object.assign(component.form, values);
    component.next();
  }

  /** Says yes, answers the request, and answers the reading of the company that follows. */
  function yes(path: string, answer: AdminCompany): any {
    component.send();
    const request = http.expectOne(`${API}/companies/2/${path}`);
    expect(request.request.method).toBe('POST');
    request.flush({ success: true, data: answer });
    http.expectOne(`${API}/companies/2`).flush({ success: true, data: { users: [], payments: [], ...answer } });
    fixture.detectChanges();
    return request.request.body;
  }

  afterEach(() => http.verify());

  it('shows the facts of the company, its people and that no payment was entered', () => {
    create();
    const text = el.textContent!.replace(/\s+/g, ' ');
    expect(el.querySelector('h1')?.textContent).toContain('Asha Windows');
    expect(text).toContain('Growth, ₹2,499.00 a month before GST');
    expect(text).toContain('Trial ends');
    expect(text).toContain('19 Oct 2026');
    expect(text).toContain('1 of 5');
    expect(text).toContain('3D view: no');
    expect(text).toContain('asha@example.test');
    expect(text).toContain('No payment has been entered for this company.');
  });

  it('sends nothing until the admin has read what will happen and said yes', () => {
    create();
    ask('suspend');
    expect(component.step).toBe('confirm');
    expect(component.willHappen.join(' ')).toContain('Asha Windows becomes read-only at once');
    component.back();
    component.close();
    expect(component.action).toBeNull(); // http.verify(): no request was made
  });

  it('activate: records the payment in paise and shows the paid period the api answers', () => {
    create();
    ask('activate', { months: 3, amount: 7497, mode: 'upi', reference: ' UTR123 ', note: 'Paid by UPI' });
    expect(component.willHappen[0]).toContain('₹7,497.00 by UPI');
    expect(component.willHappen[1]).toContain('active on Growth for 3 months');
    const body = yes('activate', asha({ status: 'active', stored_status: 'active', current_period_ends_at: '2027-01-04', ends_on: '2027-01-04' }, { payment: PAYMENT }));
    expect(body).toEqual({ months: 3, amount_paise: 749700, mode: 'upi', plan: 'growth', reference: 'UTR123', paid_on: '2026-10-05', note: 'Paid by UPI' });
    expect(el.querySelector('.callout.success')?.textContent).toContain('Payment recorded. Asha Windows is on Growth, paid from 5 Oct 2026 to 4 Jan 2027.');
    expect(component.action).toBeNull();
  });

  it('activate: sends the start day only when one is given, and asks for the months and the amount', () => {
    create();
    ask('activate', { months: 0, amount: 100 });
    expect(component.step).toBe('form');
    expect(component.actionError).toContain('months');
    ask('activate', { months: 1, amount: null });
    expect(component.actionError).toContain('amount');
    ask('activate', { months: 1, amount: 2499, from: '2026-11-01' });
    expect(component.willHappen[1]).toContain('starting 1 Nov 2026');
    const body = yes('activate', asha({}, { payment: PAYMENT }));
    expect(body.from).toBe('2026-11-01');
    expect(body.reference).toBeUndefined();
  });

  it('change plan: sends the code of the new plan and warns nothing is paid by it', () => {
    create();
    ask('plan', { plan: 'growth' });
    expect(component.actionError).toContain('already');
    ask('plan', { plan: 'business' });
    expect(component.willHappen[0]).toContain('moves from Growth to Business');
    const body = yes('plan', asha({ plan: BUSINESS, seats: { used: 1, allowed: 15, plan: 15, override: null }, features: BUSINESS.features }));
    expect(body).toEqual({ plan: 'business' });
    expect(el.querySelector('.callout.success')?.textContent).toContain('Asha Windows is now on Business');
  });

  it('extend trial: sends the days, and says so first when the company is paying', () => {
    create(asha({ status: 'active', stored_status: 'active', current_period_ends_at: '2027-01-04', ends_on: '2027-01-04' }));
    ask('trial', { days: 0 });
    expect(component.actionError).toContain('days');
    ask('trial', { days: 7, note: 'Asked for a week' });
    expect(component.willHappen.join(' ')).toContain('goes back to trial');
    const body = yes('extend-trial', asha({ trial_ends_at: '2026-10-12', ends_on: '2026-10-12' }));
    expect(body).toEqual({ days: 7, note: 'Asked for a week' });
    expect(el.querySelector('.callout.success')?.textContent).toContain('on trial until 12 Oct 2026');
  });

  it('seats and 3D: sends only what was changed', () => {
    create();
    ask('limits');
    expect(component.actionError).toBe('Nothing is changed yet.');
    ask('limits', { seats: 8 });
    expect(yes('overrides', asha({ seats: { used: 1, allowed: 8, plan: 5, override: 8 } }))).toEqual({ seats_override: 8 });

    ask('limits', { threeD: 'on' });
    expect(component.willHappen[0]).toContain('3D view is switched on');
    const body = yes('overrides', asha({ seats: { used: 1, allowed: 8, plan: 5, override: 8 }, features: { ...GROWTH.features, feature_3d: true } }));
    expect(body).toEqual({ features_override: { feature_3d: true } });
    expect(el.querySelector('.callout.success')?.textContent).toContain('3D view: on');
  });

  it('seats and 3D: putting both back to the plan sends null for each', () => {
    create(asha({ seats: { used: 1, allowed: 8, plan: 5, override: 8 }, features: { ...GROWTH.features, feature_3d: true } }));
    component.open('limits');
    expect(component.form.seats).toBe(8);
    expect(component.form.threeD).toBe('on');
    Object.assign(component.form, { seats: null, threeD: 'plan' });
    component.next();
    expect(yes('overrides', asha())).toEqual({ seats_override: null, features_override: null });
  });

  it('suspend, then reactivate: each with its note, each shown as the api answers', () => {
    create();
    expect(el.textContent).not.toContain('Reactivate');
    ask('suspend', { note: 'Asked to pause' });
    expect(yes('suspend', asha({ status: 'suspended', read_only: true, suspended_at: '2026-10-05T12:00:00+00:00' }))).toEqual({ note: 'Asked to pause' });
    expect(el.querySelector('.callout.success')?.textContent).toContain('Asha Windows is suspended and read-only.');
    expect(el.querySelector('.actions')?.textContent).toContain('Reactivate');
    expect(el.querySelector('.actions')?.textContent).not.toContain('Suspend');

    ask('reactivate');
    expect(yes('reactivate', asha())).toEqual({});
    expect(el.querySelector('.callout.success')?.textContent).toContain('reactivated. Its status is now: Trial.');
  });

  it('shows a refusal in the api\'s own words and keeps the dialog open', () => {
    create();
    ask('trial', { days: 7 });
    component.send();
    http
      .expectOne(`${API}/companies/2/extend-trial`)
      .flush({ message: 'The days field must not be greater than 365.', errors: { days: ['The days field must not be greater than 365.'] } }, { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();
    expect(component.action).toBe('trial');
    expect(component.actionError).toBe('The days field must not be greater than 365.');
    expect(component.result).toBe('');

    component.send();
    http.expectOne(`${API}/companies/2/extend-trial`).flush({ success: false, message: 'Server said no.' }, { status: 500, statusText: 'Error' });
    expect(component.actionError).toBe('Server said no.');
  });

  it('says so when there is no such company', () => {
    TestBed.configureTestingModule({
      declarations: [CompanyComponent],
      imports: [HttpClientTestingModule, RouterTestingModule, FormsModule, DialogModule, NoopAnimationsModule, SharedComponentsModule],
      providers: [{ provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '2' }) } } }],
    });
    fixture = TestBed.createComponent(CompanyComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${API}/companies/2`).flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
    http.expectOne(`${API}/plans`).flush({ success: true, data: { plans: [] } });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.callout').textContent).toContain('There is no company with this number.');
  });
});
