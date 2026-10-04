import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Output,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';

import { IconName } from '../../shared/components/icon/icon-paths';
import { NAV_ITEMS } from './nav';

interface Destination {
  label: string;
  /** The menu item a place belongs to, e.g. "Catalogue". */
  group?: string;
  icon: IconName;
  link: string;
}

const DESTINATIONS: Destination[] = NAV_ITEMS.flatMap((item) => [
  { label: item.label, icon: item.icon, link: item.link },
  ...(item.places ?? []).map((place) => ({ label: place.label, group: item.label, icon: item.icon, link: place.link })),
]);

/**
 * "Go to" dialog behind the sidebar search box and Ctrl K. It lists the pages
 * of the app; type to narrow, arrow keys to move, Enter to open.
 * Searching quotations and customers by name is a later card.
 */
@Component({
  selector: 'app-command-palette',
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <div class="dialog palette" role="dialog" aria-modal="true" aria-label="Go to a page">
      <div class="input-group">
        <app-icon name="search"></app-icon>
        <input
          #input
          type="text"
          role="combobox"
          aria-label="Go to a page"
          aria-controls="palette-list"
          aria-expanded="true"
          [attr.aria-activedescendant]="results.length ? 'palette-option-' + index : null"
          autocomplete="off"
          placeholder="Go to…"
          [value]="query"
          (input)="search(input.value)"
          (keydown)="onKey($event)"
        />
        <span class="kbd">Esc</span>
      </div>
      <div class="list" id="palette-list" role="listbox" aria-label="Pages">
        <button
          *ngFor="let d of results; let i = index"
          type="button"
          class="menu-item"
          role="option"
          [id]="'palette-option-' + i"
          [class.is-active]="i === index"
          [attr.aria-selected]="i === index"
          (mouseenter)="index = i"
          (click)="go(d)"
        >
          <app-icon [name]="d.icon"></app-icon>
          <span class="grow">{{ d.label }}</span>
          <span class="faint small" *ngIf="d.group">{{ d.group }}</span>
        </button>
        <p class="none muted small" *ngIf="!results.length">No page matches "{{ query }}".</p>
      </div>
    </div>
  `,
  styles: [
    `
      :host { position: fixed; inset: 0; z-index: 1100; display: grid; place-items: start center; padding: 12vh var(--s-4) var(--s-4); }
      .backdrop { position: absolute; inset: 0; background: rgba(20, 24, 28, 0.4); }
      .palette { position: relative; width: 520px; padding: var(--s-2); }
      .input-group { border-color: transparent; box-shadow: none; }
      .kbd { font-size: 11px; padding: 1px 5px; border: 1px solid var(--c-border); border-radius: 4px; color: var(--c-text-3); flex: none; }
      .list { max-height: 50vh; overflow-y: auto; margin-block-start: var(--s-2); padding-block-start: var(--s-2); border-block-start: 1px solid var(--c-border); }
      .menu-item.is-active { background: var(--c-surface-2); }
      .none { padding: var(--s-3); }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommandPaletteComponent implements AfterViewInit {
  @Output() closed = new EventEmitter<void>();

  @ViewChild('input') private input: ElementRef<HTMLInputElement>;

  query = '';
  index = 0;
  results = DESTINATIONS;

  constructor(private router: Router) {}

  ngAfterViewInit(): void {
    this.input.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }

  search(value: string): void {
    this.query = value;
    const words = value.toLowerCase().split(/\s+/).filter(Boolean);
    this.results = DESTINATIONS.filter((d) => {
      const text = (d.label + ' ' + (d.group ?? '')).toLowerCase();
      return words.every((word) => text.includes(word));
    });
    this.index = 0;
  }

  onKey(event: KeyboardEvent): void {
    const count = this.results.length;
    if (event.key === 'ArrowDown' && count) {
      this.index = (this.index + 1) % count;
    } else if (event.key === 'ArrowUp' && count) {
      this.index = (this.index - 1 + count) % count;
    } else if (event.key === 'Enter' && count) {
      this.go(this.results[this.index]);
    } else if (event.key === 'Tab') {
      // One field and one list: keep focus in the field while the dialog is open.
    } else {
      return;
    }
    event.preventDefault();
  }

  go(destination: Destination): void {
    this.closed.emit();
    this.router.navigateByUrl(destination.link);
  }
}
