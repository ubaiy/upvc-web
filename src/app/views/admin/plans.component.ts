import { Component, OnInit } from '@angular/core';

import { Plan, apiError, featureList } from './admin.models';
import { AdminService } from './admin.service';

/** The plans as the api holds them: price, seats, what each gives, and how many companies are on it. Read only. */
@Component({
  selector: 'app-admin-plans',
  template: `
    <app-page-header title="Plans" subtitle="What each plan costs and gives. A company's own limits are set on its page."></app-page-header>

    <app-callout tone="warn" *ngIf="state === 'error'">
      {{ error }}
      <button action type="button" class="btn btn-secondary btn-sm" (click)="load()">Try again</button>
    </app-callout>

    <section class="card" *ngIf="state !== 'error'" [attr.aria-busy]="state === 'loading'">
      <p class="card-pad muted" role="status" *ngIf="state === 'loading'">Loading plans</p>
      <p class="card-pad muted" *ngIf="state === 'ready' && !plans.length">There are no plans.</p>
      <table class="table" *ngIf="state === 'ready' && plans.length">
        <thead>
          <tr>
            <th scope="col">Plan</th>
            <th scope="col">Price a month, before GST</th>
            <th scope="col">Seats</th>
            <th scope="col">What it gives</th>
            <th scope="col">Days of grace</th>
            <th scope="col">Companies</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let plan of plans; trackBy: trackById">
            <td>
              <span class="title">{{ plan.name }}</span>
              <span class="badge plain" *ngIf="!plan.is_active">Not offered</span>
              <div class="faint tiny">{{ plan.code }}</div>
            </td>
            <td class="num">{{ plan.price | inr }}</td>
            <td class="num">{{ plan.seats }}</td>
            <td>
              <div *ngFor="let line of featureList(plan.features)">{{ line }}</div>
            </td>
            <td class="num">{{ plan.grace_days }}</td>
            <td class="num">{{ plan.companies ?? 0 }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  `,
})
export class PlansComponent implements OnInit {
  readonly featureList = featureList;

  state: 'loading' | 'ready' | 'error' = 'loading';
  error = '';
  plans: Plan[] = [];

  constructor(private admin: AdminService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state = 'loading';
    this.admin.plans().subscribe({
      next: (plans) => {
        this.plans = plans || [];
        this.state = 'ready';
      },
      error: (err) => {
        this.error = apiError(err);
        this.state = 'error';
      },
    });
  }

  trackById(_: number, plan: Plan): number {
    return plan.id;
  }
}
