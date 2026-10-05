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

  // ---- T146: what the api gained in phase-56 G5

  const VOIDED = { ...PAYMENT, void: true, voided_at: '2026-10-06T06:30:00+00:00', voided_by: 3, void_reason: 'Typed for the wrong company' };
  const rows = (): HTMLTableRowElement[] => Array.from(el.querySelectorAll<HTMLTableRowElement>('section:last-of-type tbody tr'));

  it('void a payment: the reason is asked, nothing is sent before the yes, and the row stays struck through with the reason', () => {
    create(asha({ status: 'active', stored_status: 'active' }, { payments: [PAYMENT], payments_total: 7497, payments_total_paise: 749700, payments_count: 1, payments_void_count: 0 }));
    expect(el.querySelector('.pay-total')!.textContent!.replace(/\s+/g, ' ')).toContain('Total received ₹7,497.00');
    expect(rows()[0].classList.contains('void')).toBeFalse();

    (rows()[0].querySelector('button.void-payment') as HTMLButtonElement).click();
    expect(component.action).toBe('void');
    expect(component.title).toBe('Void a payment entered by mistake');
    component.next();
    expect(component.step).toBe('form');
    expect(component.actionError).toBe('Say why this payment is void, in 3 letters or more.');
    component.form.reason = '  Typed for the wrong company ';
    component.next();
    expect(component.willHappen[0]).toContain('The payment of ₹7,497.00 received on 5 Oct 2026 is marked void.');
    expect(component.willHappen[0]).toContain('The row stays in the list');
    expect(component.willHappen[2]).toBe('Reason kept with it: "Typed for the wrong company"');
    http.expectNone(`${API}/companies/2/payments/9/void`);

    const body = yes('payments/9/void', asha({}, { payment: VOIDED, subscription_restored: true, payments: [VOIDED], payments_total: 0, payments_total_paise: 0, payments_count: 0, payments_void_count: 1 }));
    expect(body).toEqual({ reason: 'Typed for the wrong company' });
    const row = rows()[0];
    expect(row.classList.contains('void')).toBeTrue();
    expect(row.querySelector('.badge')!.textContent).toContain('void');
    expect(row.textContent).toContain('Typed for the wrong company');
    expect(row.textContent).withContext('the row is kept').toContain('₹7,497.00');
    expect(row.querySelector('button.void-payment')).withContext('a void payment cannot be voided again').toBeNull();
    // the total and the paid day are the api's, not worked out here
    expect(el.querySelector('.pay-total')!.textContent!.replace(/\s+/g, ' ')).toContain('Total received ₹0.00 · 1 void, not counted');
    const said = el.querySelector('.callout.success')!.textContent!;
    expect(said).toContain('The payment of ₹7,497.00 is void.');
    expect(said).toContain('Asha Windows is back to what it was before it: ');
    expect(said).toContain('19 Oct 2026');
  });

  it('void an older payment: the dates were not changed; a refusal (409) stays in the dialog', () => {
    create(asha({}, { payments: [PAYMENT] }));
    component.openVoid(PAYMENT);
    component.form.reason = 'Entered twice';
    component.next();
    component.send();
    http.expectOne(`${API}/companies/2/payments/9/void`).flush({ success: false, code: 'payment_already_void', message: 'This payment is void already.' }, { status: 409, statusText: 'Conflict' });
    expect(component.actionError).toBe('This payment is void already.');
    expect(component.action).toBe('void');

    yes('payments/9/void', asha({}, { payment: VOIDED, subscription_restored: false, payments: [VOIDED] }));
    expect(el.querySelector('.callout.success')!.textContent).toContain('The dates of Asha Windows were not changed.');
  });

  it('activate with a last paid day in place of months: sends "to" and no months', () => {
    create();
    ask('activate', { period: 'day', to: '', amount: 4998 });
    expect(component.actionError).toBe('Choose the last paid day.');
    ask('activate', { period: 'day', to: '2026-10-04', amount: 4998 });
    expect(component.actionError).toBe('The last paid day cannot be a day that has passed.');
    ask('activate', { period: 'day', to: '2026-12-31', from: '2027-01-05', amount: 4998 });
    expect(component.actionError).toBe('The last paid day cannot be before the day the period starts.');

    ask('activate', { period: 'day', to: '2026-12-31', amount: 4998, months: 7 });
    expect(component.willHappen[1]).toContain('active on Growth up to and including 31 Dec 2026');
    const paid = { ...PAYMENT, amount_paise: 499800, amount: 4998, months: 2, period_to: '2026-12-31' };
    const body = yes('activate', asha({ status: 'active', stored_status: 'active', current_period_ends_at: '2026-12-31', ends_on: '2026-12-31' }, { payment: paid }));
    expect(body).toEqual({ to: '2026-12-31', amount_paise: 499800, mode: 'upi', plan: 'growth', paid_on: '2026-10-05' });
    expect('months' in body).toBeFalse();
    expect(el.querySelector('.callout.success')!.textContent).toContain('paid from 5 Oct 2026 to 31 Dec 2026');
  });

  it('activate: the dialog offers the last paid day through the shared date field', () => {
    create();
    component.open('activate');
    component.form.period = 'day';
    fixture.detectChanges();
    const dialog = document.querySelector('.p-dialog') as HTMLElement;
    expect(dialog.querySelector('app-date-field #act-to, #act-to')).not.toBeNull();
    expect(dialog.querySelector('#act-months')).toBeNull();
    component.close();
    fixture.detectChanges();
  });

  it('reads seats_override and features_override from the api, also when they equal the plan', () => {
    // Growth gives 5 seats and no 3D: an override of the same values cannot be guessed from the result
    create(asha({}, { seats_override: 5, features_override: { feature_3d: false, max_design_templates: 3 } }));
    const text = el.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('set for this company; the plan gives 5');
    expect(text).toContain('Set for this company, whatever the plan says:');
    expect(component.featureOverride).toEqual({ feature_3d: false, max_design_templates: 3 });
    component.open('limits');
    expect(component.form.seats).toBe(5);
    expect(component.form.threeD).toBe('off');
    // the whole stored map goes back with the one change
    Object.assign(component.form, { threeD: 'on' });
    component.next();
    expect(yes('overrides', asha({}, { seats_override: 5, features_override: { max_design_templates: 3, feature_3d: true } }))).toEqual({
      features_override: { max_design_templates: 3, feature_3d: true },
    });
  });

  it('an answer that says "no override" is believed: nothing is guessed from the result', () => {
    create(asha({ features: { ...GROWTH.features, feature_3d: true } }, { seats_override: null, features_override: null }));
    expect(component.featureOverride).toEqual({});
    expect(el.textContent).not.toContain('whatever the plan says');
    component.open('limits');
    expect(component.form.threeD).toBe('plan');
    expect(component.form.seats).toBeNull();
    component.close();
  });
});
