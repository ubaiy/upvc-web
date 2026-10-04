/**
 * design-model history — a small undo/redo helper over immutable
 * WindowDesign snapshots. Because every operation returns a NEW document
 * (structural sharing), a snapshot is just a reference; pushing is O(1).
 * Cap defaults to 100 (designer-architecture §3.2).
 */

import { WindowDesign } from './types';

export class DesignHistory {
  private past: WindowDesign[] = [];
  private future: WindowDesign[] = [];

  constructor(private current: WindowDesign, private readonly cap = 100) {}

  get present(): WindowDesign {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Number of undoable steps currently held. */
  get depth(): number {
    return this.past.length;
  }

  /**
   * Commit a new present state. A reference-identical state is a no-op
   * (operations return the same object when nothing changed). Any redo
   * branch is discarded; the oldest snapshot drops once over `cap`.
   */
  push(next: WindowDesign): void {
    if (next === this.current) return;
    this.past.push(this.current);
    if (this.past.length > this.cap) this.past.shift();
    this.current = next;
    this.future = [];
  }

  /** Step back; returns the new present (or null when nothing to undo). */
  undo(): WindowDesign | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.current);
    this.current = prev;
    return prev;
  }

  /** Step forward; returns the new present (or null when nothing to redo). */
  redo(): WindowDesign | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.current);
    this.current = next;
    return next;
  }

  /** Drop all history, keeping the present (e.g. after loading a design). */
  reset(present?: WindowDesign): void {
    if (present !== undefined) this.current = present;
    this.past = [];
    this.future = [];
  }
}
