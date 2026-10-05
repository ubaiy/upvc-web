import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export interface Crumb {
  label: string;
  /** Router link. Leave out for the current page (the last crumb). */
  link?: string | any[];
}

/**
 * Page header: optional breadcrumb, the title with one supporting line, and
 * the page's actions on the right.
 *
 *   <app-page-header title="Quotations" subtitle="12 open">
 *     <button actions class="btn btn-primary"><app-icon name="plus"></app-icon>New quotation</button>
 *   </app-page-header>
 *
 *   <app-page-header title="Mehta Villa Windows"
 *     [crumbs]="[{ label: 'Quotations', link: '/quotation' }, { label: 'Q-0014' }]">
 *     <app-quote-status meta status="sent" variant="steps"></app-quote-status>
 *   </app-page-header>
 *
 * Rules: exactly one primary button; at most one secondary plus a "more" menu.
 */
@Component({
  selector: 'app-page-header',
  template: `
    <nav class="crumbs" aria-label="Breadcrumb" *ngIf="crumbs?.length">
      <ng-container *ngFor="let crumb of crumbs; let last = last; trackBy: trackCrumb">
        <a *ngIf="crumb.link && !last; else current" [routerLink]="crumb.link">{{ crumb.label }}</a>
        <ng-template #current
          ><span [attr.aria-current]="last ? 'page' : null"><bdi>{{ crumb.label }}</bdi></span></ng-template
        >
        <app-icon *ngIf="!last" name="chev-right" [mirror]="true"></app-icon>
      </ng-container>
    </nav>
    <header class="page-header">
      <div class="grow">
        <h1>{{ title }}</h1>
        <p class="sub" *ngIf="subtitle">{{ subtitle }}</p>
        <ng-content select="[meta]"></ng-content>
      </div>
      <div class="page-actions"><ng-content select="[actions]"></ng-content></div>
    </header>
  `,
  styles: [':host { display: block; } .page-actions:empty { display: none; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeaderComponent {
  /** Main heading: the name of the thing on the page. */
  @Input() title: string | undefined = '';

  /** One supporting line under the title. */
  @Input() subtitle?: string;

  /** Breadcrumb trail, parent first. The last entry is the current page. */
  @Input() crumbs?: Crumb[];

  /**
   * Pages build the trail in a getter, so every check hands over new objects.
   * Without this the links are made again each time, and a click that starts
   * on a link while a field is being left (blur runs a check) is lost.
   */
  trackCrumb(index: number, crumb: Crumb): string {
    return index + '|' + crumb.label + '|' + (crumb.link ?? '');
  }

  /** @deprecated Not drawn in the new design. Accepted so screens not rebuilt yet still compile. */
  @Input() eyebrow?: string;

  /** @deprecated The header no longer sticks. Accepted so screens not rebuilt yet still compile. */
  @Input() sticky = false;
}
