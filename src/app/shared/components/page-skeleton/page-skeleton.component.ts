import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * The skeleton of a page that is not here yet: a title, one line under it and rows of the list's row
 * height. Drawn by the shell while a route resolver is asking the api, and inside <app-boot-skeleton>.
 * A screen that loads its own data draws its own skeleton rows instead (`.skeleton`).
 */
@Component({
  selector: 'app-page-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="psk" aria-hidden="true">
      <div class="psk-head"><span class="skeleton psk-title"></span><span class="skeleton psk-action"></span></div>
      <span class="skeleton psk-sub"></span>
      <div class="psk-rows">
        <div class="psk-row" *ngFor="let width of widths"><span class="skeleton" [style.width.%]="width"></span></div>
      </div>
    </div>
    <span class="sr-only" role="status">{{ label }}</span>
  `,
  styles: [
    `
      :host { display: block; }
      .psk-head { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); }
      .psk-title { width: 180px; height: 22px; }
      .psk-action { width: 112px; height: var(--h-control); }
      .psk-sub { width: 260px; max-width: 70%; margin-block: var(--s-3) var(--s-6); }
      .psk-rows { border: 1px solid var(--c-border); border-radius: var(--r-md, 8px); background: var(--c-surface); }
      .psk-row { display: flex; align-items: center; height: var(--h-row); padding-inline: var(--s-4); }
      .psk-row + .psk-row { border-block-start: 1px solid var(--c-border); }
    `,
  ],
})
export class PageSkeletonComponent {
  /** Read to a screen reader; nothing is shown. */
  @Input() label = 'Loading the page';

  readonly widths = [62, 48, 70, 55, 66, 44];
}
