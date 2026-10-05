import { Component, OnDestroy, OnInit, Type } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';

import { CompanyTabComponent } from './tabs/company-tab.component';
import { allows } from 'src/app/shared/access/access.models';
import { AccessService } from 'src/app/shared/access/access.service';
import { DocumentsTabComponent } from './tabs/documents-tab.component';
import { PlanTabComponent } from './tabs/plan-tab.component';
import { PricingTaxTabComponent } from './tabs/pricing-tax-tab.component';
import { StructureRatesTabComponent } from './tabs/structure-rates-tab.component';
import { TeamTabComponent } from './tabs/team-tab.component';
import { YourProfileTabComponent } from './tabs/your-profile-tab.component';

export { maxImageBytes, validImageTypes } from './image-rules';

export interface SettingsTab {
  /** Value of the `tab` query parameter: /profile?tab=pricing. */
  id: string;
  label: string;
  component: Type<unknown>;
  /** The ability of GET me the tab needs (card T117); none: every signed-in user. */
  ability?: string;
}

export const SETTINGS_TABS: SettingsTab[] = [
  { id: 'company', label: 'Company', component: CompanyTabComponent, ability: 'settings.write' },
  // People, roles and seats; the plan and how to buy one (card T117). The owner's.
  { id: 'team', label: 'Team', component: TeamTabComponent, ability: 'team.manage' },
  { id: 'plan', label: 'Plan', component: PlanTabComponent, ability: 'billing.view' },
  { id: 'pricing', label: 'Pricing and tax', component: PricingTaxTabComponent, ability: 'prices.view_cost' },
  // What a 3D structure of a quotation is priced with (card T123).
  { id: 'structure-rates', label: 'Structure rates', component: StructureRatesTabComponent, ability: 'prices.view_cost' },
  { id: 'documents', label: 'Documents', component: DocumentsTabComponent, ability: 'settings.write' },
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
  /** The tabs of this user: those the abilities of GET me open. A sales user has "Your profile" only. */
  tabs: SettingsTab[] = SETTINGS_TABS;
  /** Every tab there is; `tabs` is the part of it this user has. */
  source: SettingsTab[] = SETTINGS_TABS;
  active: SettingsTab = SETTINGS_TABS[0];

  private asked: string | null = null;
  private sub?: Subscription;

  constructor(private route: ActivatedRoute, private access: AccessService) {}

  ngOnInit(): void {
    this.sub = this.route.queryParamMap.subscribe((params) => {
      this.asked = params.get('tab');
      this.pick();
    });
    this.sub.add(
      this.access.state$.subscribe((state) => {
        this.tabs = this.source.filter((tab) => allows(state, tab.ability));
        this.pick();
      })
    );
  }

  private pick(): void {
    this.active = this.tabs.find((tab) => tab.id === this.asked) ?? this.tabs[0];
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
