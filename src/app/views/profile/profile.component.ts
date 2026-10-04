import { Component, OnDestroy, OnInit, Type } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';

import { CompanyTabComponent } from './tabs/company-tab.component';
import { DocumentsTabComponent } from './tabs/documents-tab.component';
import { PricingTaxTabComponent } from './tabs/pricing-tax-tab.component';
import { TeamTabComponent } from './tabs/team-tab.component';
import { YourProfileTabComponent } from './tabs/your-profile-tab.component';

export { maxImageBytes, validImageTypes } from './image-rules';

export interface SettingsTab {
  /** Value of the `tab` query parameter: /profile?tab=pricing. */
  id: string;
  label: string;
  component: Type<unknown>;
}

export const SETTINGS_TABS: SettingsTab[] = [
  { id: 'company', label: 'Company', component: CompanyTabComponent },
  { id: 'team', label: 'Team', component: TeamTabComponent },
  { id: 'pricing', label: 'Pricing and tax', component: PricingTaxTabComponent },
  { id: 'documents', label: 'Documents', component: DocumentsTabComponent },
  { id: 'you', label: 'Your profile', component: YourProfileTabComponent },
];

/**
 * Settings: one page, one tab strip (card U7, mockup `billing.html`).
 *
 * The component keeps its old name and route (`/profile`, where `/settings`
 * redirects) because the routing module and the app module belong to card U0.
 * It is declared in AppModule, so each tab is a standalone component drawn
 * through an outlet and brings its own imports.
 */
@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent implements OnInit, OnDestroy {
  readonly tabs = SETTINGS_TABS;
  active: SettingsTab = SETTINGS_TABS[0];

  private sub?: Subscription;

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.sub = this.route.queryParamMap.subscribe((params) => {
      this.active = this.tabs.find((tab) => tab.id === params.get('tab')) ?? this.tabs[0];
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
