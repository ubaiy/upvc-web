import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';

import { idOrNull } from '../api-result';

/**
 * Every receipt and refund, newest first; with ?customer=<id>, those of one
 * customer (the link from the customer page). A payment is recorded from an
 * order or a bill, so this page only lists.
 */
@Component({
  selector: 'app-payments-register',
  template: `
    <app-page-header
      title="Payments"
      [subtitle]="customerId ? 'Receipts and refunds of one customer' : 'Every receipt and refund, newest first'"
    >
      <ng-container ngProjectAs="[actions]">
        <a class="btn btn-secondary" *ngIf="customerId" routerLink="/payments">Show all customers</a>
        <a class="btn btn-secondary" routerLink="/payments/outstanding">Outstanding</a>
      </ng-container>
    </app-page-header>
    <app-account-payments [customerId]="customerId" [heading]="customerId ? 'Payments of this customer' : 'All payments'">
    </app-account-payments>
  `,
})
export class PaymentsRegisterComponent implements OnInit, OnDestroy {
  customerId: number | null = null;

  private query?: Subscription;

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.query = this.route.queryParamMap.subscribe((query) => (this.customerId = idOrNull(query.get('customer'))));
  }

  ngOnDestroy(): void {
    this.query?.unsubscribe();
  }
}
