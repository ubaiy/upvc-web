import { Component, Input } from '@angular/core';

/**
 * Reusable page header bar — the portal-wide equivalent of the window
 * designer's `sqd-toolbar`. Renders an optional eyebrow label, a large
 * title on the left and a content-projection slot for action buttons on
 * the right.
 *
 * Usage:
 *   <app-page-header eyebrow="Overview" title="Customers">
 *     <button actions cButton color="primary">New customer</button>
 *   </app-page-header>
 */
@Component({
  selector: 'app-page-header',
  templateUrl: './page-header.component.html',
  styleUrls: ['./page-header.component.scss'],
})
export class PageHeaderComponent {
  /** Small uppercase label shown above the title. */
  @Input() eyebrow?: string;

  /** Main heading text. (Accepts undefined so dynamic `[title]` bindings of
   *  type `string | undefined` bind cleanly under strict template checking.) */
  @Input() title: string | undefined = '';

  /** Optional supporting line shown under the title. */
  @Input() subtitle?: string;

  /** When false the header scrolls with the page instead of sticking. */
  @Input() sticky = true;
}
