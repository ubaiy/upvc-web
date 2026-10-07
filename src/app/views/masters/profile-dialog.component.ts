import { WriteDirective } from 'src/app/shared/access/write.directive';
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

import { SharedComponentsModule } from '../../shared/components/shared-components.module';
import { CatalogueAdapter } from './catalogue.adapter';
import {
  PROFILE_ROLES,
  PriceFactors,
  ProfileRates,
  ProfileRow,
  deriveRates,
  fixSpelling,
  hasFactors,
} from './catalogue.model';

const WEIGHT = /^\d+(\.\d{1,3})?$/;
const SIZE = /^\d+(\.\d{1,4})?$/;
const RATE = /^\d+(\.\d{1,2})?$/;

/**
 * Add or edit a profile: five fields (category, code, name, weight, used as).
 * Rates are worked out from the weight and the company's rate per kg; the four
 * drawing sizes sit in a closed group because most profiles never need them.
 * The group "For the new pricing" (card T187) is the one place where a profile gets
 * its profile system, how it is bought and its bar: Pricing setup opens this form too.
 */
@Component({
  selector: 'app-profile-dialog',
  standalone: true,
  imports: [WriteDirective, CommonModule, ReactiveFormsModule, DialogModule, ButtonModule, SharedComponentsModule],
  templateUrl: './profile-dialog.component.html',
})
export class ProfileDialogComponent implements OnChanges {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  /** The profile to edit; null adds a new one. */
  @Input() profile: ProfileRow | null = null;
  @Input() categories: string[] = [];
  @Input() factors: PriceFactors | null = null;
  /** The profile systems in use. */
  @Input() systems: { id: number; name: string }[] = [];
  /** Opened from a part of a profile system (Pricing setup): a new profile starts as that part, and needs no rate of the area formula. */
  @Input() preset: { profile_system_id: number; role: string; category: string } | null = null;
  @Output() saved = new EventEmitter<ProfileRow>();

  readonly roles = PROFILE_ROLES;
  readonly fixSpelling = fixSpelling;
  form: FormGroup = this.build();
  submitted = false;
  saving = false;
  error = '';

  constructor(private fb: FormBuilder, private adapter: CatalogueAdapter) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.open();
    }
  }

  get title(): string {
    return this.profile ? 'Edit profile' : 'Add profile';
  }

  get hasSizes(): boolean {
    const p = this.profile;
    return !!p && [p.face_width_mm, p.profile_depth_mm, p.rebate_mm, p.sightline_mm].some((v) => v != null);
  }

  get hasNewPricing(): boolean {
    const p = this.profile;
    return !!this.preset || (!!p && (p.profile_system_id != null || p.charge_basis != null));
  }

  /** The rates this profile will be saved with, or null when they cannot be worked out. */
  get rates(): ProfileRates | null {
    const kg = Number(this.form.value.kg_meter);
    const control = this.form.get('kg_meter');
    if (!control?.valid || !(kg > 0)) {
      return null;
    }
    const p = this.profile;
    if (p && kg === Number(p.kg_meter)) {
      return p;
    }
    if (!hasFactors(this.factors)) {
      return null;
    }
    // A coloured weight that differs from the plain one is kept in proportion.
    const colourKg = p && p.kg_meter > 0 ? (p.kg_meter_color / p.kg_meter) * kg : kg;
    return deriveRates(kg, colourKg, this.factors);
  }

  bad(name: string): boolean {
    const control = this.form.get(name);
    return !!control && control.invalid && (this.submitted || control.touched);
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  submit(): void {
    this.submitted = true;
    this.error = '';
    // From a profile system the bill of materials reads the weight: the rates of the area formula stay as they are (0 for a new profile).
    const rates = this.rates ?? (this.preset ? pickRates(this.profile) : null);
    if (this.form.invalid || this.saving) {
      return;
    }
    if (!rates) {
      this.error = 'Set your rate per kg first: close this and choose "Update rates".';
      return;
    }
    const v = this.form.value;
    const kg = Number(v.kg_meter);
    const p = this.profile;
    const body = {
      ...(p ?? {}),
      category: v.category.trim(),
      profile_code: v.profile_code.trim(),
      profile_name: v.profile_name.trim(),
      kg_meter: kg,
      // The same weight: the coloured weight stays to the last digit (0.4229 was saved back as 0.423).
      kg_meter_color: p && p.kg_meter > 0 ? (kg === p.kg_meter ? p.kg_meter_color : +((p.kg_meter_color / p.kg_meter) * kg).toFixed(3)) : kg,
      ...rates,
      role: v.role || null,
      face_width_mm: num(v.face_width_mm),
      profile_depth_mm: num(v.profile_depth_mm),
      rebate_mm: num(v.rebate_mm),
      sightline_mm: num(v.sightline_mm),
      profile_system_id: num(v.profile_system_id),
      charge_basis: v.charge_basis || null,
      bar_length_mm: num(v.bar_length_mm),
      // Bought per metre: the rate typed is the rate per metre of the profile.
      ...(v.charge_basis === 'per_m' && num(v.own_rate_meter) !== null ? { rate_meter: Number(v.own_rate_meter) } : {}),
    } as ProfileRow;

    this.saving = true;
    (p ? this.adapter.saveProfile(body) : this.adapter.addProfile(body)).subscribe({
      next: (row) => {
        this.saving = false;
        this.saved.emit(row);
        this.close();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.adapter.message(err, 'The profile was not saved. Try again.');
      },
    });
  }

  private open(): void {
    this.submitted = false;
    this.saving = false;
    this.error = '';
    this.form = this.build();
    const p = this.profile;
    if (p) {
      this.form.patchValue({ ...p, role: p.role ?? '', profile_system_id: p.profile_system_id ?? '', charge_basis: p.charge_basis ?? '', own_rate_meter: p.rate_meter || null });
    } else if (this.preset) {
      this.form.patchValue(this.preset);
    } else if (this.categories.length === 1) {
      this.form.patchValue({ category: this.categories[0] });
    }
  }

  private build(): FormGroup {
    const fb = this.fb ?? new FormBuilder();
    return fb.group({
      category: ['', [Validators.required, Validators.maxLength(100)]],
      profile_code: ['', [Validators.required, Validators.maxLength(100)]],
      profile_name: ['', [Validators.required, Validators.maxLength(190)]],
      kg_meter: ['', [Validators.required, Validators.pattern(WEIGHT), Validators.min(0.001), Validators.max(100)]],
      role: [''],
      face_width_mm: [null, [Validators.pattern(SIZE)]],
      profile_depth_mm: [null, [Validators.pattern(SIZE)]],
      rebate_mm: [null, [Validators.pattern(SIZE)]],
      sightline_mm: [null, [Validators.pattern(SIZE)]],
      profile_system_id: [''],
      charge_basis: [''],
      own_rate_meter: [null, [Validators.pattern(RATE)]],
      bar_length_mm: [null, [Validators.pattern(/^\d+$/), Validators.min(500), Validators.max(20000)]],
    });
  }
}

function pickRates(p: ProfileRow | null): ProfileRates {
  return { rate_meter: p?.rate_meter ?? 0, rate_bar: p?.rate_bar ?? 0, rate_meter_color: p?.rate_meter_color ?? 0, rate_bar_color: p?.rate_bar_color ?? 0 };
}

function num(value: unknown): number | null {
  return value === null || value === undefined || value === '' ? null : Number(value);
}
