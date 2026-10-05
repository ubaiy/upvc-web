import { Component, OnInit } from '@angular/core';

import {
  AdminCompany,
  STATUSES,
  SubscriptionStatus,
  apiError,
  attentionRank,
  attentionText,
  byAttention,
  byExpiry,
  endsLabel,
  seatsText,
  statusBadge,
  statusLabel,
} from './admin.models';
import { AdminService } from './admin.service';

type Order = 'attention' | 'ending' | 'name';

/**
 * Every customer company on one page: plan, status, seats, and the day its trial or paid
 * period ends. The ones that need the admin (locked, payment due, ending within a week)
 * are first. Search and the filters work on the loaded list, so they answer at once.
 */
@Component({
  selector: 'app-admin-companies',
  templateUrl: './companies.component.html',
  styles: [
    `
      .filters { flex-wrap: wrap; }
      .filters .select { width: auto; min-width: 150px; }
      .attention { color: var(--c-warning); }
      .attention.is-danger { color: var(--c-danger); }
      .sk-row { display: flex; gap: var(--s-4); padding: var(--s-4); border-block-end: 1px solid var(--c-border); }
      .sk-row .skeleton { height: 14px; flex: 1; }
      @media (max-width: 640px) {
        .filters .select { flex: 1 1 45%; min-width: 0; }
      }
    `,
  ],
})
export class CompaniesComponent implements OnInit {
  readonly statuses = STATUSES;
  readonly statusLabel = statusLabel;
  readonly statusBadge = statusBadge;
  readonly endsLabel = endsLabel;
  readonly seatsText = seatsText;
  readonly attentionText = attentionText;
  readonly placeholders = [1, 2, 3, 4];

  state: 'loading' | 'ready' | 'error' = 'loading';
  error = '';
  companies: AdminCompany[] = [];
  rows: AdminCompany[] = [];
  /** The plans the loaded companies are on, for the filter. */
  plans: { code: string; name: string }[] = [];

  search = '';
  status: SubscriptionStatus | '' = '';
  plan = '';
  order: Order = 'attention';

  constructor(private admin: AdminService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state = 'loading';
    this.admin.companies().subscribe({
      next: (companies) => {
        this.companies = companies || [];
        this.plans = plansOf(this.companies);
        this.state = 'ready';
        this.apply();
      },
      error: (err) => {
        this.error = apiError(err);
        this.state = 'error';
      },
    });
  }

  apply(): void {
    const text = this.search.trim().toLowerCase();
    const sort = this.order === 'attention' ? byAttention : this.order === 'ending' ? byExpiry : byName;
    this.rows = this.companies
      .filter(
        (company) =>
          (!this.status || company.subscription.status === this.status) &&
          (!this.plan || company.subscription.plan?.code === this.plan) &&
          (!text || `${company.name} ${company.email ?? ''} ${company.city ?? ''}`.toLowerCase().includes(text))
      )
      .sort(sort);
  }

  clear(): void {
    this.search = '';
    this.status = '';
    this.plan = '';
    this.apply();
  }

  get filtered(): boolean {
    return !!(this.search.trim() || this.status || this.plan);
  }

  /** "2 need attention" under the title. */
  get subtitle(): string {
    if (this.state !== 'ready') {
      return '';
    }
    const total = this.companies.length;
    const urgent = this.companies.filter((company) => attentionRank(company.subscription) <= 2).length;
    const count = total === 1 ? '1 company' : `${total} companies`;
    return urgent ? `${count}, ${urgent} ${urgent === 1 ? 'needs' : 'need'} attention` : count;
  }

  /** Locked and payment due are red; ending soon is amber. */
  urgent(company: AdminCompany): boolean {
    return attentionRank(company.subscription) <= 1;
  }

  trackById(_: number, company: AdminCompany): number {
    return company.id;
  }
}

function byName(a: AdminCompany, b: AdminCompany): number {
  return a.name.localeCompare(b.name);
}

function plansOf(companies: AdminCompany[]): { code: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const company of companies) {
    const plan = company.subscription.plan;
    if (plan && !seen.has(plan.code)) {
      seen.set(plan.code, plan.name);
    }
  }
  return Array.from(seen, ([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
}
