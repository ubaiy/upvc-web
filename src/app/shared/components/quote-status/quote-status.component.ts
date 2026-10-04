import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'billed' | 'declined';

const LABELS: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  billed: 'Billed',
  declined: 'Declined',
};

/** Badge colour per status: draft grey, sent blue, accepted green, billed teal, declined red. */
const BADGE: Record<QuoteStatus, string> = {
  draft: '',
  sent: 'badge-info',
  accepted: 'badge-success',
  billed: 'badge-accent',
  declined: 'badge-danger',
};

const FLOW: QuoteStatus[] = ['draft', 'sent', 'accepted', 'billed'];

/**
 * Where a quotation stands.
 *
 *   <app-quote-status status="sent"></app-quote-status>
 *       a badge, for lists
 *   <app-quote-status status="sent" variant="steps" note="28 Sep"></app-quote-status>
 *       Draft → Sent 28 Sep → Accepted → Billed, for the quotation page
 *
 * A declined quotation has left the flow, so `steps` shows it as a badge.
 * A status the app does not know is shown as Draft.
 */
@Component({
  selector: 'app-quote-status',
  template: `
    <span *ngIf="variant === 'badge' || current === 'declined'; else steps" class="badge" [ngClass]="badgeClass">{{
      label
    }}</span>
    <ng-template #steps>
      <div class="steps" role="group" [attr.aria-label]="'Status: ' + label">
        <ng-container *ngFor="let step of flow; let i = index; let last = last">
          <span
            class="step"
            [class.done]="i < index"
            [class.now]="i === index"
            [attr.aria-current]="i === index ? 'step' : null"
          >
            <span class="dot"><app-icon *ngIf="i < index" name="check" [size]="10" [stroke]="3"></app-icon></span>
            {{ labels[step] }}<ng-container *ngIf="i === index && note"> {{ note }}</ng-container>
          </span>
          <span class="bar" *ngIf="!last"></span>
        </ng-container>
      </div>
    </ng-template>
  `,
  styles: [':host { display: inline-flex; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteStatusComponent {
  readonly flow = FLOW;
  readonly labels = LABELS;

  current: QuoteStatus = 'draft';

  @Input() set status(value: QuoteStatus | string | null | undefined) {
    this.current = value && value in LABELS ? (value as QuoteStatus) : 'draft';
  }

  @Input() variant: 'badge' | 'steps' = 'badge';

  /** Short text after the current step, for example the date it was sent. */
  @Input() note?: string;

  get label(): string {
    return LABELS[this.current];
  }

  get badgeClass(): string {
    return BADGE[this.current];
  }

  get index(): number {
    return FLOW.indexOf(this.current);
  }
}
