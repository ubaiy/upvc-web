import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { MessageService } from 'primeng/api';
import { of, Subject } from 'rxjs';

import { AccessService } from 'src/app/shared/access/access.service';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { PLAN_CONTACT } from 'src/app/shared/configs/plans';
import { GST_STATES, TERMS_VERSION } from 'src/app/shared/configs/signup';
import { AuthService } from 'src/app/shared/services/auth.service';
import { environment } from 'src/environments/environment';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';
import { cleanGstin, cleanMobile, gstinCheckCharacter, gstinError, mobileError, passwordError } from './signup-rules';
import { contactLines, SignupComponent, whatsappLink } from './signup.component';
import { SignupForm, SignupOutcome, SignupService, signupBody, waitWords } from './signup.service';

const URL = `${environment.API_URL}/signup`;
const STATE_URL = `${environment.API_URL}/signup/state`;

const GOOD: SignupForm = {
  company_name: ' Shree Windows ',
  name: 'Asha Patel',
  email: ' Asha@Shree.example ',
  mobile: '+91 98765 43210',
  state_code: '24',
  gstin: '24aaacc1206d1zm',
  password: 'a-long-password-1',
  accept_terms: true,
  website: '',
};

describe('Sign-up: the rules of the form (T140)', () => {
  it('mobile: 10 digits, the first 6 to 9; +91 and a leading 0 are taken', () => {
    expect(cleanMobile('+91 98765 43210')).toBe('9876543210');
    expect(cleanMobile('098765-43210')).toBe('9876543210');
    expect(mobileError('9876543210')).toBe('');
    expect(mobileError('+91 98765 43210')).toBe('');
    expect(mobileError('')).toBe('Enter your mobile number');
    expect(mobileError('98765')).toBe('A mobile number has 10 digits');
    expect(mobileError('98765432101')).toBe('A mobile number has 10 digits');
    expect(mobileError('5876543210')).toContain('starts with 6, 7, 8 or 9');
  });

  it('GSTIN: the check character is worked out from the first 14', () => {
    expect(gstinCheckCharacter('24AAACC1206D1Z')).toBe('M');
    expect(gstinCheckCharacter('27AAPFU0939F1Z')).toBe('V');
    expect(gstinCheckCharacter('29AAGCB7383J1Z')).toBe('4');
    expect(gstinCheckCharacter('24AAACC')).toBeNull();
  });

  it('GSTIN: optional, capitals, right layout, right check character', () => {
    expect(cleanGstin(' 24aaacc1206d1zm ')).toBe('24AAACC1206D1ZM');
    expect(gstinError('', '24')).toBe('');
    expect(gstinError('24AAACC1206D1ZM', '24')).toBe('');
    expect(gstinError('24aaacc1206d1zm', '24')).toBe('');
    expect(gstinError('24AAACC1206D1ZN', '24')).toContain('typing mistake');
    // two digits swapped: still the layout of a GSTIN, caught by the check character
    expect(gstinError('24AAACC2106D1ZM', '24')).toContain('typing mistake');
    expect(gstinError('24AAACC1206D1Z', '24')).toBe('A GSTIN has 15 characters. This one has 14.');
    expect(gstinError('24AAACC12O6D1ZM', '24')).toContain('does not look like a GSTIN');
  });

  it('GSTIN: must be of the chosen state, said in plain words with the name of the state', () => {
    expect(gstinError('24AAACC1206D1ZM', '27')).toBe(
      'This GSTIN starts with 24, but a GSTIN of Maharashtra starts with 27. Check the state and the number.'
    );
    // no state chosen yet: nothing to compare with
    expect(gstinError('24AAACC1206D1ZM', '')).toBe('');
  });

  it('GSTIN while it is typed: an unfinished number is not called wrong, a wrong state is said after two digits', () => {
    expect(gstinError('24AAAC', '24', true)).toBe('');
    expect(gstinError('24', '27', true)).toContain('Maharashtra');
    expect(gstinError('24AAACC1206D1ZN', '24', true)).toContain('typing mistake');
  });

  it('password: 8 characters or more', () => {
    expect(passwordError('')).toBe('Choose a password');
    expect(passwordError('short')).toBe('Password must be at least 8 characters. This one has 5.');
    expect(passwordError('12345678')).toBe('');
  });

  it('the list of states: 37 rows, each a 2 digit code, none twice', () => {
    expect(GST_STATES.length).toBe(37);
    expect(GST_STATES.every((s) => /^\d\d$/.test(s.code) && !!s.name)).toBeTrue();
    expect(new Set(GST_STATES.map((s) => s.code)).size).toBe(37);
  });

  it('the request: trimmed, e-mail in small letters, mobile as 10 digits, GSTIN in capitals, the terms version of the ONE constant', () => {
    expect(signupBody(GOOD)).toEqual({
      company_name: 'Shree Windows',
      name: 'Asha Patel',
      email: 'asha@shree.example',
      mobile: '9876543210',
      state_code: '24',
      gstin: '24AAACC1206D1ZM',
      password: 'a-long-password-1',
      confirm_password: 'a-long-password-1',
      accept_terms: true,
      terms_version: TERMS_VERSION,
      website: '',
    });
    expect('gstin' in signupBody({ ...GOOD, gstin: '  ' })).toBeFalse();
  });

  it('429: the wait in words', () => {
    expect(waitWords('1500')).toBe('25 minutes');
    expect(waitWords('40')).toBe('1 minute');
    expect(waitWords('3600')).toBe('an hour');
    expect(waitWords(null)).toBe('an hour');
  });
});

describe('Sign-up: each answer of the api (T140)', () => {
  let service: SignupService;
  let http: HttpTestingController;
  let auth: jasmine.SpyObj<AuthService>;
  let access: jasmine.SpyObj<AccessService>;

  beforeEach(() => {
    sessionStorage.removeItem('signup-state');
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['setUserAndToken', 'getToken']);
    access = jasmine.createSpyObj<AccessService>('AccessService', ['forget']);
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: AccessService, useValue: access },
      ],
    });
    service = TestBed.inject(SignupService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.removeItem('signup-state');
  });

  function send(): { outcome: () => SignupOutcome; request: ReturnType<HttpTestingController['expectOne']> } {
    let got: SignupOutcome | undefined;
    service.signUp(GOOD).subscribe((o) => (got = o));
    return { outcome: () => got as SignupOutcome, request: http.expectOne(URL) };
  }

  it('200 signed in: the token and the user are kept exactly as after sign-in', () => {
    const { outcome, request } = send();
    expect(request.request.method).toBe('POST');
    expect(request.request.body.terms_version).toBe(TERMS_VERSION);
    const user = { id: 7, name: 'Asha Patel', last_name: null, email: 'asha@shree.example', phone: '9876543210', profile: null, role: 'owner' };
    request.flush({
      success: true,
      message: 'Your company is ready. You are signed in.',
      data: { verification_required: false, access_token: 'tok-1', user, company: { id: 6, name: 'Shree Windows' }, starter_catalogue: { code: 'classic_example', example_rates: true } },
    });
    expect(outcome()).toEqual({ kind: 'signed_in' });
    expect(auth.setUserAndToken).toHaveBeenCalledOnceWith({ ...user, access_token: 'tok-1' } as any, true);
    // GET me and GET subscription are asked again for the new token
    expect(access.forget).toHaveBeenCalled();
  });

  it('200 check your e-mail: nobody is signed in and the api\'s words are shown', () => {
    const { outcome, request } = send();
    request.flush({ success: true, data: { verification_required: true }, message: 'Check your e-mail: we have sent a link.' });
    expect(outcome()).toEqual({ kind: 'check_email', message: 'Check your e-mail: we have sent a link.' });
    expect(auth.setUserAndToken).not.toHaveBeenCalled();
  });

  it('403 signup_closed: the closed state, remembered for the tab', () => {
    const { outcome, request } = send();
    request.flush({ success: false, code: 'signup_closed', message: 'Sign-up is closed.' }, { status: 403, statusText: 'Forbidden' });
    expect(outcome()).toEqual({ kind: 'closed' });
    // an api without GET signup/state: the fallback does not ask a second time
    let state = '';
    service.ask().subscribe((s) => (state = s.state));
    http.expectOne(STATE_URL).flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
    http.expectNone(URL);
    expect(state).toBe('closed');
  });

  it('422 with errors: one line for each field', () => {
    const { outcome, request } = send();
    request.flush(
      { message: 'The mobile is wrong.', errors: { mobile: ['Enter an Indian mobile number.', 'second'], gstin: ['The GSTIN does not match the state.'] } },
      { status: 422, statusText: 'Unprocessable' }
    );
    expect(outcome()).toEqual({ kind: 'fields', errors: { mobile: 'Enter an Indian mobile number.', gstin: 'The GSTIN does not match the state.' } });
  });

  it('422 signup_not_possible: the api\'s line above the form, no field named', () => {
    const { outcome, request } = send();
    request.flush({ success: false, code: 'signup_not_possible', message: 'We could not create the account with these details.' }, { status: 422, statusText: 'Unprocessable' });
    expect(outcome()).toEqual({ kind: 'refused', text: 'We could not create the account with these details.', retry: false });
  });

  it('429: plain words with the wait of Retry-After', () => {
    const { outcome, request } = send();
    request.flush({ message: 'Too Many Attempts.' }, { status: 429, statusText: 'Too Many', headers: { 'Retry-After': '1500' } });
    expect(outcome()).toEqual({ kind: 'refused', text: 'Too many tries from this connection. Wait 25 minutes, then try again. Nothing was created.', retry: false });
  });

  it('503 signup_unavailable: plain words, can be tried again', () => {
    const { outcome, request } = send();
    request.flush({ success: false, code: 'signup_unavailable', message: 'No plan.' }, { status: 503, statusText: 'Unavailable' });
    expect(outcome()).toEqual({ kind: 'refused', text: 'We cannot start new trials at this moment. Nothing was created. Please try again later.', retry: true });
  });

  it('500 and no connection: nothing was created, try again', () => {
    let a = send();
    a.request.flush('boom', { status: 500, statusText: 'Server Error' });
    expect(a.outcome()).toEqual({ kind: 'refused', text: 'Something went wrong on our side. Nothing was created. Try again.', retry: true });
    a = send();
    a.request.error(new ProgressEvent('error'), { status: 0 });
    expect((a.outcome() as any).retry).toBeTrue();
    expect((a.outcome() as any).text).toContain('Check your internet connection');
  });

  it('the question on opening: GET signup/state says open or closed and the days of the trial; no POST is made', () => {
    const got: any[] = [];
    service.ask().subscribe((o) => got.push(o));
    const first = http.expectOne(STATE_URL);
    expect(first.request.method).toBe('GET');
    first.flush({ success: true, data: { open: true, verify_email: false, trial_days: 30, plan: { name: 'Growth' } } });
    service.ask().subscribe((o) => got.push(o));
    http.expectOne(STATE_URL).flush({ success: true, data: { open: false, verify_email: false, trial_days: 14, plan: { name: 'Growth' } } });
    service.ask().subscribe((o) => got.push(o));
    http.expectOne(STATE_URL).flush({ success: true, data: { open: true } });
    // an answer that does not say, and no connection: not known, the form is shown
    service.ask().subscribe((o) => got.push(o));
    http.expectOne(STATE_URL).flush({ success: true, data: {} });
    service.ask().subscribe((o) => got.push(o));
    http.expectOne(STATE_URL).error(new ProgressEvent('error'), { status: 0 });
    http.expectNone(URL);
    expect(got).toEqual([
      { state: 'open', trialDays: 30 },
      { state: 'closed', trialDays: 14 },
      { state: 'open', trialDays: null },
      { state: 'unknown', trialDays: null },
      { state: 'unknown', trialDays: null },
    ]);
  });

  it('the fallback for an api without that route (404): an empty POST; 403 signup_closed = closed, 422 = open, anything else = not known; kept for the tab', () => {
    const states: string[] = [];
    const ask = () => {
      service.ask().subscribe((o) => states.push(o.state));
      http.expectOne(STATE_URL).flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
    };
    ask();
    const first = http.expectOne(URL);
    expect(first.request.body).toEqual({});
    first.flush({ message: 'x', errors: { company_name: ['required'] } }, { status: 422, statusText: 'Unprocessable' });
    ask();
    http.expectNone(URL);
    sessionStorage.removeItem('signup-state');
    ask();
    http.expectOne(URL).flush({ message: 'Too Many Attempts.' }, { status: 429, statusText: 'Too Many' });
    ask();
    http.expectOne(URL).flush({ success: false, code: 'signup_closed' }, { status: 403, statusText: 'Forbidden' });
    expect(states).toEqual(['open', 'open', 'unknown', 'closed']);
  });
});

describe('Sign-up page (T140)', () => {
  let signup: jasmine.SpyObj<SignupService>;
  let auth: jasmine.SpyObj<AuthService>;
  let subject: { next: (o: any) => void; complete: () => void; subscribe: any };

  async function open(state: 'open' | 'closed' | 'unknown', trialDays: number | null = null) {
    subject = new Subject<SignupOutcome>() as any;
    signup = jasmine.createSpyObj<SignupService>('SignupService', ['ask', 'signUp']);
    signup.ask.and.returnValue(of({ state, trialDays }));
    signup.signUp.and.returnValue(subject as any);
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['getToken']);
    auth.getToken.and.returnValue('');
    await TestBed.configureTestingModule({
      declarations: [AuthLayoutComponent, SignupComponent],
      imports: [FormsModule, RouterTestingModule, SharedComponentsModule],
      providers: [
        { provide: SignupService, useValue: signup },
        { provide: AuthService, useValue: auth },
        { provide: MessageService, useValue: jasmine.createSpyObj<MessageService>('MessageService', ['clear', 'add']) },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(SignupComponent);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  const fill = (page: SignupComponent) => (page.model = { ...GOOD });

  it('open: the form, with the honeypot hidden from people and screen readers', async () => {
    const { el } = await open('open');
    expect(el.querySelector('h1')?.textContent).toContain('Start your free trial');
    expect(el.querySelector('form.signup')).not.toBeNull();
    const honeypot = el.querySelector<HTMLInputElement>('#signup_website')!;
    expect(honeypot.tabIndex).toBe(-1);
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(el.querySelector('a[href*="/auth/login"]')).not.toBeNull();
    expect(el.querySelector('a[href*="/auth/terms"]')).not.toBeNull();
  });

  it('the days of the trial come from the api; not said, no number is named', async () => {
    const { el } = await open('open', 30);
    expect(el.textContent).toContain('Free for 30 days. No card needed.');
    TestBed.resetTestingModule();
    const other = await open('open');
    expect(other.el.textContent).toContain('No card needed.');
    expect(other.el.textContent).not.toMatch(/Free for d+ days/);
  });

  it('the password rule reads as a hint: a tick when met, no control in front of it', async () => {
    const { fixture, page, el } = await open('open');
    const hint = () => el.querySelector('#signup_password_note')!;
    expect(hint().textContent?.trim()).toBe('At least 8 characters');
    expect(hint().querySelector('app-icon')).toBeNull();
    page.model.password = 'a-long-password-1';
    fixture.detectChanges();
    expect(hint().querySelector('app-icon')).not.toBeNull();
    expect(hint().classList).toContain('met');
  });

  it('a wrong field: nothing is sent and each field says why', async () => {
    const { fixture, page, el } = await open('open');
    page.model = { ...GOOD, mobile: '12345', state_code: '27', password: 'short', accept_terms: false };
    page.submit();
    fixture.detectChanges();
    expect(signup.signUp).not.toHaveBeenCalled();
    const lines = Array.from(el.querySelectorAll('form .error')).map((e) => e.textContent?.trim());
    expect(lines).toEqual([
      'A mobile number has 10 digits',
      'This GSTIN starts with 24, but a GSTIN of Maharashtra starts with 27. Check the state and the number.',
      'Password must be at least 8 characters. This one has 5.',
      'Tick the box to accept the terms',
    ]);
  });

  it('GSTIN is checked as it is typed, in capitals, and names the state when none was chosen', async () => {
    const { page } = await open('open');
    page.onGstin('24aaacc1206d1zn');
    expect(page.model.gstin).toBe('24AAACC1206D1ZN');
    expect(page.errorOf('gstin')).toContain('typing mistake');
    page.onGstin('24AAACC1206D1ZM');
    expect(page.errorOf('gstin')).toBe('');
    page.onGstinLeave();
    expect(page.model.state_code).toBe('24');
  });

  it('success: goes to the welcome', async () => {
    const { page } = await open('open');
    const router = TestBed.inject(Router);
    const go = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    fill(page);
    page.submit();
    expect(page.busy).toBeTrue();
    subject.next({ kind: 'signed_in' });
    subject.complete();
    expect(go).toHaveBeenCalledOnceWith('/welcome');
    expect(page.busy).toBeFalse();
  });

  it('422: the api\'s line beside each field; the second password is shown at Password; it goes when the field is changed', async () => {
    const { fixture, page, el } = await open('open');
    fill(page);
    page.submit();
    subject.next({ kind: 'fields', errors: { email: 'The e-mail is not valid.', confirm_password: 'The passwords differ.', terms_version: 'old', unknown_field: 'Something else.' } });
    subject.complete();
    fixture.detectChanges();
    expect(page.errorOf('email')).toBe('The e-mail is not valid.');
    expect(page.errorOf('password')).toBe('The passwords differ.');
    expect(page.errorOf('accept_terms')).toContain('Reload the page');
    expect(el.querySelector('.signup-error')?.textContent).toContain('Something else.');
    page.changed('email');
    expect(page.errorOf('email')).toBe('');
  });

  it('429 / 503 / used e-mail: the line above the form, "Try again" only when it can work', async () => {
    const { fixture, page, el } = await open('open');
    fill(page);
    page.submit();
    subject.next({ kind: 'refused', text: 'Too many tries from this connection. Wait 25 minutes, then try again. Nothing was created.', retry: false });
    subject.complete();
    fixture.detectChanges();
    expect(el.querySelector('.signup-error')?.textContent).toContain('Wait 25 minutes');
    expect(el.querySelector('.signup-error button')).toBeNull();
    page.error = { text: 'We cannot start new trials at this moment.', retry: true };
    fixture.detectChanges();
    expect(el.querySelector('.signup-error button')?.textContent).toContain('Try again');
  });

  it('check your e-mail: the api\'s words and the way to sign in', async () => {
    const { fixture, page, el } = await open('open');
    fill(page);
    page.submit();
    subject.next({ kind: 'check_email', message: 'Check your e-mail: we have sent a link.' });
    subject.complete();
    fixture.detectChanges();
    expect(el.querySelector('form.signup')).toBeNull();
    expect(el.textContent).toContain('Check your e-mail: we have sent a link.');
    expect(el.querySelector('a.btn[href*="/auth/login"]')).not.toBeNull();
  });

  it('closed (asked on opening): no sign-up form, the words of the closed state, nothing pretends to be sent', async () => {
    const { el } = await open('closed');
    expect(el.querySelector('h1')?.textContent).toContain('We are onboarding fabricators in small batches');
    expect(el.textContent).toContain('Leave your number and we will call you.');
    expect(el.querySelector('form')).toBeNull();
    expect(el.querySelector('button[type=submit]')).toBeNull();
    expect(signup.signUp).not.toHaveBeenCalled();
    // PLAN_CONTACT holds no WhatsApp number yet: no fields that go nowhere, and no "(to be added)" shown to a visitor
    if (!PLAN_CONTACT.whatsapp) {
      expect(el.querySelector('#lead_name')).toBeNull();
      expect(el.querySelector('a[href*="wa.me"]')).toBeNull();
    }
    expect(el.textContent).not.toContain('to be added');
  });

  it('closed after a submit (the question was not answered): the closed state keeps the name and the mobile', async () => {
    const { fixture, page, el } = await open('unknown');
    expect(el.querySelector('form.signup')).not.toBeNull();
    fill(page);
    page.submit();
    subject.next({ kind: 'closed' });
    subject.complete();
    fixture.detectChanges();
    expect(page.view).toBe('closed');
    expect(page.lead).toEqual({ name: 'Asha Patel', mobile: '9876543210', city: '' });
    expect(el.querySelector('form.signup')).toBeNull();
  });

  it('someone who is signed in is sent into the app', () => {
    signup = jasmine.createSpyObj<SignupService>('SignupService', ['ask', 'signUp']);
    signup.ask.and.returnValue(of({ state: 'open', trialDays: null }));
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['getToken']);
    auth.getToken.and.returnValue('tok');
    TestBed.configureTestingModule({
      declarations: [AuthLayoutComponent, SignupComponent],
      imports: [FormsModule, RouterTestingModule, SharedComponentsModule],
      providers: [
        { provide: SignupService, useValue: signup },
        { provide: AuthService, useValue: auth },
        { provide: MessageService, useValue: jasmine.createSpyObj<MessageService>('MessageService', ['clear']) },
      ],
    });
    const go = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    TestBed.createComponent(SignupComponent).detectChanges();
    expect(go).toHaveBeenCalledOnceWith('/');
    expect(signup.ask).not.toHaveBeenCalled();
  });
});

describe('Sign-up closed: the contact (T140)', () => {
  it('a line still holding "(to be added)" is not shown', () => {
    expect(contactLines(['Phone / WhatsApp: (to be added)', 'E-mail: hello@example.in', ' '])).toEqual(['E-mail: hello@example.in']);
  });

  it('the WhatsApp link is built from the number of PLAN_CONTACT and carries what the person typed; no number, no link', () => {
    expect(whatsappLink('', { name: 'Asha', mobile: '9876543210', city: 'Surat' })).toBe('');
    const link = whatsappLink('+91 90000 00000', { name: ' Asha Patel ', mobile: '+91 98765 43210', city: 'Surat' });
    expect(link.startsWith('https://wa.me/919000000000?text=')).toBeTrue();
    const text = decodeURIComponent(link.split('text=')[1]);
    expect(text).toContain('Name: Asha Patel');
    expect(text).toContain('Mobile: 9876543210');
    expect(text).toContain('City: Surat');
    expect(decodeURIComponent(whatsappLink('919000000000', { name: '', mobile: '', city: '' }).split('text=')[1])).not.toContain('Name:');
  });
});
