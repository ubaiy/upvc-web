import { Component } from '@angular/core';

import { PRODUCT_NAME } from '../../shared/configs/product';
import { AuthService } from '../../shared/services/auth.service';
import { LocalStoreService } from '../../shared/services/local-storage.service';

/** The frame of the admin area: a bar with its two places and "Sign out", and the screen under it. */
@Component({
  selector: 'app-admin-layout',
  template: `
    <header class="bar">
      <a class="brand" routerLink="/admin/companies">
        <span class="mark"><app-icon name="window"></app-icon></span>
        <span class="name">{{ product }}</span>
        <span class="badge badge-accent plain">Platform admin</span>
      </a>
      <nav class="places" aria-label="Admin">
        <a routerLink="/admin/companies" routerLinkActive="is-current" ariaCurrentWhenActive="page">Companies</a>
        <a routerLink="/admin/plans" routerLinkActive="is-current" ariaCurrentWhenActive="page">Plans</a>
      </nav>
      <span class="who muted small" *ngIf="email">{{ email }}</span>
      <button type="button" class="btn btn-secondary btn-sm" (click)="signOut()">
        <app-icon name="log-out" [mirror]="true"></app-icon>Sign out
      </button>
    </header>
    <main class="page" id="main">
      <router-outlet></router-outlet>
    </main>
  `,
  styles: [
    `
      :host { display: block; min-height: 100dvh; background: var(--c-bg); }
      .bar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s-2) var(--s-4); padding: var(--s-3) var(--s-8); background: var(--c-surface); border-block-end: 1px solid var(--c-border); }
      .brand { display: flex; align-items: center; gap: var(--s-2); color: var(--c-text); text-decoration: none; font-weight: var(--fw-semibold); }
      .mark { display: grid; place-items: center; width: 28px; height: 28px; border-radius: var(--r-sm); background: var(--c-accent); color: var(--c-on-accent); }
      .places { display: flex; gap: var(--s-1); flex: 1; }
      .places a { padding: var(--s-2) var(--s-3); border-radius: var(--r-sm); color: var(--c-text-2); text-decoration: none; font-weight: var(--fw-medium); }
      .places a:hover { background: var(--c-surface-2); color: var(--c-text); }
      .places a.is-current { background: var(--c-accent-soft); color: var(--c-accent-text); }
      @media (max-width: 640px) {
        .bar { padding: var(--s-3) var(--s-4); }
        .name, .who { display: none; }
        .places a { min-height: 44px; display: inline-flex; align-items: center; }
      }
    `,
  ],
})
export class AdminLayoutComponent {
  readonly product = PRODUCT_NAME;
  readonly email: string;

  constructor(private auth: AuthService, store: LocalStoreService) {
    this.email = store.getItem(auth.USER)?.email ?? '';
  }

  signOut(): void {
    this.auth.logout();
  }
}
