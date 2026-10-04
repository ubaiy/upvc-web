import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { drawWindow, WindowSpec } from './window-drawing';

let nextId = 0;

/**
 * A small drawing of a window or door for lists and summaries.
 *
 *   <app-window-thumb [spec]="spec" label="Two-sash casement window"></app-window-thumb>       56 × 44
 *   <app-window-thumb [spec]="spec" [width]="72" [height]="52" label="..."></app-window-thumb>  quotation lines
 *   <app-window-thumb [spec]="spec" [width]="420" [height]="320" [dims]="true" label="..."></app-window-thumb>
 *
 * The drawing never mirrors in right-to-left layouts.
 */
@Component({
  selector: 'app-window-thumb',
  template: `<svg
    class="win"
    [attr.width]="width"
    [attr.height]="height"
    [attr.viewBox]="'0 0 ' + width + ' ' + height"
    role="img"
    [attr.aria-label]="label"
    [innerHTML]="svg"
  ></svg>`,
  styles: [':host { display: inline-grid; place-items: center; flex: none; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WindowThumbComponent implements OnChanges {
  private readonly gradientId = 'win-glass-' + ++nextId;

  svg: SafeHtml = '';

  @Input() spec: WindowSpec | null | undefined;

  @Input() width = 56;

  @Input() height = 44;

  /** Show dimension lines in mm. Needs at least about 300 × 240. */
  @Input() dims = false;

  /** Index of the pane to mark as selected. */
  @Input() selected?: number;

  /** What the drawing shows, for screen readers. */
  @Input() label = 'Window drawing';

  constructor(private sanitizer: DomSanitizer) {}

  ngOnChanges(): void {
    if (!this.spec) {
      this.svg = '';
      return;
    }
    // drawWindow() writes numbers and fixed strings only; no part of the spec reaches the markup as text.
    this.svg = this.sanitizer.bypassSecurityTrustHtml(
      drawWindow(this.spec, this.gradientId, {
        width: this.width,
        height: this.height,
        dims: this.dims,
        selected: this.selected,
      })
    );
  }
}
