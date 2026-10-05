import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { map } from 'rxjs';

import { SharedComponentsModule } from '../components/shared-components.module';
import { homeFor } from './access.models';
import { AccessService } from './access.service';

/** Where a user lands who asked for a page their role does not have: one plain line and a way on. */
@Component({
  selector: 'app-no-access',
  standalone: true,
  imports: [CommonModule, RouterModule, SharedComponentsModule],
  template: `
    <app-page-header title="Not for your role"></app-page-header>
    <ng-container *ngIf="view$ | async as view">
      <app-callout tone="warn">
        Your role{{ view.role ? ' (' + view.role + ')' : '' }} does not open this page. Ask the owner of the account.
        <a action class="btn btn-secondary btn-sm" *ngIf="view.home" [routerLink]="view.home">{{ view.homeLabel }}</a>
      </app-callout>
    </ng-container>
  `,
})
export class NoAccessComponent {
  readonly view$ = this.access.state$.pipe(
    map((state) => {
      const home = homeFor(state);
      return {
        role: state.me?.role_name ?? '',
        home: home === '/no-access' ? '' : home,
        homeLabel: home === '/orders' ? 'Go to Orders' : 'Go to Home',
      };
    })
  );

  constructor(private access: AccessService) {}
}
