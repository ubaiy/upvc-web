import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { IconName } from '../icon/icon-paths';

export type CalloutTone = 'info' | 'success' | 'warn' | 'danger';

/**
 * An inline message that stays on the page. Use it for a load error with
 * "Try again", or with tone="success" for a result the user should keep in
 * view ("We sent the link"); use a toast for things that need no decision.
 *
 *   <app-callout tone="warn">
 *     We could not load your quotations. Check your connection.
 *     <button action class="btn btn-secondary btn-sm" (click)="reload()">Try again</button>
 *   </app-callout>
 */
@Component({
  selector: 'app-callout',
  template: `
    <div
      class="callout"
      [class.success]="tone === 'success'"
      [class.warn]="tone === 'warn'"
      [class.danger]="tone === 'danger'"
      [attr.role]="tone === 'info' || tone === 'success' ? 'status' : 'alert'"
    >
      <app-icon [name]="icon || (tone === 'info' ? 'info' : tone === 'success' ? 'circle-check' : 'alert')"></app-icon>
      <span class="grow"><ng-content></ng-content></span>
      <ng-content select="[action]"></ng-content>
    </div>
  `,
  styles: [':host { display: block; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalloutComponent {
  @Input() tone: CalloutTone = 'info';

  /** Overrides the icon that goes with the tone. */
  @Input() icon?: IconName;
}
