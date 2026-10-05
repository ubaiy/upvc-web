import { Component, ElementRef, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { finalize } from 'rxjs';

import { PLAN_CONTACT } from 'src/app/shared/configs/plans';
import { PRODUCT_NAME } from 'src/app/shared/configs/product';
import { GstState } from 'src/app/shared/configs/signup';
import { AuthService } from 'src/app/shared/services/auth.service';
import { PASSWORD_MIN, cleanGstin, cleanMobile, gstinError, mobileError, passwordError } from './signup-rules';
import { SignupForm, SignupService } from './signup.service';

export type SignupField = 'company_name' | 'name' | 'email' | 'mobile' | 'state_code' | 'gstin' | 'password' | 'accept_terms';

const FIELDS: SignupField[] = ['company_name', 'name', 'email', 'mobile', 'state_code', 'gstin', 'password', 'accept_terms'];

/** Where the field of a 422 is shown: the api's second password and the terms version have no field of their own. */
const SHOWN_AT: Record<string, SignupField> = { confirm_password: 'password', terms_version: 'accept_terms' };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The lines of PLAN_CONTACT that say something: a line still holding "(to be added)" is not shown to a visitor. */
export function contactLines(lines: string[]): string[] {
  return lines.filter((line) => line.trim() && !/\(to be added\)/i.test(line));
}

/**
 * A WhatsApp chat with us, opened with the person's own words already written. Nothing is sent
 * by the page: the person presses send in WhatsApp. '' when no number is known.
 */
export function whatsappLink(number: string, who: { name: string; mobile: string; city: string }): string {
  const digits = (number || '').replace(/\D/g, '');
  if (!digits) {
    return '';
  }
  const parts = [
    `I would like to try ${PRODUCT_NAME}.`,
    who.name.trim() ? `Name: ${who.name.trim()}` : '',
    cleanMobile(who.mobile) ? `Mobile: ${cleanMobile(who.mobile)}` : '',
    who.city.trim() ? `City: ${who.city.trim()}` : '',
  ].filter(Boolean);
  return `https://wa.me/${digits}?text=${encodeURIComponent(parts.join('\n'))}`;
}

/**
 * /signup (served as /auth/signup): a fabricator makes his company and starts a trial (card T140).
 * Closed installs (the default) show who to contact instead of a form that cannot be sent.
 */
@Component({
  selector: 'app-signup',
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.scss'],
})
export class SignupComponent implements OnInit {
  readonly product = PRODUCT_NAME;
  /** The api's public list of GST states; the web's own copy when the api has none (the service decides). */
  states: GstState[] = [];
  readonly passwordMin = PASSWORD_MIN;

  /** 'asking': the api has not yet said whether sign-up is open. */
  view: 'asking' | 'form' | 'closed' | 'check_email' = 'asking';

  model: SignupForm = {
    company_name: '',
    name: '',
    email: '',
    mobile: '',
    state_code: '',
    gstin: '',
    password: '',
    accept_terms: false,
    website: '',
  };

  /** The length of the trial as the api says it; not said, the page names no number. */
  trialDays: number | null = null;

  submitted = false;
  busy = false;
  showPassword = false;
  touched: Partial<Record<SignupField, boolean>> = {};
  /** The api's line for a field (422), until the field is changed. */
  fromApi: Partial<Record<SignupField, string>> = {};
  /** Above the form: a refusal that belongs to no field. */
  error: { text: string; retry: boolean } | null = null;
  /** The api's words when a confirmation e-mail is on its way. */
  checkEmail = '';

  /** The closed state: what the person would like us to know. Kept in the page only. */
  lead = { name: '', mobile: '', city: '' };
  readonly contact = contactLines(PLAN_CONTACT.lines);
  readonly hasWhatsapp = !!PLAN_CONTACT.whatsapp.replace(/\D/g, '');

  constructor(
    private signup: SignupService,
    private auth: AuthService,
    private router: Router,
    private messages: MessageService,
    private host: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    // Someone who is already signed in has a company.
    if (this.auth.getToken()) {
      this.router.navigateByUrl('/');
      return;
    }
    this.signup.states().subscribe((states) => (this.states = states));
    this.signup.ask().subscribe((opening) => {
      this.trialDays = opening.trialDays;
      this.view = opening.state === 'closed' ? 'closed' : 'form';
    });
  }

  /** The line under a field, or '' when the field is right or not yet worth a remark. */
  errorOf(field: SignupField): string {
    if (this.fromApi[field]) {
      return this.fromApi[field] as string;
    }
    const m = this.model;
    // GSTIN speaks while it is typed (a wrong state, a wrong character); the others wait until the field was left.
    if (field === 'gstin') {
      return gstinError(m.gstin, m.state_code, !(this.submitted || this.touched.gstin), this.states);
    }
    if (!this.submitted && !(this.touched[field] && this.hasValue(field))) {
      return '';
    }
    return this.rule(field);
  }

  private hasValue(field: SignupField): boolean {
    const value = this.model[field];
    return typeof value === 'boolean' ? value : !!value;
  }

  private rule(field: SignupField): string {
    const m = this.model;
    switch (field) {
      case 'company_name':
        return m.company_name.trim().length >= 2 ? '' : 'Enter the name of your company';
      case 'name':
        return m.name.trim().length >= 2 ? '' : 'Enter your name';
      case 'email':
        return !m.email.trim() ? 'Enter your e-mail' : EMAIL.test(m.email.trim()) ? '' : 'Enter a full e-mail, like name@company.in';
      case 'mobile':
        return mobileError(m.mobile);
      case 'state_code':
        return m.state_code ? '' : 'Choose your state';
      case 'gstin':
        return gstinError(m.gstin, m.state_code, false, this.states);
      case 'password':
        return passwordError(m.password);
      case 'accept_terms':
        return m.accept_terms ? '' : 'Tick the box to accept the terms';
    }
  }

  leave(field: SignupField): void {
    this.touched[field] = true;
  }

  changed(field: SignupField): void {
    delete this.fromApi[field];
    if (field === 'state_code') {
      delete this.fromApi.gstin;
    }
  }

  onGstin(value: string): void {
    this.model.gstin = cleanGstin(value);
    this.changed('gstin');
  }

  /** A GSTIN typed before the state was chosen names the state. */
  onGstinLeave(): void {
    this.leave('gstin');
    const code = this.model.gstin.slice(0, 2);
    if (!this.model.state_code && this.states.some((s) => s.code === code)) {
      this.model.state_code = code;
    }
  }

  /** Under the heading of the form. */
  get formLead(): string {
    const free = this.trialDays ? `Free for ${this.trialDays} days. No card needed.` : 'No card needed.';
    return `Create your company and price your first window today. ${free}`;
  }

  get whatsapp(): string {
    return whatsappLink(PLAN_CONTACT.whatsapp, this.lead);
  }

  submit(): void {
    this.submitted = true;
    if (this.busy) {
      return;
    }
    const wrong = FIELDS.find((field) => !!this.rule(field));
    if (wrong) {
      this.focus(wrong);
      return;
    }
    this.busy = true;
    this.error = null;
    this.fromApi = {};
    this.signup
      .signUp(this.model)
      .pipe(finalize(() => (this.busy = false)))
      .subscribe((outcome) => {
        this.messages.clear();
        switch (outcome.kind) {
          case 'signed_in':
            this.router.navigateByUrl('/welcome');
            break;
          case 'check_email':
            this.checkEmail = outcome.message;
            this.view = 'check_email';
            break;
          case 'closed':
            this.lead = { name: this.model.name, mobile: cleanMobile(this.model.mobile), city: '' };
            this.view = 'closed';
            break;
          case 'fields': {
            const general: string[] = [];
            for (const key of Object.keys(outcome.errors)) {
              const field = (SHOWN_AT[key] || key) as SignupField;
              if (key === 'terms_version') {
                this.fromApi.accept_terms = 'The terms have changed since this page was opened. Reload the page and try again.';
              } else if (FIELDS.includes(field)) {
                this.fromApi[field] = this.fromApi[field] || outcome.errors[key];
              } else {
                general.push(outcome.errors[key]);
              }
            }
            this.error = general.length ? { text: general.join(' '), retry: false } : null;
            const first = FIELDS.find((field) => !!this.fromApi[field]);
            if (first) {
              this.focus(first);
            }
            break;
          }
          default:
            this.error = { text: outcome.text, retry: outcome.retry };
        }
      });
  }

  private focus(field: SignupField): void {
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(`#signup_${field}`)?.focus());
  }
}
