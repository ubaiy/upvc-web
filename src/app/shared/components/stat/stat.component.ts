import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * One headline figure: label, value, one line of detail.
 *
 *   <section class="card stats" aria-label="This month">
 *     <app-stat label="Quoted this month" [value]="quoted | inr : 0" detail="8 quotations"></app-stat>
 *     ...
 *   </section>
 *
 * At most three in a row. No icons, no coloured bars.
 */
@Component({
  selector: 'app-stat',
  template: `
    <div class="k">{{ label }}</div>
    <div class="v">{{ value }}</div>
    <div class="d" *ngIf="detail">{{ detail }}</div>
  `,
  host: { class: 'stat' },
  styles: [':host { display: block; min-width: 0; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatComponent {
  @Input() label = '';

  /** Already formatted, for example with the inr pipe. */
  @Input() value: string | number | null = '';

  @Input() detail?: string;
}
