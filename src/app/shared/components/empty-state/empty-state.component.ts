import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { IconName } from '../icon/icon-paths';

/**
 * What a list shows when it has nothing in it: an icon, a one-line title, one
 * sentence, and the page's primary button.
 *
 *   <app-empty-state icon="file" title="No quotations yet"
 *     text="Draw your first window and send a priced quotation in a few minutes.">
 *     <button class="btn btn-primary" (click)="create()"><app-icon name="plus"></app-icon>New quotation</button>
 *   </app-empty-state>
 */
@Component({
  selector: 'app-empty-state',
  template: `
    <div class="empty">
      <span class="empty-art"><app-icon [name]="icon" [size]="20"></app-icon></span>
      <h2>{{ title }}</h2>
      <p *ngIf="text">{{ text }}</p>
      <ng-content></ng-content>
    </div>
  `,
  styles: [':host { display: block; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  @Input() icon: IconName = 'file';

  @Input() title = '';

  @Input() text?: string;
}
