import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { SharedModule } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { Subscription } from 'rxjs';

import { SubscriptionInfo, bannerFor, plainDate } from 'src/app/shared/access/access.models';
import { AccessService } from 'src/app/shared/access/access.service';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { PLAN_CONTACT, PLAN_OFFERS, PlanOffer } from 'src/app/shared/configs/plans';
import { PlansService } from '../plans.service';

const STATUS_WORDS: Record<string, string> = {
  trial: 'Free trial',
  active: 'Active',
  grace: 'Payment due',
  locked: 'Ended, read-only',
  suspended: 'Suspended, read-only',
};

/** The offers with the company's own plan drawn from GET subscription, so its figures are the api's. */
export function offersFor(sub: SubscriptionInfo | null, offers: PlanOffer[] = PLAN_OFFERS): PlanOffer[] {
  const own = sub?.plan;
  if (!own) {
    return offers;
  }
  const limit = (key: string, fallback: number | null): number | null => {
    const value = own.features?.[key];
    return typeof value === 'number' ? value : value === null ? null : fallback;
  };
  const drawn = (offer: PlanOffer): PlanOffer => ({
    ...offer,
    name: own.name,
    price: own.price,
    seats: own.seats ?? offer.seats,
    quotationsPerMonth: limit('max_quotations_per_month', offer.quotationsPerMonth),
    designTemplates: limit('max_design_templates', offer.designTemplates),
    has3d: own.features?.['feature_3d'] === true,
  });
  return offers.some((offer) => offer.code === own.code)
    ? offers.map((offer) => (offer.code === own.code ? drawn(offer) : offer))
    : [...offers, drawn({ code: own.code, name: own.name, price: own.price, seats: own.seats ?? 0, quotationsPerMonth: null, designTemplates: null, has3d: false })];
}

/** "Trial ends on 19 Oct 2026 (14 days left)" and its like, from the dates the api sends. */
export function periodLine(sub: SubscriptionInfo): string {
  const left = sub.days_left === null || sub.days_left === undefined ? '' : sub.days_left === 0 ? ' (today is the last day)' : ` (${sub.days_left} ${sub.days_left === 1 ? 'day' : 'days'} left)`;
  switch (sub.status) {
    case 'trial':
      return sub.ends_on ? `Free trial until ${plainDate(sub.ends_on)}${left}` : 'Free trial';
    case 'active':
      return sub.ends_on ? `Paid until ${plainDate(sub.ends_on)}${left}` : 'No end date';
    case 'grace':
      return `Payment was due on ${plainDate(sub.ends_on)}. Read-only after ${plainDate(sub.grace_ends_on)}${left}`;
    case 'locked':
      return sub.ends_on ? `Ended on ${plainDate(sub.ends_on)}. The account is read-only` : 'The account is read-only';
    default:
      return 'The account is suspended and read-only';
  }
}

/**
 * Settings → Plan (card T117): the company's plan, status, dates and seats as GET subscription says,
 * the three plans side by side, and how to buy or change one. Payment is by hand: the button opens
 * instructions to contact us (shared/configs/plans.ts) and nothing here takes a payment.
 */
@Component({
  selector: 'app-settings-plan',
  standalone: true,
  imports: [CommonModule, DialogModule, SharedModule, SharedComponentsModule],
  templateUrl: './plan-tab.component.html',
  styleUrls: ['../settings-tab.scss', './plan-tab.component.scss'],
})
export class PlanTabComponent implements OnInit, OnDestroy {
  readonly contact = PLAN_CONTACT;

  state: 'loading' | 'error' | 'ready' = 'loading';
  sub: SubscriptionInfo | null = null;
  /** The plans of GET plans (or the web's copy when the api has no such route); the company's own is drawn from GET subscription. */
  offers: PlanOffer[] = [];
  /** 'loading' until GET plans has answered; 'failed': only the company's own plan is known. */
  plans: 'loading' | 'api' | 'fallback' | 'failed' = 'loading';
  private available: PlanOffer[] = [];
  /** The plan the open instructions are about. */
  chosen: PlanOffer | null = null;

  private subscription?: Subscription;
  private plansRequest?: Subscription;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private access: AccessService, private plansService: PlansService) {}

  ngOnInit(): void {
    this.subscription = this.access.state$.subscribe((state) => {
      if (state.subscription) {
        this.sub = state.subscription;
        this.offers = offersFor(this.sub, this.available);
        this.state = 'ready';
        clearTimeout(this.timer);
      }
    });
    this.load();
    this.loadPlans();
  }

  /** The plans to choose from: GET plans; the web's copy only when that route is not there (404). */
  loadPlans(): void {
    this.plans = 'loading';
    this.plansRequest?.unsubscribe();
    this.plansRequest = this.plansService.list().subscribe((list) => {
      this.plans = list.source;
      this.available = list.offers;
      this.offers = offersFor(this.sub, this.available);
    });
  }

  ngOnDestroy(): void {
    this.plansRequest?.unsubscribe();
    this.subscription?.unsubscribe();
    clearTimeout(this.timer);
  }

  load(): void {
    if (!this.sub) {
      this.state = 'loading';
      // No answer in a while: say so, with a way to ask again.
      clearTimeout(this.timer);
      this.timer = setTimeout(() => (this.state = this.sub ? 'ready' : 'error'), 8000);
    }
    this.access.refreshSubscription();
  }

  get statusWords(): string {
    return this.sub ? STATUS_WORDS[this.sub.status] ?? this.sub.status : '';
  }

  get period(): string {
    return this.sub ? periodLine(this.sub) : '';
  }

  get attention(): string {
    return this.sub && this.sub.status !== 'trial' ? bannerFor(this.sub)?.text ?? '' : '';
  }

  get seats(): string {
    const seats = this.sub?.seats;
    if (!seats) {
      return '';
    }
    return seats.allowed === null || seats.allowed === undefined ? `${seats.used} used, no limit` : `${seats.used} of ${seats.allowed} used`;
  }

  isCurrent(offer: PlanOffer): boolean {
    return !!this.sub?.plan && this.sub.plan.code === offer.code;
  }

  /** The current plan is renewed or bought after a trial; another one is an upgrade or a change. */
  buttonLabel(offer: PlanOffer): string {
    if (this.isCurrent(offer)) {
      return this.sub?.status === 'trial' ? 'Buy this plan' : 'Renew';
    }
    return this.sub?.plan && offer.price > this.sub.plan.price ? 'Upgrade' : 'Change to this plan';
  }

  limit(value: number | null): string {
    return value === null ? 'No limit' : String(value);
  }
}
