import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { AdminCompany, GST_STATES, Plan, apiError, daysText, whole } from './admin.models';
import { AdminService, CreateCompanyRequest } from './admin.service';

/**
 * "New company" on the companies page (card T146; api phase-56 G2): the platform admin makes a
 * company and its owner by hand. It starts with the example catalogue unless "empty" is chosen.
 * Two steps like every action of the panel: fill in, read what will happen, say yes.
 */
@Component({
  selector: 'app-admin-new-company',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SharedComponentsModule],
  templateUrl: './new-company.component.html',
  styles: [
    `
      :host { display: block; margin-block-end: var(--s-5); }
      .will { margin: 0; padding-inline-start: var(--s-5); display: grid; gap: var(--s-2); }
      .choice { display: flex; gap: var(--s-2); align-items: flex-start; }
      .choice input { margin-block-start: 3px; }
      .foot { display: flex; gap: var(--s-2); justify-content: flex-end; flex-wrap: wrap; }
      .password { font-family: var(--font-mono, monospace); user-select: all; }
    `,
  ],
})
export class NewCompanyComponent {
  /** A company was made: the list reads itself again. */
  @Output() created = new EventEmitter<AdminCompany>();

  readonly states = GST_STATES;
  open = false;
  step: 'form' | 'confirm' = 'form';
  busy = false;
  error = '';
  plans: Plan[] = [];
  /** The company just made; its owner's password is in this answer only. */
  made: AdminCompany | null = null;

  form = this.empty();

  constructor(private admin: AdminService) {}

  start(): void {
    this.form = this.empty();
    this.made = null;
    this.error = '';
    this.step = 'form';
    this.open = true;
    this.admin.plans().subscribe({
      next: (plans) => {
        this.plans = (plans || []).filter((plan) => plan.is_active);
        this.form.plan = this.form.plan || this.plans[0]?.code || '';
      },
      error: (err) => (this.error = apiError(err)),
    });
  }

  close(): void {
    if (!this.busy) {
      this.open = false;
    }
  }

  next(): void {
    this.error = this.invalid();
    if (!this.error) {
      this.step = 'confirm';
    }
  }

  back(): void {
    this.step = 'form';
    this.error = '';
  }

  get willHappen(): string[] {
    const form = this.form;
    const plan = this.plans.find((row) => row.code === form.plan);
    const state = this.states.find((row) => row.code === form.state)?.name;
    return [
      `The company "${form.name.trim()}"${state ? ` (${state})` : ''} is created on ${plan?.name ?? form.plan} with a free trial of ${daysText(Number(form.days))}.`,
      `${form.ownerName.trim()} (${form.ownerEmail.trim().toLowerCase()}) is its owner. Their password is shown to you once, here, after the yes.`,
      form.catalogue === 'none'
        ? 'It starts empty: no profiles and no rates. Its owner cannot price a window until the catalogue is filled.'
        : 'It starts with the example catalogue and example rates, so its owner can price a window on the first day. The app tells them the rates are examples until they say the rates are their own.',
      'A company cannot be deleted from this panel.',
      ...(form.note.trim() ? [`Note kept with the company: "${form.note.trim()}"`] : []),
    ];
  }

  send(): void {
    if (this.busy) {
      return;
    }
    const form = this.form;
    const body: CreateCompanyRequest = {
      company: { name: form.name.trim(), state_code: form.state },
      owner: { name: form.ownerName.trim(), email: form.ownerEmail.trim().toLowerCase() },
      plan: form.plan,
      trial_days: Number(form.days),
      starter_catalogue: form.catalogue,
    };
    if (form.note.trim()) {
      body.note = form.note.trim();
    }
    this.busy = true;
    this.error = '';
    this.admin.createCompany(body).subscribe({
      next: (company) => {
        this.busy = false;
        this.open = false;
        this.made = company;
        this.created.emit(company);
      },
      error: (err) => {
        this.busy = false;
        this.error = apiError(err);
      },
    });
  }

  private invalid(): string {
    const form = this.form;
    if (form.name.trim().length < 2) {
      return 'Enter the name of the company.';
    }
    if (!form.state) {
      return 'Choose the state of the company: GST on its documents depends on it.';
    }
    if (!form.ownerName.trim()) {
      return 'Enter the name of the owner.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail.trim())) {
      return 'Enter the e-mail address the owner signs in with.';
    }
    if (!form.plan) {
      return 'Choose a plan.';
    }
    return whole(form.days) && Number(form.days) >= 1 && Number(form.days) <= 365 ? '' : 'Enter the days of free trial: a whole number from 1 to 365.';
  }

  private empty() {
    return {
      name: '',
      state: '',
      ownerName: '',
      ownerEmail: '',
      plan: '',
      days: 14 as number | null,
      catalogue: 'classic_example' as 'classic_example' | 'none',
      note: '',
    };
  }
}
