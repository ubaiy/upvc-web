import { Component } from '@angular/core';

/** What a company's user sees at an admin address: a plain "not for you" and the way back. */
@Component({
  selector: 'app-admin-not-allowed',
  template: `
    <main class="page page-narrow">
      <section class="card">
        <app-empty-state
          icon="alert"
          title="This area is for the platform admin only"
          text="Your login is for your company's own screens. Nothing here is missing from your account."
        >
          <a class="btn btn-primary" routerLink="/dashboard">Back to Home</a>
        </app-empty-state>
      </section>
    </main>
  `,
})
export class NotAllowedComponent {}
