import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { environment } from '../../../environments/environment';
import { AdminCompany } from './admin.models';
import { BUSINESS, GROWTH, company } from './admin.testing';
import { NewCompanyComponent } from './new-company.component';

const API = `${environment.API_URL}/admin`;

describe('NewCompanyComponent (T146)', () => {
  let fixture: ComponentFixture<NewCompanyComponent>;
  let component: NewCompanyComponent;
  let http: HttpTestingController;
  let el: HTMLElement;
  let created: AdminCompany[];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NewCompanyComponent, HttpClientTestingModule, RouterTestingModule] });
    fixture = TestBed.createComponent(NewCompanyComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    http = TestBed.inject(HttpTestingController);
    created = [];
    component.created.subscribe((row) => created.push(row));
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function start(values: Partial<NewCompanyComponent['form']> = {}): void {
    (el.querySelector('button.new-company') as HTMLButtonElement).click();
    http.expectOne(`${API}/plans`).flush({ success: true, data: { plans: [GROWTH, BUSINESS, { ...GROWTH, id: 9, code: 'old', name: 'Old', is_active: false }] } });
    Object.assign(component.form, { name: ' By Hand Windows ', state: '24', ownerName: ' Ravi ', ownerEmail: ' Ravi@ByHand.example ', ...values });
    fixture.detectChanges();
  }

  it('asks nothing of the api until "New company" is pressed, and offers the plans still sold', () => {
    expect(el.querySelector('form')).toBeNull();
    start();
    expect(component.plans.map((plan) => plan.code)).toEqual(['growth', 'business']);
    expect(component.form.plan).toBe('growth');
    expect(component.form.catalogue).withContext('the example catalogue is the default').toBe('classic_example');
    const radios = Array.from(el.querySelectorAll<HTMLInputElement>('input[name="catalogue"]')).map((radio) => radio.value);
    expect(radios).toEqual(['classic_example', 'none']);
  });

  it('with the example catalogue: says so before the yes and sends starter_catalogue classic_example', () => {
    start({ note: ' asked by phone ' });
    component.next();
    fixture.detectChanges();
    expect(component.step).toBe('confirm');
    expect(component.willHappen[0]).toBe('The company "By Hand Windows" (Gujarat) is created on Growth with a free trial of 14 days.');
    expect(component.willHappen[1]).toContain('Ravi (ravi@byhand.example) is its owner.');
    expect(component.willHappen[2]).toContain('example catalogue and example rates');
    http.expectNone(`${API}/companies`);

    (el.querySelector('button.create') as HTMLButtonElement).click();
    const request = http.expectOne(`${API}/companies`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      company: { name: 'By Hand Windows', state_code: '24' },
      owner: { name: 'Ravi', email: 'ravi@byhand.example' },
      plan: 'growth',
      trial_days: 14,
      starter_catalogue: 'classic_example',
      note: 'asked by phone',
    });
    request.flush({ success: true, data: company(8, 'By Hand Windows', {}, { starter_catalogue: 'classic_example', owner: { email: 'ravi@byhand.example', password: 'Once-Only-1' } }) });
    fixture.detectChanges();
    expect(created.map((row) => row.id)).toEqual([8]);
    const said = el.querySelector('.callout.success')!.textContent!.replace(/\s+/g, ' ');
    expect(said).toContain('By Hand Windows is created, with the example catalogue.');
    expect(said).toContain('ravi@byhand.example and this password: Once-Only-1. It is shown only now');
    expect(el.querySelector('.callout.success a')!.getAttribute('href')).toBe('/admin/companies/8');
    expect(el.querySelector('form')).toBeNull();
  });

  it('empty: sends starter_catalogue none and says the company cannot price yet', () => {
    start({ catalogue: 'none', plan: 'business', days: 30 });
    component.next();
    expect(component.willHappen[2]).toContain('It starts empty: no profiles and no rates.');
    component.send();
    const request = http.expectOne(`${API}/companies`);
    expect(request.request.body.starter_catalogue).toBe('none');
    expect(request.request.body.plan).toBe('business');
    expect(request.request.body.trial_days).toBe(30);
    expect('note' in request.request.body).toBeFalse();
    request.flush({ success: true, data: company(9, 'By Hand Windows', {}, { starter_catalogue: null, owner: { email: 'ravi@byhand.example', password: null } }) });
    fixture.detectChanges();
    const said = el.querySelector('.callout.success')!.textContent!.replace(/\s+/g, ' ');
    expect(said).toContain('is created, empty.');
    expect(said).toContain('No password was made');
  });

  it('asks for what is missing, one thing at a time, and sends nothing', () => {
    start({ name: ' ' });
    component.next();
    expect(component.error).toBe('Enter the name of the company.');
    Object.assign(component.form, { name: 'By Hand Windows', state: '' });
    component.next();
    expect(component.error).toContain('Choose the state');
    Object.assign(component.form, { state: '24', ownerEmail: 'ravi' });
    component.next();
    expect(component.error).toBe('Enter the e-mail address the owner signs in with.');
    Object.assign(component.form, { ownerEmail: 'ravi@byhand.example', days: 0 });
    component.next();
    expect(component.error).toContain('whole number from 1 to 365');
    expect(component.step).toBe('form');
  });

  it("shows the api's refusal in its own words and keeps what was typed", () => {
    start();
    component.next();
    component.send();
    http.expectOne(`${API}/companies`).flush({ success: false, errors: { 'owner.email': ['This e-mail address is in use already.'] } }, { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();
    expect(el.querySelector('.callout.danger')!.textContent).toContain('This e-mail address is in use already.');
    expect(component.open).toBeTrue();
    expect(created).toEqual([]);
    component.back();
    expect(component.form.ownerName).toBe(' Ravi ');
  });
});
