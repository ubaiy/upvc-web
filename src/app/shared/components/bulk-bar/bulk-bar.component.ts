import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * The bar that takes the place of a table's toolbar while rows are ticked
 * (ease-of-use rule 9: anything done to one row can be done to many).
 *
 *   <app-bulk-bar *ngIf="!selection.isEmpty" [count]="selection.count" (cleared)="selection.clear()">
 *     <button actions type="button" class="btn btn-secondary btn-sm" (click)="markSent()">Mark as sent</button>
 *     <button actions type="button" class="btn btn-danger btn-sm" (click)="deleteSelected()">Delete</button>
 *   </app-bulk-bar>
 *   <table class="table table-select"> ... <td class="col-check"><label class="check">...</label></td>
 *
 * Use RowSelection for the ticked rows. Destructive action last. A bulk delete
 * of drafts goes through UndoService, not a confirm dialog.
 */
@Component({
  selector: 'app-bulk-bar',
  template: `
    <div class="bulk-bar" role="region" aria-label="Selected rows">
      <span class="bulk-count" role="status">{{ count }} {{ count === 1 ? noun : plural || noun + 's' }} selected</span>
      <div class="bulk-actions"><ng-content select="[actions]"></ng-content></div>
      <button type="button" class="btn btn-ghost btn-sm" (click)="cleared.emit()">Clear</button>
    </div>
  `,
  styles: [':host { display: block; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BulkBarComponent {
  /** How many rows are ticked. */
  @Input() count = 0;

  /** What a row is, lower case: "quotation". */
  @Input() noun = 'row';

  /** Plural when adding "s" is wrong: "glass types". */
  @Input() plural?: string;

  /** "Clear" was pressed. */
  @Output() cleared = new EventEmitter<void>();
}
