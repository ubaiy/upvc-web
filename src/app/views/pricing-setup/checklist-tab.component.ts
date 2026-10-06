import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';

import { AccessService } from 'src/app/shared/access/access.service';
import { OwnRatesComponent } from 'src/app/shared/access/own-rates.component';
import { hasExampleRates } from 'src/app/shared/access/starter-catalogue';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { Checklist, ExampleValue, Missing, SystemSummary } from './pricing-setup.models';
import { PricingSetupService } from './pricing-setup.service';

/** Where a missing thing is fixed: the query string of /pricing-setup. */
export function placeOf(missing: Missing, systemId?: number): Record<string, string | number> {
  if (missing.key) return { tab: 'figures', key: missing.key };
  if (missing.code === 'no_hardware_set') return { tab: 'hardware' };
  if (missing.code === 'no_system' || missing.code === 'no_system_ready' || !systemId) return { tab: 'systems' };
  return missing.role ? { tab: 'systems', system: systemId, role: missing.role } : { tab: 'systems', system: systemId };
}

/** The words of the link beside a missing thing. */
export function fixLabel(missing: Missing, systemId?: number): string {
  if (missing.key) return 'Set it in Rates and figures';
  if (missing.code === 'no_hardware_set') return 'Open Hardware sets';
  if (missing.code === 'no_system') return 'Add a profile system';
  if (!systemId) return 'Open Profile systems';
  return missing.role ? 'Give the profile' : 'Open the system';
}

/**
 * The check list (GET pricing-setup): what is ready and what is missing for a price, in the
 * api's own sentences, each with a link to where it is fixed. While the company is still on the
 * example pack the page says so, lists each example value with its source and how far it can be
 * trusted, and offers "These are my rates now".
 */
@Component({
  selector: 'app-setup-checklist',
  standalone: true,
  imports: [CommonModule, RouterModule, SharedComponentsModule, OwnRatesComponent],
  templateUrl: './checklist-tab.component.html',
  styleUrls: ['./setup.scss'],
})
export class ChecklistTabComponent implements OnInit, OnDestroy {
  state: 'loading' | 'error' | 'ready' = 'loading';
  loadError = '';
  list: Checklist | null = null;

  private sub = new Subscription();

  constructor(private setup: PricingSetupService, private access: AccessService) {}

  ngOnInit(): void {
    this.load();
    // "These are my rates now" changes GET me; the example block of the check list goes with it.
    this.sub.add(
      this.access.state$.subscribe((state) => {
        if (this.list?.example && state?.me && !hasExampleRates(state)) this.load();
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  load(): void {
    this.state = 'loading';
    this.setup.checklist().subscribe({
      next: (list) => {
        this.list = list;
        this.state = 'ready';
      },
      error: (e: Error) => {
        this.loadError = e.message;
        this.state = 'error';
      },
    });
  }

  get inUse(): SystemSummary[] {
    return (this.list?.systems ?? []).filter((s) => !s.retired);
  }

  get readyCount(): number {
    return this.inUse.filter((s) => s.ready).length;
  }

  get methodLabel(): string {
    return this.list?.methods.find((m) => m.key === this.list?.method)?.label ?? this.list?.method ?? '';
  }

  get flagged(): ExampleValue[] {
    return (this.list?.example?.to_confirm ?? []).filter((v) => v.flagged);
  }

  place = placeOf;
  fix = fixLabel;

  shown(v: ExampleValue): string {
    return v.value === null || v.value === undefined ? 'No price' : `${v.value}${v.unit ? ' ' + v.unit : ''}`;
  }

  trackSystem = (_: number, s: SystemSummary): number => s.id;
}
