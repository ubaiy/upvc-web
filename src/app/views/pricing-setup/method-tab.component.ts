import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';

import { WriteDirective } from 'src/app/shared/access/write.directive';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { InrPipe } from 'src/app/shared/pipes/inr.pipe';
import { ConfirmDialogComponent } from '../bills/confirm-dialog.component';
import { fixLabel, placeOf } from './checklist-tab.component';
import { Checklist, Comparison, MethodAnswer, MethodChoice, SetupRefusal } from './pricing-setup.models';
import { PricingSetupService } from './pricing-setup.service';

/** The method that prices from the company's own profiles; it needs the check list complete. */
export const BOM_METHOD = 'bom_v1';

/** "41 saved lines priced by the area formula, 3 by the bill of materials." */
export function savedLinesText(answer: MethodAnswer, methods: MethodChoice[]): string {
  const parts = Object.entries(answer.saved_lines ?? {})
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${count} by “${methods.find((m) => m.key === key)?.label ?? key}”`);
  return parts.length ? `Lines already saved keep their price: ${parts.join(', ')}.` : 'No saved line was touched.';
}

/**
 * The pricing method of the company (GET pricing-setup; PUT pricing-setup/method): which one is
 * live, whether the bill of materials is ready, and the switch. The owner is told before the yes
 * that prices will change; a saved line keeps the price it was saved with until it is saved again.
 */
@Component({
  selector: 'app-setup-method',
  standalone: true,
  imports: [CommonModule, RouterModule, SharedComponentsModule, WriteDirective, ConfirmDialogComponent, InrPipe],
  templateUrl: './method-tab.component.html',
  styleUrls: ['./setup.scss'],
})
export class MethodTabComponent implements OnInit {
  state: 'loading' | 'error' | 'ready' = 'loading';
  loadError = '';
  list: Checklist | null = null;
  asking: MethodChoice | null = null;
  busy = false;
  /** The api's refusal: each thing still missing, in its own words. */
  errors: string[] = [];
  done = '';
  /** What the last saved windows cost under both methods: shown in the confirm before the yes. */
  compared: Comparison | null = null;
  compareError = '';

  place = placeOf;
  fix = fixLabel;

  constructor(private setup: PricingSetupService) {}

  ngOnInit(): void {
    this.load();
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

  /** The bill of materials cannot be switched on before the check list is complete; back is always allowed. */
  blocked(m: MethodChoice): boolean {
    return m.key === BOM_METHOD && !this.list?.ready;
  }

  ask(m: MethodChoice): void {
    this.errors = [];
    this.done = '';
    this.asking = m;
    this.compared = null;
    this.compareError = '';
    this.setup.compare().subscribe({ next: (c) => (this.compared = c), error: (e: Error) => (this.compareError = e.message) });
  }

  confirm(): void {
    const m = this.asking;
    const list = this.list;
    if (!m || !list || this.busy) return;
    this.busy = true;
    this.errors = [];
    this.setup.setMethod(m.key).subscribe({
      next: (answer) => {
        this.busy = false;
        this.asking = null;
        this.list = { ...list, method: answer.method };
        this.done = `${answer.changed ? 'The live method is now' : 'The live method was already'} “${m.label}”. ${savedLinesText(answer, list.methods)}`;
      },
      error: (e: SetupRefusal) => {
        this.busy = false;
        this.asking = null;
        this.errors = e.errors?.length ? e.errors : [e.message];
      },
    });
  }
}
