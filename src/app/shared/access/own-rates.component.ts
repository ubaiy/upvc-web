import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { ConfirmDialogComponent } from '../../views/bills/confirm-dialog.component';
import { AccessService } from './access.service';
import { hasExampleRates } from './starter-catalogue';
import { WriteDirective } from './write.directive';

export const OWN_RATES_ABILITY = 'settings.write';
export const OWN_RATES_LABEL = 'These are my rates now';

/**
 * "These are my rates now" (card T146; api phase-56 G3): the owner's word that the catalogue
 * holds his own rates. Shown only while GET me says the rates are examples, and only to a role
 * with `settings.write`. Nothing is sent before the yes; afterwards the line about example rates
 * is gone on every page without a reload, because the shell reads the same state.
 */
@Component({
  selector: 'app-own-rates',
  standalone: true,
  imports: [CommonModule, ConfirmDialogComponent, WriteDirective],
  template: `
    <button *ngIf="shown" type="button" class="btn btn-sm own-rates" [ngClass]="primary ? 'btn-primary' : 'btn-secondary'" [appWrite]="ability" (click)="asking = true">
      {{ label }}
    </button>
    <app-confirm-dialog
      *ngIf="asking"
      title="Are the rates in the catalogue your own now?"
      confirmLabel="Yes, these are my rates"
      keepLabel="Not yet"
      [ability]="ability"
      [busy]="busy"
      [error]="error"
      (confirmed)="confirm()"
      (closed)="close()"
    >
      <p class="muted">The line about example rates goes away for everyone in your company. No rate is changed: check them in the catalogue first.</p>
      <p class="muted">This cannot be undone from the app.</p>
    </app-confirm-dialog>
  `,
  styles: [':host { display: contents; } .own-rates { flex: none; }'],
})
export class OwnRatesComponent implements OnInit, OnDestroy {
  /** The first step of the welcome page draws it as the main button. */
  @Input() primary = false;

  readonly ability = OWN_RATES_ABILITY;
  readonly label = OWN_RATES_LABEL;
  shown = false;
  asking = false;
  busy = false;
  error = '';

  private subscription = new Subscription();

  constructor(private access: AccessService) {}

  ngOnInit(): void {
    this.subscription.add(
      this.access.state$.subscribe((state) => {
        // `allows` is true while GET me is not known; the mark is not, so nothing is offered then.
        this.shown = hasExampleRates(state) && this.access.can(this.ability);
      })
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  close(): void {
    this.asking = false;
    this.error = '';
  }

  confirm(): void {
    if (this.busy) {
      return;
    }
    this.busy = true;
    this.error = '';
    this.access.confirmOwnRates().subscribe({
      next: () => {
        this.busy = false;
        this.asking = false;
      },
      error: (err) => {
        this.busy = false;
        this.error =
          err?.status === 403
            ? 'Only the owner of the account can say this.'
            : err?.status === 0
            ? 'We could not reach the server. Nothing was changed. Try again.'
            : err?.error?.message || 'Something went wrong on our side. Nothing was changed. Try again.';
      },
    });
  }
}
