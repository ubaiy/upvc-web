import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The first thing a signed-in user sees while GET me / GET subscription are open: the outline of the
 * shell (sidebar, icon rail at 1024 px and below, bottom bar on a phone) with a page skeleton in it,
 * in place of an empty page. Placed once, in AppComponent; the real shell takes over when the route is known.
 */
@Component({
  selector: 'app-boot-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bsk">
      <div class="bsk-side" aria-hidden="true">
        <span class="bsk-mark"></span>
        <span class="skeleton bsk-item" *ngFor="let width of items" [style.width.%]="width"></span>
      </div>
      <div class="bsk-main">
        <div class="page"><app-page-skeleton label="Opening the app"></app-page-skeleton></div>
      </div>
      <div class="bsk-bar" aria-hidden="true"><span class="skeleton" *ngFor="let item of bar"></span></div>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .bsk { display: grid; grid-template-columns: var(--w-sidebar) minmax(0, 1fr); min-height: 100vh; }
      .bsk-side {
        height: 100vh; display: flex; flex-direction: column; gap: var(--s-5);
        padding: var(--s-5); border-inline-end: 1px solid var(--c-border); background: var(--c-bg);
      }
      .bsk-mark { width: 28px; height: 28px; border-radius: 7px; background: var(--c-surface-3); margin-block-end: var(--s-3); flex: none; }
      .bsk-item { flex: none; }
      .bsk-main { min-width: 0; }
      .bsk-bar { display: none; }
      @media (max-width: 1024px) {
        .bsk { grid-template-columns: auto minmax(0, 1fr); }
        .bsk-side { padding-inline: var(--s-4); align-items: center; }
        .bsk-item { width: 20px !important; height: 20px; }
      }
      @media (max-width: 640px) {
        .bsk { display: block; }
        .bsk-side { display: none; }
        .bsk-bar {
          position: fixed; inset-inline: 0; inset-block-end: 0; height: calc(var(--h-bar) + env(safe-area-inset-bottom, 0px));
          display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); place-items: center;
          border-block-start: 1px solid var(--c-border); background: var(--c-surface);
        }
        .bsk-bar .skeleton { width: 24px; height: 24px; }
      }
    `,
  ],
})
export class BootSkeletonComponent {
  readonly items = [70, 82, 60, 76, 52, 80, 72, 64];
  readonly bar = [0, 1, 2, 3, 4];
}
