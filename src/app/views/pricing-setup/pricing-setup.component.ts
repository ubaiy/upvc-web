import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ChecklistTabComponent } from './checklist-tab.component';
import { CompareTabComponent } from './compare-tab.component';
import { FiguresTabComponent } from './figures-tab.component';
import { HardwareTabComponent } from './hardware-tab.component';
import { MethodTabComponent } from './method-tab.component';
import { QuickSetupComponent } from './quick-setup.component';
import { SystemDetailComponent } from './system-detail.component';
import { SystemsTabComponent } from './systems-tab.component';

/** The parts under Advanced: everything the quick setup does not ask. */
export const SETUP_TABS = [
  { id: 'checklist', label: 'Check list' },
  { id: 'systems', label: 'Profile systems' },
  { id: 'hardware', label: 'Hardware sets' },
  { id: 'figures', label: 'Rates and figures' },
  { id: 'compare', label: 'Compare' },
  { id: 'method', label: 'Pricing method' },
] as const;
export type SetupTabId = (typeof SETUP_TABS)[number]['id'] | 'quick';

/**
 * Pricing setup (card T182): where a fabricator enters his own profile systems, the role,
 * weight and rate of each profile, the cut rules, the hardware sets and his figures, and sees
 * what is still missing for a price. One address, /pricing-setup; the part shown is in the
 * query string (?tab=systems&system=4), so every line of the check list can link to its place.
 * It opens on the quick setup (card T187); the six parts of before are the group Advanced.
 * Read with `prices.view_cost`, changed with `settings.write`, as the api enforces.
 */
@Component({
  selector: 'app-pricing-setup',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    SharedComponentsModule,
    ChecklistTabComponent,
    SystemsTabComponent,
    SystemDetailComponent,
    HardwareTabComponent,
    FiguresTabComponent,
    CompareTabComponent,
    MethodTabComponent,
    QuickSetupComponent,
  ],
  template: `
    <app-page-header title="Pricing setup" subtitle="Your own profiles, rules, hardware sets and rates: what a window is priced from."></app-page-header>

    <div class="tabs" role="tablist" aria-label="Pricing setup">
      <a class="tab" role="tab" routerLink="/pricing-setup" id="setup-tab-quick" [attr.aria-selected]="tab === 'quick'" aria-controls="setup-panel">Quick setup</a>
      <a class="tab" role="tab" routerLink="/pricing-setup" [queryParams]="{ tab: 'checklist' }" id="setup-tab-advanced" [attr.aria-selected]="tab !== 'quick'" aria-controls="setup-panel">Advanced</a>
    </div>

    <div class="tabs" role="tablist" aria-label="Advanced sections" *ngIf="tab !== 'quick'" data-setup="advanced-tabs">
      <a
        *ngFor="let t of tabs"
        class="tab"
        role="tab"
        routerLink="/pricing-setup"
        [queryParams]="{ tab: t.id }"
        [id]="'setup-tab-' + t.id"
        [attr.aria-selected]="t.id === tab"
        aria-controls="setup-panel"
        >{{ t.label }}</a
      >
    </div>

    <div id="setup-panel" role="tabpanel" [attr.aria-labelledby]="'setup-tab-' + tab" [ngSwitch]="tab">
      <app-setup-quick *ngSwitchCase="'quick'"></app-setup-quick>
      <app-setup-checklist *ngSwitchCase="'checklist'"></app-setup-checklist>
      <ng-container *ngSwitchCase="'systems'">
        <app-setup-system *ngIf="systemId; else list" [id]="systemId" [role]="role"></app-setup-system>
        <ng-template #list><app-setup-systems></app-setup-systems></ng-template>
      </ng-container>
      <app-setup-hardware *ngSwitchCase="'hardware'" [setId]="setId"></app-setup-hardware>
      <app-setup-figures *ngSwitchCase="'figures'" [asked]="key"></app-setup-figures>
      <app-setup-compare *ngSwitchCase="'compare'"></app-setup-compare>
      <app-setup-method *ngSwitchCase="'method'"></app-setup-method>
    </div>
  `,
  styles: [':host { display: block; }'],
})
export class PricingSetupComponent implements OnInit, OnDestroy {
  readonly tabs = SETUP_TABS;
  tab: SetupTabId = 'quick';
  systemId: number | null = null;
  setId: number | null = null;
  /** The role or the figure a line of the check list pointed at. */
  role = '';
  key = '';

  private sub?: Subscription;

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.sub = this.route.queryParamMap.subscribe((params) => {
      const asked = params.get('tab');
      this.tab = SETUP_TABS.find((t) => t.id === asked)?.id ?? 'quick';
      this.systemId = Number(params.get('system')) || null;
      this.setId = Number(params.get('set')) || null;
      this.role = params.get('role') ?? '';
      this.key = params.get('key') ?? '';
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
