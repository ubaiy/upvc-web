import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export interface TotalsLine {
  label: string;
  amount: number | string | null | undefined;
}

/**
 * Subtotal, tax lines, then the total at 20 px. Amounts are numbers; the
 * component formats them in rupees.
 *
 *   <app-totals
 *     [lines]="[{ label: 'Subtotal', amount: 25039.21 }, { label: 'CGST 9%', amount: 2253.53 }, { label: 'SGST 9%', amount: 2253.53 }]"
 *     [total]="29546.27"
 *   ></app-totals>
 */
@Component({
  selector: 'app-totals',
  template: `
    <dl class="dl">
      <ng-container *ngFor="let line of lines">
        <dt>{{ line.label }}</dt>
        <dd>{{ line.amount | inr }}</dd>
      </ng-container>
      <dt class="total">{{ totalLabel }}</dt>
      <dd class="total" [attr.aria-live]="live ? 'polite' : null">{{ total | inr }}</dd>
    </dl>
  `,
  styles: [':host { display: block; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TotalsComponent {
  @Input() lines: TotalsLine[] = [];

  @Input() total: number | string | null | undefined;

  @Input() totalLabel = 'Total';

  /** Announce the total to screen readers when it changes (live price). */
  @Input() live = false;
}
