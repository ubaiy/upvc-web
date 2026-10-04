import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { ICON_PATHS, IconName } from './icon-paths';

/**
 * The one way to draw an icon: a Lucide line icon (ISC licence) as inline SVG.
 *
 *   <app-icon name="plus"></app-icon>
 *   <app-icon name="file" [size]="20"></app-icon>
 *   <app-icon name="chev-right" [mirror]="true"></app-icon>   flips in RTL
 *
 * Icons are decorative and hidden from screen readers. An icon-only button
 * carries its own aria-label; pass `label` only when the icon stands alone
 * as the content.
 */
@Component({
  selector: 'app-icon',
  template: `<svg
    class="ico"
    [class.ico-20]="size === 20"
    [class.ico-dir]="mirror"
    [style.width.px]="size === 16 || size === 20 ? null : size"
    [style.height.px]="size === 16 || size === 20 ? null : size"
    [style.stroke-width]="stroke"
    viewBox="0 0 24 24"
    [attr.aria-hidden]="label ? null : 'true'"
    [attr.role]="label ? 'img' : null"
    [attr.aria-label]="label || null"
    [innerHTML]="svg"
  ></svg>`,
  styles: [':host { display: inline-flex; flex: none; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  private static readonly cache = new Map<string, SafeHtml>();

  svg: SafeHtml = '';

  /** Size in px. 16 in text and buttons, 20 in empty states. */
  @Input() size = 16;

  /** Flip horizontally in right-to-left layouts (chevrons, arrows, undo). */
  @Input() mirror = false;

  /** Stroke width override. The default 1.75 comes from the .ico class. */
  @Input() stroke?: number;

  /** Accessible name, for the rare icon that is not next to a text label. */
  @Input() label?: string;

  @Input() set name(value: IconName) {
    let svg = IconComponent.cache.get(value);
    if (!svg) {
      // The markup is a compile-time constant from icon-paths.ts, never user input.
      svg = this.sanitizer.bypassSecurityTrustHtml(ICON_PATHS[value] ?? ICON_PATHS.circle);
      IconComponent.cache.set(value, svg);
    }
    this.svg = svg;
  }

  constructor(private sanitizer: DomSanitizer) {}
}
