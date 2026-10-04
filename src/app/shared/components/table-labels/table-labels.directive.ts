import { AfterViewInit, Directive, ElementRef, NgZone, OnDestroy } from '@angular/core';

/**
 * Phone layout for every `<table class="table">`: below 640 px the stylesheet
 * turns each row into a card and the column headings are hidden, so a cell has
 * to say what it is. This directive copies each heading onto the cells under
 * it as `data-label`, which the stylesheet prints before the value
 * ("Total  ₹8,720.00").
 *
 * Nothing to add in a screen: the selector matches the table by its class.
 * Not labelled: the first column after the tick box (it is the row's title), the row menu
 * (`.row-actions`), the tick box (`.col-check`), a heading that is only for
 * screen readers, and a cell that already has its own `data-label`.
 * A table that must stay a table on a phone takes the class `table-keep`.
 */
@Directive({ selector: 'table.table:not(.table-keep)' })
export class TableLabelsDirective implements AfterViewInit, OnDestroy {
  private observer?: MutationObserver;
  private queued = false;

  constructor(private host: ElementRef<HTMLTableElement>, private zone: NgZone) {}

  ngAfterViewInit(): void {
    this.label();
    // Rows come and go with paging, search and reloads. Outside the zone: adding an attribute needs no change detection.
    this.zone.runOutsideAngular(() => {
      this.observer = new MutationObserver(() => this.queue());
      this.observer.observe(this.host.nativeElement, { childList: true, subtree: true });
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private queue(): void {
    if (this.queued) {
      return;
    }
    this.queued = true;
    Promise.resolve().then(() => {
      this.queued = false;
      this.label();
    });
  }

  private label(): void {
    const table = this.host.nativeElement;
    const headings = Array.from(table.tHead?.rows[0]?.cells ?? []).map(headingText);
    if (!headings.length) {
      return;
    }
    for (const body of Array.from(table.tBodies)) {
      for (const row of Array.from(body.rows)) {
        if (row.cells.length !== headings.length) {
          continue; // a row that spans columns, such as "No match"
        }
        let titleSeen = false;
        for (let i = 0; i < row.cells.length; i++) {
          const cell = row.cells[i];
          if (cell.matches('.row-actions, .col-check')) {
            continue;
          }
          if (!titleSeen) {
            titleSeen = true; // the row's title needs no label
            continue;
          }
          if (headings[i] && !cell.hasAttribute('data-label')) {
            cell.setAttribute('data-label', headings[i]);
          }
        }
      }
    }
  }
}

/** The heading as sighted users read it: text for screen readers only does not count. */
function headingText(cell: HTMLTableCellElement): string {
  const copy = cell.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.sr-only, svg, button > app-icon').forEach((node) => node.remove());
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}
