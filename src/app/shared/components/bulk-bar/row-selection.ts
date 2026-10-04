/**
 * Which rows of a table are ticked. Plain class, no Angular.
 *
 *   selection = new RowSelection<Quote>((quote) => quote.id);
 *
 * Rows are remembered by key, so a selection survives a reload of the list
 * and a change of page; call `keep(rows)` after a reload to drop rows that
 * are no longer there.
 */
export class RowSelection<T, K = unknown> {
  private keys = new Set<K>();

  constructor(private keyOf: (row: T) => K = (row) => row as unknown as K) {}

  get count(): number {
    return this.keys.size;
  }

  get isEmpty(): boolean {
    return this.keys.size === 0;
  }

  isSelected(row: T): boolean {
    return this.keys.has(this.keyOf(row));
  }

  toggle(row: T, on = !this.isSelected(row)): void {
    on ? this.keys.add(this.keyOf(row)) : this.keys.delete(this.keyOf(row));
  }

  /** Every one of `rows` (the rows on screen) is ticked. */
  allSelected(rows: T[]): boolean {
    return rows.length > 0 && rows.every((row) => this.isSelected(row));
  }

  /** Some, not all: the header box shows a dash. */
  someSelected(rows: T[]): boolean {
    return !this.allSelected(rows) && rows.some((row) => this.isSelected(row));
  }

  /** The header box: ticks every row on screen, or clears them when all are ticked. */
  toggleAll(rows: T[], on = !this.allSelected(rows)): void {
    rows.forEach((row) => this.toggle(row, on));
  }

  /** The ticked rows among `rows`, in the order given. */
  selected(rows: T[]): T[] {
    return rows.filter((row) => this.isSelected(row));
  }

  /** Forgets ticked rows that are not in `rows` any more. */
  keep(rows: T[]): void {
    const present = new Set(rows.map((row) => this.keyOf(row)));
    this.keys.forEach((key) => !present.has(key) && this.keys.delete(key));
  }

  clear(): void {
    this.keys.clear();
  }
}
