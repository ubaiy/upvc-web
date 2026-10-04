import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';
import { Title } from '@angular/platform-browser';

import { PRODUCT_NAME } from 'src/app/shared/configs/product';
import { SAMPLE_WINDOWS } from 'src/app/shared/components/window-thumb/window-drawing';

/**
 * The frame of every signed-out screen (sign in, forgot password, and sign up
 * when card S1 rebuilds it): brand, heading and the form on one side, a sample
 * window with its price on the other. The side panel is hidden at 1024 px and
 * below.
 *
 *   <app-auth-layout heading="Welcome back" lead="Sign in to your workshop.">
 *     <form>...</form>
 *   </app-auth-layout>
 */
@Component({
  selector: 'app-auth-layout',
  templateUrl: './auth-layout.component.html',
  styleUrls: ['./auth-layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthLayoutComponent implements OnChanges {
  /** The page's h1. */
  @Input() heading = '';

  /** One sentence under the heading. */
  @Input() lead?: string;

  /** Browser tab title; the heading is used when this is not set. */
  @Input() pageTitle?: string;

  readonly product = PRODUCT_NAME;

  readonly sample = SAMPLE_WINDOWS['mixed3'];

  /** Price of the sample window, as in the mockup. */
  readonly samplePrice = 10399.37;

  constructor(private title: Title) {}

  ngOnChanges(): void {
    this.title.setTitle(`${this.pageTitle || this.heading} · ${this.product}`);
  }
}
