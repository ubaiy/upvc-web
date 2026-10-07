import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { RouterModule } from '@angular/router';

import { WriteDirective } from 'src/app/shared/access/write.directive';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ToastService } from 'src/app/shared/services/toast.service';
import { CatalogueAdapter } from '../masters/catalogue.adapter';
import { PriceFactors, ProfileRow } from '../masters/catalogue.model';
import { ProfileDialogComponent } from '../masters/profile-dialog.component';
import { placeOf, fixLabel } from './checklist-tab.component';
import { ProductRow, SetupRefusal, SystemDetail, SystemRole } from './pricing-setup.models';
import { PricingSetupService } from './pricing-setup.service';
import { SystemRulesComponent } from './system-rules.component';

/** The parts every window has. The others (transom, false mullion, door sashes, steel of one part ...) are under "More parts". */
const MAIN_PARTS = ['frame', 'sash', 'shutter', 'mullion', 'bead', 'reinforcement'];

/**
 * One profile system (GET pricing-setup/systems/{id}): what it still misses, its trial windows,
 * its profiles by the part each plays, and its cutting rules.
 * A profile is entered in ONE place, the Catalogue (card T187): a part here takes a profile of the
 * catalogue (PUT .../roles), and "New profile" or "Change" opens the form of the Catalogue itself.
 * The rules are one line until "Customise" is pressed.
 */
@Component({
  selector: 'app-setup-system',
  standalone: true,
  imports: [CommonModule, RouterModule, SharedComponentsModule, WriteDirective, SystemRulesComponent, ProfileDialogComponent],
  templateUrl: './system-detail.component.html',
  styleUrls: ['./setup.scss'],
})
export class SystemDetailComponent implements OnChanges {
  @Input() id!: number;
  /** The part a line of the check list pointed at. */
  @Input() role = '';

  state: 'loading' | 'error' | 'ready' = 'loading';
  loadError = '';
  detail: SystemDetail | null = null;

  /** Profiles of the catalogue that are a part of no system: offered for an empty part. */
  free: ProductRow[] = [];
  saving = false;
  errors: string[] = [];
  customise = false;

  /** The form of the Catalogue, opened for a part. */
  dialogOpen = false;
  editing: ProfileRow | null = null;
  preset: { profile_system_id: number; role: string; category: string } | null = null;
  factors: PriceFactors | null = null;

  place = placeOf;
  fix = fixLabel;

  constructor(private setup: PricingSetupService, private catalogue: CatalogueAdapter, private toast: ToastService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['id']) {
      this.load();
      this.catalogue.factors().subscribe({ next: (f) => (this.factors = f), error: () => undefined });
    }
  }

  load(): void {
    if (!this.detail || this.detail.system.id !== this.id) this.state = 'loading';
    this.setup.system(this.id).subscribe({
      next: (detail) => {
        this.detail = detail;
        this.state = 'ready';
      },
      error: (e: Error) => {
        this.loadError = e.message;
        this.state = 'error';
      },
    });
    this.setup.products().subscribe({
      next: (rows) => (this.free = rows.filter((row) => !row.role || !row.profile_system_id)),
      error: () => undefined,
    });
  }

  /** The rules were saved: the answer is the whole system again. */
  onRules(detail: SystemDetail): void {
    this.detail = detail;
  }

  get filled(): number {
    return (this.detail?.roles ?? []).filter((r) => r.profile).length;
  }

  get main(): SystemRole[] {
    return (this.detail?.roles ?? []).filter((r) => MAIN_PARTS.includes(r.role) && (r.required || r.role === 'mullion' || !!r.profile));
  }

  get more(): SystemRole[] {
    const main = new Set(this.main);
    return (this.detail?.roles ?? []).filter((r) => !main.has(r));
  }

  get moreFilled(): number {
    return this.more.filter((r) => r.profile).length;
  }

  /** "More parts" stands open when the check list pointed into it. */
  get moreOpen(): boolean {
    return this.more.some((r) => r.role === this.role);
  }

  /** The rules in one line: how many hold a value, and how many of those are still a pack's placeholder. */
  get rulesLine(): { set: number; placeholders: number; own: number } {
    const set = (this.detail?.rules ?? []).filter((r) => r.is_set);
    const placeholders = set.filter((r) => r.is_placeholder).length;
    return { set: set.length, placeholders, own: set.length - placeholders };
  }

  basisLabel(basis: string | null | undefined): string {
    return basis === 'per_kg' ? 'Per kg' : basis === 'per_m' ? 'Per metre' : 'The company’s way';
  }

  get systems(): { id: number; name: string }[] {
    return this.detail ? [{ id: this.detail.system.id, name: this.detail.system.name }] : [];
  }

  get categories(): string[] {
    return [...new Set([this.detail?.system.category, this.editing?.category].filter((c): c is string => !!c))];
  }

  /** A new profile for the part: the form of the Catalogue, with the system and the part filled in. */
  add(role: SystemRole): void {
    this.editing = null;
    this.preset = { profile_system_id: this.id, role: role.role, category: this.detail!.system.category };
    this.dialogOpen = true;
  }

  /** The profile of the part, in the form of the Catalogue. */
  change(role: SystemRole): void {
    if (!role.profile) return;
    this.catalogue.profile(role.profile.id).subscribe({
      next: (row) => {
        this.editing = row;
        this.preset = { profile_system_id: this.id, role: role.role, category: row.category };
        this.dialogOpen = true;
      },
      error: (e: Error) => (this.errors = [e.message]),
    });
  }

  /** A profile of the catalogue takes the part (product_id), or the part is emptied (null); the profile stays in the catalogue. */
  give(role: SystemRole, productId: number | null): void {
    if (this.saving) return;
    this.saving = true;
    this.errors = [];
    this.setup.saveRoles(this.id, [{ role: role.role, product_id: productId }]).subscribe({
      next: (detail) => {
        this.saving = false;
        this.detail = detail;
        this.toast.showSuccess(productId ? `${role.label}: saved` : `${role.label}: the part is empty now`);
        this.load();
      },
      error: (e: SetupRefusal) => {
        this.saving = false;
        this.errors = e.errors?.length ? e.errors : [e.message];
      },
    });
  }

  trackRole = (_: number, r: SystemRole): string => r.role;
}
