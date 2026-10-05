/**
 * structure-model history — undo and redo over immutable documents. Every
 * operation returns a new document, so a snapshot is one reference. Same
 * behaviour as design-model/history.ts, for any document type.
 */

export class History<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(private current: T, private readonly cap = 100) {}

  get present(): T {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Commit a new present. The same reference is no step; a redo branch is dropped. */
  push(next: T): void {
    if (next === this.current) return;
    this.past.push(this.current);
    if (this.past.length > this.cap) this.past.shift();
    this.current = next;
    this.future = [];
  }

  /** Replace the present without a step (while a handle is being dragged). */
  replace(next: T): void {
    this.current = next;
  }

  undo(): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.current);
    this.current = prev;
    return prev;
  }

  redo(): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.current);
    this.current = next;
    return next;
  }
}
