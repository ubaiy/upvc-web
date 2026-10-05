import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';

import { WriteDirective } from 'src/app/shared/access/write.directive';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ToastService } from 'src/app/shared/services/toast.service';
import {
  EXTRA_RATE_KEYS,
  ExtraRateKey,
  ExtraRates,
  PivotHardwareItem,
  PricingExtras,
  PricingExtrasRefusal,
  PricingExtrasService,
} from '../pricing-extras.service';

/** One rate of the card: its words, its unit, and what is typed. */
export interface ExtraRateField {
  key: ExtraRateKey;
  label: string;
  /** One plain line under the box. */
  text: string;
  /** Printed after the box. */
  unit: string;
  /** Rupees (a ₹ before the box) or a percentage. */
  money: boolean;
  /** As typed. Empty = not set. */
  value: string;
}

const WORDS: Record<ExtraRateKey, { label: string; text: string; unit: string }> = {
  sash_bar_rate_m: {
    label: 'Bar inside a sash or shutter',
    text: 'Charged for every metre of bar inside a sash or shutter.',
    unit: 'per metre',
  },
  bend_rate_per_bend: {
    label: 'Bending, for each bent piece',
    text: 'Charged once for every piece of profile bent to a curve, in the frame or in a sash.',
    unit: 'per bend',
  },
  bend_rate_per_m: {
    label: 'Bending, for each metre bent',
    text: 'Charged for every metre of profile that is bent, measured along the curve.',
    unit: 'per metre',
  },
  shaped_glass_surcharge_pct: {
    label: 'Extra on shaped glass',
    text: 'Added to the price of a pane that is cut to a curve or a slope. The pane itself is charged on its rectangle.',
    unit: '%',
  },
};

/** The api's unit in the page's words; the page's own when the api names none it knows. */
function unitOf(key: ExtraRateKey, said: string | undefined): string {
  const unit = String(said ?? '').toLowerCase();
  if (unit === 'percent' || unit === '%') return '%';
  if (unit.endsWith('per m')) return 'per metre';
  if (unit.endsWith('per bend')) return 'per bend';
  return WORDS[key].unit;
}

export function extraRateFields(answer: PricingExtras): ExtraRateField[] {
  return EXTRA_RATE_KEYS.map((key) => {
    const unit = unitOf(key, answer.units[key]);
    const rate = answer.rates[key];
    return { key, label: WORDS[key].label, text: WORDS[key].text, unit, money: unit !== '%', value: rate === null ? '' : String(rate) };
  });
}

/** What PUT takes, from what is typed. Empty = null (not set). */
export function extraRatesFrom(fields: ExtraRateField[]): ExtraRates {
  const out = {} as ExtraRates;
  for (const f of fields) {
    const typed = String(f.value ?? '').trim();
    out[f.key] = typed === '' ? null : Number(typed);
  }
  return out;
}

/**
 * The "Bars, bending and shaped glass" card of Settings → Pricing and tax
 * (card T144): the four rates the api prices a bar in a palla, a bent
 * profile and a shaped pane with. A rate that is not set charges nothing,
 * and the quotation says so: the card marks it.
 */
@Component({
  selector: 'app-pricing-extras-card',
  standalone: true,
  imports: [WriteDirective, CommonModule, FormsModule, RouterModule, SharedComponentsModule],
  templateUrl: './pricing-extras-card.component.html',
  styleUrls: ['../settings-tab.scss', './structure-rates-tab.component.scss'],
  styles: [
    `
      .input-group .unit { white-space: nowrap; }
      .pivot { margin: 0; padding: 0; list-style: none; }
      .pivot li { display: flex; justify-content: space-between; gap: var(--s-4); padding-block: var(--s-1); }
      .pivot-head { font-size: var(--fs-14); font-weight: var(--fw-semibold); }
    `,
  ],
})
export class PricingExtrasCardComponent implements OnInit {
  /** `absent`: this api has no such route yet. */
  state: 'loading' | 'error' | 'absent' | 'ready' = 'loading';
  loadError = '';
  fields: ExtraRateField[] = [];
  missing = new Set<ExtraRateKey>();
  pivot: PivotHardwareItem[] = [];
  /** The api's refusal of one figure, by rate. */
  refused: Partial<Record<ExtraRateKey, string>> = {};
  saving = false;
  saveError = '';
  dirty = false;
  submitted = false;

  constructor(
    private readonly service: PricingExtrasService,
    private readonly toast: ToastService,
    private readonly route: ActivatedRoute,
    private readonly host: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state = 'loading';
    this.service.load().subscribe({
      next: (answer) => {
        if (!answer) {
          this.state = 'absent';
          return;
        }
        this.show(answer);
        this.state = 'ready';
        // A "Set these rates" link of a price (…?tab=pricing&rates=extras) lands on this card.
        if (this.route.snapshot.queryParamMap?.get('rates') === 'extras') {
          setTimeout(() => this.host.nativeElement.scrollIntoView?.({ block: 'start' }), 50);
        }
      },
      error: (e: Error) => {
        this.loadError = e.message;
        this.state = 'error';
      },
    });
  }

  private show(answer: PricingExtras): void {
    this.fields = extraRateFields(answer);
    this.missing = new Set(answer.missing);
    this.pivot = answer.pivot_hardware.items;
    this.refused = {};
    this.dirty = false;
    this.submitted = false;
  }

  get missingFields(): ExtraRateField[] {
    return this.fields.filter((f) => this.missing.has(f.key));
  }

  inputId(key: string): string {
    return 'extra-' + key.replace(/_/g, '-');
  }

  focusField(key: string): void {
    document.getElementById(this.inputId(key))?.focus();
  }

  /** Not set (or 0) as the api last said, and still nothing above 0 typed. */
  isMissing(f: ExtraRateField): boolean {
    return this.missing.has(f.key) && !(Number(String(f.value ?? '').trim()) > 0);
  }

  invalid(f: ExtraRateField): boolean {
    const typed = String(f.value ?? '').trim();
    if (typed === '') return false;
    const n = Number(typed);
    return !Number.isFinite(n) || n < 0 || (!f.money && n > 100) || Math.abs(Math.round(n * 100) / 100 - n) > 1e-9;
  }

  typed(f: ExtraRateField): void {
    this.dirty = true;
    delete this.refused[f.key];
  }

  save(): void {
    this.submitted = true;
    this.saveError = '';
    if (this.saving || this.fields.some((f) => this.invalid(f))) return;
    this.saving = true;
    this.service.save(extraRatesFrom(this.fields)).subscribe({
      next: (answer) => {
        this.saving = false;
        this.show(answer);
        this.toast.showSuccess('Rates saved');
      },
      error: (e: PricingExtrasRefusal) => {
        this.saving = false;
        this.saveError = e.message;
        this.refused = e.fields ?? {};
      },
    });
  }

  trackField = (_: number, f: ExtraRateField): string => f.key;
}
