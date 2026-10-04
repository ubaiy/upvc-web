import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, ViewChild } from '@angular/core';

import { httpMessage, todayIso } from '../api-result';
import { MODES, amountError, amountText, jobNumber, referenceLabel } from '../payments.adapter';
import { Account, NewPayment, PaymentKind, PaymentMode } from '../payments.model';
import { PaymentsService, SavedPayment } from '../payments.service';
import { keepFocusInside } from './focus-trap';

/**
 * "Record payment": one small dialog, the same from an order, a bill and the
 * outstanding list. The amount starts as the balance, so the usual case is
 * choose the mode and save. A refund is the same form, opened on purpose.
 */
@Component({
  selector: 'app-record-payment',
  templateUrl: './record-payment.component.html',
  styleUrls: ['./record-payment.component.scss'],
})
export class RecordPaymentComponent implements OnInit, AfterViewInit {
  /** The job's account: its balance pre-fills the amount. */
  @Input() account!: Account;
  @Input() kind: PaymentKind = 'receipt';

  @Output() saved = new EventEmitter<SavedPayment>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('amountBox') amountBox?: ElementRef<HTMLInputElement>;

  readonly modes = MODES;
  readonly today = todayIso();

  amount = '';
  mode: PaymentMode = 'cash';
  reference = '';
  date = this.today;
  note = '';
  showNote = false;

  saving = false;
  submitted = false;
  /** The api's refusal, or a lost connection. */
  error = '';

  constructor(private payments: PaymentsService, private host: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    const start = this.isRefund ? this.account.overpaid : this.account.balance;
    this.amount = start > 0 ? String(start) : '';
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.amountBox?.nativeElement.focus();
      this.amountBox?.nativeElement.select();
    });
  }

  get isRefund(): boolean {
    return this.kind === 'refund';
  }

  get title(): string {
    return this.isRefund ? 'Record refund' : 'Record payment';
  }

  /** "ORD/26-27/0001 · Ahmed Al-Rashid" */
  get job(): string {
    return [jobNumber(this.account), this.account.customerName].filter(Boolean).join(' · ');
  }

  /** The most that can be entered: the balance, or for a refund the money held. */
  get limit(): number {
    return this.isRefund ? this.account.netReceived : this.account.balance;
  }

  /** "Advance" is offered while part of the advance is still to collect and it is less than the balance. */
  get advanceDue(): number {
    const due = this.account.advance?.due || 0;
    return !this.isRefund && due > 0 && due < this.account.balance ? due : 0;
  }

  get amountMessage(): string | null {
    return amountError(this.amount, this.kind, this.limit);
  }

  get referenceLabel(): string {
    return referenceLabel(this.mode);
  }

  get referenceMessage(): string | null {
    return this.mode === 'cheque' && !this.reference.trim() ? 'Enter the cheque number.' : null;
  }

  get dateMessage(): string | null {
    if (!this.date) {
      return 'Choose the date.';
    }
    return this.date > this.today ? 'The date cannot be in the future.' : null;
  }

  fill(value: number): void {
    this.amount = String(value);
    this.amountBox?.nativeElement.focus();
  }

  choose(mode: PaymentMode): void {
    this.mode = mode;
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    keepFocusInside(event, this.host.nativeElement);
  }

  @HostListener('document:keydown.escape')
  close(): void {
    if (!this.saving) {
      this.closed.emit();
    }
  }

  save(): void {
    this.submitted = true;
    if (this.saving || this.amountMessage || this.referenceMessage || this.dateMessage) {
      return;
    }
    const body: NewPayment = {
      kind: this.kind,
      amount: amountText(this.amount),
      mode: this.mode,
    };
    // Today is left to the api ("today when not sent"): its clock, not this device's, decides the
    // date, so a tablet a few hours ahead of the server is not refused for a date "in the future".
    if (this.date !== this.today) {
      body.payment_date = this.date;
    }
    if (this.account.order) {
      body.order_id = this.account.order.id;
    }
    if (this.account.bill) {
      body.bill_id = this.account.bill.id;
    }
    if (this.reference.trim()) {
      body.reference = this.reference.trim();
    }
    if (this.note.trim()) {
      body.note = this.note.trim();
    }
    this.saving = true;
    this.error = '';
    this.payments.add(body).subscribe({
      next: (result) => {
        this.saving = false;
        if (result.ok) {
          this.saved.emit(result.data);
        } else {
          this.error = result.message;
        }
      },
      error: (error) => {
        this.saving = false;
        this.error = httpMessage(error, this.isRefund ? 'The refund was not saved.' : 'The payment was not saved.');
      },
    });
  }
}
