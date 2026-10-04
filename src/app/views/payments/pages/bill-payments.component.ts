import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';

import { Crumb } from '../../../shared/components/page-header/page-header.component';
import { idOrNull } from '../api-result';
import { Account } from '../payments.model';

/**
 * The payments of one bill: what "Record payment" in the bills list opens
 * (with ?record=1 the dialog is already open). A bill and the order of the
 * same quotation share one balance, so an advance taken on the order shows
 * here too.
 */
@Component({
  selector: 'app-bill-payments',
  template: `
    <app-page-header [title]="title" [subtitle]="account?.customerName" [crumbs]="crumbs">
      <ng-container ngProjectAs="[actions]" *ngIf="account as acc">
        <a class="btn btn-secondary" *ngIf="acc.order" [routerLink]="['/orders', acc.order.id]">Open order</a>
        <a class="btn btn-secondary" *ngIf="acc.quotationId" [routerLink]="['/quotation/detail', acc.quotationId]"
          >Open quotation</a
        >
      </ng-container>
    </app-page-header>
    <app-account-payments
      *ngIf="billId"
      [billId]="billId"
      [primaryAction]="true"
      [openRecord]="openRecord"
      (loaded)="account = $event"
      (changed)="account = $event || account"
    ></app-account-payments>
    <app-callout tone="warn" *ngIf="!billId">
      This address has no bill in it.
      <a action class="btn btn-secondary btn-sm" routerLink="/bills">Go to bills</a>
    </app-callout>
  `,
})
export class BillPaymentsComponent implements OnInit, OnDestroy {
  billId: number | null = null;
  openRecord = false;
  account: Account | null = null;

  private params?: Subscription;

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.params = combineLatest([this.route.paramMap, this.route.queryParamMap]).subscribe(([params, query]) => {
      const billId = idOrNull(params.get('billId'));
      if (billId !== this.billId) {
        this.account = null;
      }
      this.billId = billId;
      this.openRecord = query.has('record');
    });
  }

  ngOnDestroy(): void {
    this.params?.unsubscribe();
  }

  get title(): string {
    return this.account?.bill?.number ? `Payments for ${this.account.bill.number}` : 'Payments for a bill';
  }

  get crumbs(): Crumb[] {
    return [{ label: 'Bills', link: '/bills' }, { label: this.account?.bill?.number || 'Bill' }, { label: 'Payments' }];
  }
}
