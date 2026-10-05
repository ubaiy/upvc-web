import { formatDate } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';

import { formatInr } from '../../shared/pipes/inr.pipe';
import {
  AdminCompany,
  FeatureMap,
  PAYMENT_MODES,
  PaymentMode,
  Plan,
  apiError,
  attentionText,
  daysText,
  endsLabel,
  featureList,
  modeLabel,
  seatsText,
  stateName,
  statusBadge,
  statusLabel,
} from './admin.models';
import { ActivateRequest, AdminService } from './admin.service';

export type CompanyAction = 'activate' | 'plan' | 'trial' | 'limits' | 'suspend' | 'reactivate';

const TITLES: Record<CompanyAction, string> = {
  activate: 'Record a payment and activate',
  plan: 'Change plan',
  trial: 'Extend the trial',
  limits: 'Seats and 3D view',
  suspend: 'Suspend this company',
  reactivate: 'Reactivate this company',
};

const CONFIRM_LABELS: Record<CompanyAction, string> = {
  activate: 'Yes, record and activate',
  plan: 'Yes, change the plan',
  trial: 'Yes, extend the trial',
  limits: 'Yes, save the limits',
  suspend: 'Yes, suspend',
  reactivate: 'Yes, reactivate',
};

/**
 * One company: what it is on, what it uses, its people and its payments, and the
 * things the admin can do to it. Every action is two steps: fill in, then read in
 * plain words what will happen and say yes. The answer of the api is what the page
 * shows afterwards; a refusal is shown in the api's own words.
 */
@Component({
  selector: 'app-admin-company',
  templateUrl: './company.component.html',
  styles: [
    `
      .facts { grid-template-columns: minmax(0, auto) minmax(0, 1fr); gap: var(--s-3) var(--s-4); }
      .actions { display: flex; flex-wrap: wrap; gap: var(--s-2); }
      .will { margin: 0; padding-inline-start: var(--s-5); display: grid; gap: var(--s-2); color: var(--c-text); }
      .attention { color: var(--c-warning); }
      :host > section, :host > .grid-2 { margin-block-end: var(--s-5); }
      app-callout { margin-block-end: var(--s-4); }
      @media (max-width: 640px) {
        .actions .btn { flex: 1 1 100%; }
      }
    `,
  ],
})
export class CompanyComponent implements OnInit {
  readonly modes = PAYMENT_MODES;
  readonly statusLabel = statusLabel;
  readonly statusBadge = statusBadge;
  readonly endsLabel = endsLabel;
  readonly seatsText = seatsText;
  readonly attentionText = attentionText;
  readonly featureList = featureList;
  readonly modeLabel = modeLabel;
  readonly stateName = stateName;

  id = 0;
  state: 'loading' | 'ready' | 'error' = 'loading';
  error = '';
  company: AdminCompany | null = null;
  plans: Plan[] = [];

  /** What the last action did, in the api's figures. Stays on the page until the next action. */
  result = '';

  action: CompanyAction | null = null;
  step: 'form' | 'confirm' = 'form';
  busy = false;
  /** A field that is not filled in right (ours), or the refusal of the api (its own words). */
  actionError = '';

  form = {
    plan: '',
    note: '',
    months: 1 as number | null,
    amount: null as number | null,
    mode: 'upi' as PaymentMode,
    reference: '',
    paidOn: '',
    from: '',
    days: 14 as number | null,
    seats: null as number | null,
    threeD: 'plan' as 'plan' | 'on' | 'off',
  };

  constructor(private route: ActivatedRoute, private admin: AdminService) {}

  ngOnInit(): void {
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.load();
    // For "change plan" and "activate". The page works without them: the dialogs then offer the present plan only.
    this.admin.plans().subscribe({ next: (plans) => (this.plans = plans || []), error: () => {} });
  }

  load(): void {
    this.state = this.company ? 'ready' : 'loading';
    this.admin.company(this.id).subscribe({
      next: (company) => {
        this.company = company;
        this.state = 'ready';
      },
      error: (err) => {
        this.error = err?.status === 404 ? 'There is no company with this number.' : apiError(err);
        this.state = this.company ? 'ready' : 'error';
      },
    });
  }

  get title(): string {
    return this.action ? TITLES[this.action] : '';
  }

  get confirmLabel(): string {
    return this.action ? CONFIRM_LABELS[this.action] : '';
  }

  get dialogOpen(): boolean {
    return this.action !== null;
  }

  set dialogOpen(open: boolean) {
    if (!open) {
      this.close();
    }
  }

  /** The plans a company can be put on: those still offered, and the one it is on. */
  get planChoices(): Plan[] {
    const current = this.company?.subscription.plan;
    const offered = this.plans.filter((plan) => plan.is_active || plan.code === current?.code);
    return offered.length || !current ? offered : [current];
  }

  /** What the company has on top of its plan. The api answers the result, not the override itself: a key that differs from the plan is one. */
  get featureOverride(): FeatureMap {
    const subscription = this.company?.subscription;
    const plan = subscription?.plan?.features || {};
    const override: FeatureMap = {};
    for (const [key, value] of Object.entries(subscription?.features || {})) {
      if (plan[key] !== value) {
        override[key] = value;
      }
    }
    return override;
  }

  open(action: CompanyAction): void {
    const subscription = this.company?.subscription;
    if (!subscription) {
      return;
    }
    const override = this.featureOverride;
    this.form = {
      plan: subscription.plan?.code ?? '',
      note: '',
      months: 1,
      amount: null,
      mode: 'upi',
      reference: '',
      paidOn: subscription.today,
      from: '',
      days: 14,
      seats: subscription.seats.override,
      threeD: 'feature_3d' in override ? (override['feature_3d'] ? 'on' : 'off') : 'plan',
    };
    this.action = action;
    this.step = 'form';
    this.actionError = '';
  }

  close(): void {
    if (!this.busy) {
      this.action = null;
      this.actionError = '';
    }
  }

  back(): void {
    this.step = 'form';
    this.actionError = '';
  }

  /** From the form to "this is what will happen". */
  next(): void {
    this.actionError = this.invalid();
    if (!this.actionError) {
      this.step = 'confirm';
    }
  }

  /** In plain words, what saying yes does. One sentence a line. */
  get willHappen(): string[] {
    const company = this.company;
    if (!company || !this.action) {
      return [];
    }
    const subscription = company.subscription;
    const name = company.name;
    const form = this.form;
    const plan = this.planOf(form.plan);
    const lines: string[] = [];
    switch (this.action) {
      case 'activate': {
        const reference = form.reference.trim() ? `, reference ${form.reference.trim()}` : '';
        lines.push(
          `A payment of ${formatInr(form.amount)} by ${modeLabel(form.mode)}, received on ${day(form.paidOn)}${reference}, is recorded. It cannot be removed later.`
        );
        lines.push(
          `${name} becomes active on ${plan?.name ?? form.plan} for ${monthsText(form.months as number)}, ` +
            (form.from ? `starting ${day(form.from)}.` : 'starting the day after the paid period that is still running, or today if none is.')
        );
        if (plan && plan.code !== subscription.plan?.code) {
          lines.push(`Its plan changes from ${subscription.plan?.name ?? 'no plan'} to ${plan.name}.`);
        }
        if (subscription.status === 'suspended') {
          lines.push('It is suspended and stays read-only until you reactivate it.');
        }
        break;
      }
      case 'plan':
        lines.push(`${name} moves from ${subscription.plan?.name ?? 'no plan'} to ${plan?.name ?? form.plan}, from its next request.`);
        if (plan) {
          lines.push(`${plan.name}: ${formatInr(plan.price)} a month before GST, ${plan.seats} seats. ${featureList(plan.features).join(', ')}.`);
          if (subscription.seats.override === null && subscription.seats.used > plan.seats) {
            lines.push(`It has ${subscription.seats.used} people today, more than the ${plan.seats} seats of ${plan.name}. Nobody is removed.`);
          }
        }
        lines.push('Its dates and its payments stay as they are.');
        break;
      case 'trial':
        lines.push(
          `${name} is on trial for ${daysText(form.days as number)} more, counted from today or from the end of its trial when that is later.`
        );
        if (subscription.stored_status === 'active') {
          lines.push('This company is on a paid period now. It goes back to trial, and the trial date decides its access from then on.');
        }
        break;
      case 'limits': {
        const changes = this.limitChanges();
        if ('seats_override' in changes) {
          lines.push(
            changes.seats_override === null
              ? `Seats go back to the plan's ${subscription.seats.plan ?? 'own number'}.`
              : `${name} may have ${changes.seats_override} people, whatever its plan says. It has ${subscription.seats.used} today.`
          );
        }
        if ('features_override' in changes) {
          lines.push(
            form.threeD === 'plan'
              ? `The 3D view follows the plan again (${subscription.plan?.features?.['feature_3d'] ? 'on' : 'off'}).`
              : `The 3D view is switched ${form.threeD} for ${name}, whatever its plan says.`
          );
        }
        break;
      }
      case 'suspend':
        lines.push(`${name} becomes read-only at once. Its people can still sign in, view and download everything.`);
        lines.push('Nothing is deleted. A payment does not lift it: only "Reactivate" does.');
        break;
      case 'reactivate':
        lines.push(`The suspension of ${name} is lifted.`);
        lines.push('Its access then follows its dates again: full if the trial or paid period is running, read-only if it has run out.');
        break;
    }
    if (form.note.trim()) {
      lines.push(`Note kept with the company: "${form.note.trim()}"`);
    }
    return lines;
  }

  /** Yes was pressed: send it, show the api's answer. */
  send(): void {
    const action = this.action;
    if (!action || this.busy) {
      return;
    }
    this.busy = true;
    this.actionError = '';
    this.request(action).subscribe({
      next: (answer) => {
        this.busy = false;
        this.action = null;
        this.result = this.resultOf(action, answer);
        // Most answers carry the company without its people and payments: keep those, then read it again.
        this.company = { ...this.company, ...answer, users: this.company?.users, payments: this.company?.payments } as AdminCompany;
        this.load();
      },
      error: (err) => {
        this.busy = false;
        this.actionError = apiError(err);
      },
    });
  }

  /** A payment carries the code of its plan; its name is nicer to read. */
  planName(code: string): string {
    return this.planOf(code)?.name ?? code;
  }

  trackById(_: number, row: { id: number }): number {
    return row.id;
  }

  private request(action: CompanyAction): Observable<AdminCompany> {
    const form = this.form;
    const note = form.note;
    switch (action) {
      case 'activate': {
        const body: ActivateRequest = {
          months: form.months as number,
          amount_paise: Math.round((form.amount as number) * 100),
          mode: form.mode,
        };
        if (form.plan) {
          body.plan = form.plan;
        }
        if (form.reference.trim()) {
          body.reference = form.reference.trim();
        }
        if (form.paidOn) {
          body.paid_on = form.paidOn;
        }
        if (form.from) {
          body.from = form.from;
        }
        if (note.trim()) {
          body.note = note.trim();
        }
        return this.admin.activate(this.id, body);
      }
      case 'plan':
        return this.admin.changePlan(this.id, form.plan, note);
      case 'trial':
        return this.admin.extendTrial(this.id, form.days as number, note);
      case 'limits':
        return this.admin.setOverrides(this.id, this.limitChanges(), note);
      case 'suspend':
        return this.admin.suspend(this.id, note);
      case 'reactivate':
        return this.admin.reactivate(this.id, note);
    }
  }

  /** Only what the form changes is sent: the api leaves a key that is not sent as it is. */
  private limitChanges(): { seats_override?: number | null; features_override?: FeatureMap | null } {
    const subscription = this.company?.subscription;
    const changes: { seats_override?: number | null; features_override?: FeatureMap | null } = {};
    const seats = this.form.seats === null || (this.form.seats as unknown) === '' ? null : Number(this.form.seats);
    if (seats !== (subscription?.seats.override ?? null)) {
      changes.seats_override = seats;
    }
    const before = this.featureOverride;
    const was = 'feature_3d' in before ? (before['feature_3d'] ? 'on' : 'off') : 'plan';
    if (this.form.threeD !== was) {
      // The api replaces the whole override map: the other keys go along.
      const { feature_3d, ...others } = before;
      const map: FeatureMap = this.form.threeD === 'plan' ? others : { ...others, feature_3d: this.form.threeD === 'on' };
      changes.features_override = Object.keys(map).length ? map : null;
    }
    return changes;
  }

  private invalid(): string {
    const form = this.form;
    switch (this.action) {
      case 'activate':
        if (!whole(form.months) || (form.months as number) < 1 || (form.months as number) > 60) {
          return 'Enter the months paid for: a whole number from 1 to 60.';
        }
        if (form.amount === null || (form.amount as unknown) === '' || !Number.isFinite(Number(form.amount)) || Number(form.amount) < 0) {
          return 'Enter the amount received, in rupees. Enter 0 if nothing was paid.';
        }
        return '';
      case 'plan':
        if (!form.plan) {
          return 'Choose a plan.';
        }
        return form.plan === this.company?.subscription.plan?.code ? 'The company is on this plan already. Choose another one.' : '';
      case 'trial':
        return whole(form.days) && (form.days as number) >= 1 && (form.days as number) <= 365
          ? ''
          : 'Enter the days to add: a whole number from 1 to 365.';
      case 'limits': {
        const seats = form.seats;
        if (seats !== null && (seats as unknown) !== '' && (!whole(seats) || (seats as number) < 1)) {
          return 'Enter the seats as a whole number, 1 or more. Leave it empty to use the plan\'s seats.';
        }
        return Object.keys(this.limitChanges()).length ? '' : 'Nothing is changed yet.';
      }
      default:
        return '';
    }
  }

  private resultOf(action: CompanyAction, answer: AdminCompany): string {
    const subscription = answer.subscription;
    const name = answer.name;
    switch (action) {
      case 'activate': {
        const payment = answer.payment;
        const period = payment ? `, paid from ${day(payment.period_from)} to ${day(payment.period_to)}` : '';
        const still = subscription.status === 'suspended' ? ' It is still suspended.' : '';
        return `Payment recorded. ${name} is on ${subscription.plan?.name ?? 'its plan'}${period}.${still}`;
      }
      case 'plan':
        return `${name} is now on ${subscription.plan?.name ?? 'the new plan'}: ${seatsText(subscription)} seats used.`;
      case 'trial':
        return `${name} is on trial until ${day(subscription.trial_ends_at)}.`;
      case 'limits':
        return `Limits saved. Seats used: ${seatsText(subscription)}. 3D view: ${subscription.features?.['feature_3d'] ? 'on' : 'off'}.`;
      case 'suspend':
        return `${name} is suspended and read-only.`;
      case 'reactivate':
        return `${name} is reactivated. Its status is now: ${statusLabel(subscription.status)}.`;
    }
  }

  private planOf(code: string): Plan | undefined {
    const current = this.company?.subscription.plan;
    return this.plans.find((plan) => plan.code === code) ?? (current?.code === code ? current : undefined);
  }
}

function whole(value: unknown): boolean {
  return value !== null && value !== '' && Number.isInteger(Number(value));
}

function monthsText(months: number): string {
  return months === 1 ? '1 month' : `${months} months`;
}

/** "5 Oct 2026" from the api's YYYY-MM-DD. */
function day(value: string | null | undefined): string {
  return value ? formatDate(value, 'd MMM y', 'en-US') : 'no date';
}
