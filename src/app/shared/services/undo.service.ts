import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface UndoOptions {
  /** What just happened, in the past tense: "Quotation deleted". */
  message: string;
  /** Makes the change final, usually the API call. Runs once the toast has gone without "Undo". */
  commit: () => void;
  /** Puts the screen back as it was, for example the row back in the list. */
  undo?: () => void;
  /** Label of the button. */
  actionLabel?: string;
  /** How long "Undo" stays, in ms. */
  life?: number;
}

export interface UndoOffer {
  message: string;
  actionLabel: string;
}

/** Longer than a plain toast (5 s): the user has to read it and reach the button. */
const DEFAULT_LIFE = 7000;

/**
 * Undo instead of confirm (ease-of-use rule 5). A reversible action happens on
 * screen at once and the request is held back while a toast offers "Undo".
 *
 *   remove(row: Row) {
 *     this.rows = this.rows.filter((r) => r !== row);          // gone from the screen now
 *     this.undo.offer({
 *       message: `${row.name} deleted`,
 *       commit: () => this.api.delete(row.id).subscribe(),      // sent when the toast goes
 *       undo: () => (this.rows = [...this.rows, row]),          // "Undo": nothing was sent
 *     });
 *   }
 *
 * Only one offer is open at a time: a second action, leaving the page or
 * closing the tab commits the first. Keep the confirm dialog for what cannot
 * be taken back (cancel a bill, delete a company).
 * Drawn by <app-undo-toast>, which AppComponent holds once for the whole app.
 */
@Injectable({ providedIn: 'root' })
export class UndoService implements OnDestroy {
  /** The open offer, or null. */
  readonly offer$ = new BehaviorSubject<UndoOffer | null>(null);

  private pending: UndoOptions | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly onPageHide = () => this.flush();

  constructor(private zone: NgZone) {
    window.addEventListener('pagehide', this.onPageHide);
  }

  ngOnDestroy(): void {
    window.removeEventListener('pagehide', this.onPageHide);
    this.flush();
  }

  /** True while "Undo" is on screen. */
  get open(): boolean {
    return this.pending !== null;
  }

  offer(options: UndoOptions): void {
    this.flush();
    this.pending = options;
    this.offer$.next({ message: options.message, actionLabel: options.actionLabel ?? 'Undo' });
    this.start();
  }

  /** The user took it back: nothing is committed. */
  undo(): void {
    const pending = this.take();
    pending?.undo?.();
  }

  /** Makes the open offer final now. */
  flush(): void {
    const pending = this.take();
    pending?.commit();
  }

  /** Stops the clock while the pointer or the keyboard focus is on the toast. */
  hold(): void {
    this.stop();
  }

  release(): void {
    if (this.pending && !this.timer) {
      this.start();
    }
  }

  private start(): void {
    this.stop();
    const life = this.pending?.life ?? DEFAULT_LIFE;
    // Outside the zone, so a waiting timer does not keep tests and change detection busy.
    this.zone.runOutsideAngular(() => {
      this.timer = setTimeout(() => this.zone.run(() => this.flush()), life);
    });
  }

  private stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private take(): UndoOptions | null {
    this.stop();
    const pending = this.pending;
    this.pending = null;
    if (pending) {
      this.offer$.next(null);
    }
    return pending;
  }
}
