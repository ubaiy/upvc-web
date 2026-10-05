import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';

import { AccessService } from 'src/app/shared/access/access.service';
import { AccessState } from 'src/app/shared/access/access.models';
import { OwnRatesComponent } from 'src/app/shared/access/own-rates.component';
import { EXAMPLE_RATES_TEXT, hasExampleRates, trialLine } from 'src/app/shared/access/starter-catalogue';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { PRODUCT_NAME } from 'src/app/shared/configs/product';

export interface WelcomeStep {
  title: string;
  text: string;
  link: string;
  queryParams?: Record<string, string>;
  label: string;
  /** The page needs this ability of GET me; a role without it reads the step and gets no button. */
  ability: string;
}

/**
 * The three things a new fabricator does first, in the order that makes his first quotation right
 * (docs/product/onboarding/options.md: his own rates come first).
 */
export function welcomeSteps(exampleRates: boolean): WelcomeStep[] {
  return [
    {
      title: 'Put in your own rates',
      text: exampleRates
        ? EXAMPLE_RATES_TEXT + ' Profiles, glass, hardware and labour are in the catalogue.'
        : 'Profiles, glass, hardware and labour are in the catalogue. Check that each rate is what you pay today.',
      link: '/catalogue',
      label: 'Open the catalogue',
      ability: 'catalogue.view',
    },
    {
      title: 'Add your company details and GSTIN for the documents',
      text: 'Address, logo, GSTIN and bank details are printed on every quotation and bill.',
      link: '/profile',
      queryParams: { tab: 'company' },
      label: 'Open Settings',
      ability: 'settings.write',
    },
    {
      title: 'Make your first quotation',
      text: 'Pick a customer, draw the window and the price is worked out from your rates.',
      link: '/quotation/add',
      label: 'New quotation',
      ability: 'quotations.write',
    },
  ];
}

/** /welcome: where sign-up lands (card T140). Reachable later; it reads only what GET me and GET subscription say. */
@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [CommonModule, RouterModule, SharedComponentsModule, OwnRatesComponent],
  templateUrl: './welcome.component.html',
  styleUrls: ['./welcome.component.scss'],
})
export class WelcomeComponent implements OnInit, OnDestroy {
  readonly product = PRODUCT_NAME;
  company = '';
  trial = '';
  steps = welcomeSteps(false);
  can: Record<string, boolean> = {};

  private subscription = new Subscription();

  constructor(private access: AccessService) {}

  ngOnInit(): void {
    this.subscription.add(this.access.state$.subscribe((state) => this.read(state)));
    this.subscription.add(this.access.load().subscribe());
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  private read(state: AccessState): void {
    this.company = state.me?.company?.name || '';
    this.trial = trialLine(state);
    this.steps = welcomeSteps(hasExampleRates(state));
    this.can = {};
    for (const step of this.steps) {
      this.can[step.ability] = this.access.can(step.ability);
    }
  }
}
