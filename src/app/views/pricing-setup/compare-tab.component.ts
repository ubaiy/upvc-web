import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { InrPipe } from 'src/app/shared/pipes/inr.pipe';
import { ComparedWindow, Comparison, SystemSummary } from './pricing-setup.models';
import { PricingSetupService } from './pricing-setup.service';

/** The words of the link beside a window the bill of materials cannot price. */
export function fixWords(place: Record<string, string | number>): string {
  if (place['tab'] === 'figures') return 'Set it in Rates and figures';
  if (place['tab'] === 'hardware') return 'Open Hardware sets';
  if (place['role']) return 'Give the profile';
  return place['system'] ? 'Open the system' : 'Open Profile systems';
}

/** "frame", "sash + mesh sash": the role codes of a row as words. */
export function roleWords(role: string): string {
  return role.replace(/_/g, ' ').replace(/\+/g, ' + ');
}

/**
 * Compare (GET pricing-setup/compare, card T186): the company's own last saved windows priced
 * today by the area formula and by the bill of materials, side by side, with the difference and
 * a total. A row opens the bill of materials of its window in short; a window the new method
 * cannot price says why, in the api's sentence, with a link to where it is fixed. Read only:
 * every figure is the api's, nothing is worked out here and nothing is saved.
 */
@Component({
  selector: 'app-setup-compare',
  standalone: true,
  imports: [CommonModule, RouterModule, SharedComponentsModule, InrPipe],
  templateUrl: './compare-tab.component.html',
  styleUrls: ['./setup.scss'],
})
export class CompareTabComponent implements OnInit {
  state: 'loading' | 'error' | 'ready' = 'loading';
  loadError = '';
  answer: Comparison | null = null;
  /** The line whose bill of materials is open. */
  open: number | null = null;
  /** The systems in use, and the one the windows of no system are priced as (none by default). */
  systems: SystemSummary[] = [];
  asSystem: number | null = null;

  fix = fixWords;
  role = roleWords;

  constructor(private setup: PricingSetupService) {}

  ngOnInit(): void {
    this.load();
    // The picker is an extra: without the list the table still stands.
    this.setup.checklist().subscribe({ next: (list) => (this.systems = list.systems.filter((s) => !s.retired)), error: () => undefined });
  }

  priceAs(id: string): void {
    this.asSystem = Number(id) || null;
    this.load();
  }

  load(): void {
    this.state = 'loading';
    this.setup.compare(this.asSystem).subscribe({
      next: (answer) => {
        this.answer = answer;
        this.state = 'ready';
      },
      error: (e: Error) => {
        this.loadError = e.message;
        this.state = 'error';
      },
    });
  }

  toggle(w: ComparedWindow): void {
    this.open = this.open === w.line_id ? null : w.line_id;
  }

  trackWindow = (_: number, w: ComparedWindow): number => w.line_id;
}
