import { ChangeDetectionStrategy, Component } from '@angular/core';

import { PRODUCT_NAME } from 'src/app/shared/configs/product';
import { TERMS_VERSION } from 'src/app/shared/configs/signup';

/**
 * /auth/terms: PLACEHOLDER (card T140). The terms of use are not written yet; the owner of the
 * product supplies the text. The version shown is the one the sign-up form sends to the api.
 */
@Component({
  selector: 'app-terms',
  template: `
    <app-auth-layout heading="Terms of use" [lead]="'Version ' + version" pageTitle="Terms of use">
      <div class="stack-4 terms-text">
        <app-callout tone="info">The full terms are being written and will be on this page before the trial ends.</app-callout>
        <p>Until then, in short:</p>
        <ul>
          <li>The trial is free. We ask for no card and take no payment during it.</li>
          <li>The customers, prices and quotations you enter belong to you.</li>
          <li>{{ product }} works out prices from the rates you enter. Check a quotation before you send it.</li>
        </ul>
        <p class="muted small"><a routerLink="/auth/signup">Back to the free trial</a></p>
      </div>
    </app-auth-layout>
  `,
  styles: ['.terms-text { margin-block-start: var(--s-8); } ul { padding-inline-start: var(--s-5); display: grid; gap: var(--s-2); }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsComponent {
  readonly product = PRODUCT_NAME;
  readonly version = TERMS_VERSION;
}
