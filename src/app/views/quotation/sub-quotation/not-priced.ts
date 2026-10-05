import { NgFor, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CanDirective } from 'src/app/shared/access/can.directive';

/** The api's group of the rows of card T132: a bar in a sash, bending, the shaped glass surcharge, pivot hardware. */
export const BAR_SHAPE_GROUP = 'Bars and shapes';

function parsed(value: any): any {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** The api's sentence without its setting keys: "set the rate (sash_bar_rate_m) or …" reads "set the rate or …". */
function plain(sentence: string): string {
  return sentence
    .replace(/\s*\((?:[a-z]+_[a-z_]+)(?:\s+or\s+[a-z]+_[a-z_]+)*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '');
}

/**
 * What the api drew a price for without charging it, in its own words: the
 * rows of {@link BAR_SHAPE_GROUP} whose name says "not priced" (their amount
 * is 0) and the notes of `bar_shape_pricing`. `data` is the answer of the
 * live price call or a saved line (`quatation/show-product`, a line of the
 * quotation): both carry `costhead_information`, a saved line also
 * `quatation_object_data.bar_shape_pricing`. Each sentence once.
 */
export function notPricedOf(data: any): string[] {
  const info = data?.costhead_information;
  const heads: any[] = Array.isArray(info) ? info : Array.isArray(info?.costhead) ? info.costhead : [];
  const summary = data?.bar_shape_pricing ?? parsed(data?.quatation_object_data)?.bar_shape_pricing;
  const said = [
    ...heads.filter((head) => /not priced/i.test(String(head?.name ?? ''))).map((head) => String(head.name)),
    ...(Array.isArray(summary?.notes) ? summary.notes : []).filter((note: any) => /not priced/i.test(String(note ?? ''))),
  ].map((sentence) => plain(String(sentence)));
  return [...new Set(said)];
}

/**
 * The amber line under a price: what was drawn and not charged, because the
 * company has not set its rate. Whoever can change the settings gets the
 * way there; everyone else reads the line.
 */
@Component({
  selector: 'app-not-priced-note',
  standalone: true,
  imports: [NgFor, NgIf, RouterLink, CanDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="not-priced" *ngIf="notes?.length" role="note" data-price="not-priced">
      <span *ngFor="let note of notes">{{ note }}. </span>
      <a
        *appCan="'settings.write'"
        routerLink="/profile"
        [queryParams]="{ tab: 'pricing', rates: 'extras' }"
        target="_blank"
        rel="noopener"
        >Set these rates</a
      >
    </p>
  `,
  styles: [
    `
      :host { display: block; }
      :host(.line-not-priced) { margin-block-start: var(--s-1); max-width: 560px; }
      .not-priced {
        margin: 0;
        padding: var(--s-2) var(--s-3);
        border-radius: var(--r-sm);
        background: var(--c-warning-soft);
        color: var(--c-warning);
        font-size: var(--fs-12, 12px);
        line-height: 1.45;
      }
      .not-priced a { color: inherit; font-weight: var(--fw-semibold); text-decoration: underline; white-space: nowrap; }
    `,
  ],
})
export class NotPricedNoteComponent {
  @Input() notes: string[] | null = [];
}
