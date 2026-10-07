import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Observable, of, switchMap } from 'rxjs';
import { tap } from 'rxjs/operators';

import { WriteDirective } from 'src/app/shared/access/write.directive';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ToastService } from 'src/app/shared/services/toast.service';
import { ConfirmDialogComponent } from '../bills/confirm-dialog.component';
import { placeOf, fixLabel } from './checklist-tab.component';
import { ProductRow, RoleChange, SetupRefusal, SystemDetail, SystemRole, shownNumber, typedNumber, typedText } from './pricing-setup.models';
import { PricingSetupService } from './pricing-setup.service';
import { SystemRulesComponent } from './system-rules.component';

/** The form of one role: a new profile, one of the catalogue, or the profile that holds the role. */
export interface RoleForm {
  role: SystemRole;
  /** `new`: entered here; `pick`: taken from the catalogue; `edit`: the profile of the role. */
  mode: 'new' | 'pick' | 'edit';
  /** The profile of the catalogue: chosen, just added, or being changed. */
  productId: number | null;
  /** The profile as the catalogue holds it; kept so a change sends every field the api asks for. */
  product: ProductRow | null;
  code: string;
  name: string;
  kg: string;
  /** '' = the company's way. */
  basis: '' | 'per_kg' | 'per_m';
  rate: string;
  /** The bar as it is bought, in mm. `barHeld`: what the api holds, so only a change is sent. */
  bar: string;
  barHeld: string;
  face: string;
  depth: string;
  rebate: string;
  sightline: string;
}

const DIMS: { field: 'face' | 'depth' | 'rebate' | 'sightline'; key: keyof ProductRow; label: string }[] = [
  { field: 'face', key: 'face_width_mm', label: 'Face width' },
  { field: 'depth', key: 'profile_depth_mm', label: 'Depth' },
  { field: 'rebate', key: 'rebate_mm', label: 'Rebate' },
  { field: 'sightline', key: 'sightline_mm', label: 'Sightline' },
];

/**
 * One profile system (GET pricing-setup/systems/{id}): what it still misses, its trial windows,
 * its profiles by role with weight, how each is bought and its rate, and its rules.
 * A profile is entered once here: the catalogue row (product/add) and its role, weight and rate
 * (PUT .../roles) are saved one after the other.
 */
@Component({
  selector: 'app-setup-system',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SharedComponentsModule, WriteDirective, ConfirmDialogComponent, SystemRulesComponent],
  templateUrl: './system-detail.component.html',
  styleUrls: ['./setup.scss'],
})
export class SystemDetailComponent implements OnChanges {
  @Input() id!: number;
  /** The role a line of the check list pointed at. */
  @Input() role = '';

  readonly dims = DIMS;
  state: 'loading' | 'error' | 'ready' = 'loading';
  loadError = '';
  detail: SystemDetail | null = null;

  form: RoleForm | null = null;
  saving = false;
  submitted = false;
  formErrors: string[] = [];
  /** Profiles of the catalogue that hold no role yet: offered for an empty role. */
  free: ProductRow[] = [];

  deleting: SystemRole | null = null;
  busy = false;
  deleteError = '';

  place = placeOf;
  fix = fixLabel;

  constructor(private setup: PricingSetupService, private toast: ToastService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['id']) this.load();
  }

  load(): void {
    this.state = 'loading';
    this.form = null;
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
  }

  /** The rules were saved: the answer is the whole system again. */
  onRules(detail: SystemDetail): void {
    this.detail = detail;
  }

  get filled(): number {
    return (this.detail?.roles ?? []).filter((r) => r.profile).length;
  }

  basisLabel(basis: string | null | undefined): string {
    return basis === 'per_kg' ? 'Per kg' : basis === 'per_m' ? 'Per metre' : 'The company’s way';
  }

  open(role: SystemRole): void {
    const p = role.profile;
    this.form = {
      role,
      mode: p ? 'edit' : 'new',
      productId: p?.id ?? null,
      product: null,
      code: p?.profile_code ?? '',
      name: p?.profile_name ?? '',
      kg: shownNumber(p?.kg_meter),
      basis: (p?.charge_basis ?? '') as RoleForm['basis'],
      rate: p?.rate_meter ? String(p.rate_meter) : '',
      bar: shownNumber(p?.bar_length_mm),
      barHeld: shownNumber(p?.bar_length_mm),
      face: '',
      depth: '',
      rebate: '',
      sightline: '',
    };
    this.submitted = false;
    this.saving = false;
    this.formErrors = [];
    // The form is under a long table: it is brought to the eye, and the first box takes the cursor.
    setTimeout(() => {
      const el = document.querySelector('[data-setup="role-form"]');
      el?.scrollIntoView?.({ block: 'center' });
      (el?.querySelector('input[type="text"], select') as HTMLElement | null)?.focus?.({ preventScroll: true });
    });
    if (p) {
      // The sizes of the profile are in the catalogue row, not in the system's answer.
      this.setup.product(p.id).subscribe({
        next: (row) => this.fill(row),
        error: () => undefined,
      });
    } else if (!this.free.length) {
      this.setup.products().subscribe({
        next: (rows) => (this.free = rows.filter((row) => !row.role || !row.profile_system_id)),
        error: () => undefined,
      });
    }
  }

  private fill(row: ProductRow): void {
    const f = this.form;
    if (!f || (f.productId && f.productId !== row.id)) return;
    f.product = row;
    if (!f.bar && !f.barHeld) f.bar = f.barHeld = shownNumber(row.bar_length_mm);
    for (const d of DIMS) f[d.field] = shownNumber(row[d.key]);
  }

  /** A profile of the catalogue is chosen for the role: its code, name and weight are shown. */
  pick(id: number | string): void {
    const f = this.form;
    const row = this.free.find((p) => p.id === Number(id));
    if (!f) return;
    f.productId = row?.id ?? null;
    f.bar = f.barHeld = '';
    if (row) {
      f.code = row.profile_code;
      f.name = row.profile_name;
      f.kg = shownNumber(row.kg_meter);
      this.fill(row);
    }
  }

  bad(value: string, max: number, zero = true): boolean {
    const n = typedNumber(value);
    return n !== null && (!Number.isFinite(n) || n < 0 || n > max || (!zero && n === 0));
  }

  get kgInvalid(): boolean {
    const n = typedNumber(this.form?.kg);
    return n === null || !Number.isFinite(n) || n <= 0 || n > 100;
  }

  get rateInvalid(): boolean {
    const f = this.form;
    return !!f && (this.bad(f.rate, 1000000) || (f.basis === 'per_m' && typedNumber(f.rate) === null));
  }

  /** A whole number of millimetres from 500 to 20000, as the api takes it; empty = not said. */
  get barInvalid(): boolean {
    const n = typedNumber(this.form?.bar);
    return n !== null && (!Number.isInteger(n) || n < 500 || n > 20000);
  }

  get invalid(): boolean {
    const f = this.form;
    if (!f) return true;
    if (f.mode === 'pick') return !f.productId || this.kgInvalid || this.rateInvalid || this.barInvalid;
    return !f.code.trim() || !f.name.trim() || this.kgInvalid || this.rateInvalid || this.barInvalid || DIMS.some((d) => this.bad(f[d.field], 1000));
  }

  save(): void {
    const f = this.form;
    this.submitted = true;
    this.formErrors = [];
    if (!f || !this.detail || this.saving || this.invalid) return;
    this.saving = true;
    this.catalogueRow(f)
      .pipe(switchMap((productId) => this.setup.saveRoles(this.id, [this.change(f, productId)])))
      .subscribe({
        next: (detail) => {
          this.saving = false;
          this.detail = detail;
          this.form = null;
          this.free = [];
          this.toast.showSuccess(`${f.role.label}: saved`);
        },
        error: (e: SetupRefusal) => {
          this.saving = false;
          this.formErrors = e.errors?.length ? e.errors : [e.message];
        },
      });
  }

  /** The catalogue row first: added, changed, or left as it is. Answers its id. */
  private catalogueRow(f: RoleForm): Observable<number> {
    const kg = Number(f.kg);
    const sizes: Partial<ProductRow> = {};
    for (const d of DIMS) (sizes as any)[d.key] = typedNumber(f[d.field]);
    if (f.mode === 'pick' || (f.mode === 'new' && f.productId)) return of(f.productId as number);
    if (f.mode === 'new') {
      // product/add asks for the six rates of the old area formula too; they are 0 for a profile entered here
      // (the bill of materials reads the weight, the basis and the rate per metre).
      const rate = typedNumber(f.rate) ?? 0;
      return this.setup
        .addProduct({ category: this.detail!.system.category, profile_code: f.code.trim(), profile_name: f.name.trim(), kg_meter: kg, rate_meter: rate, rate_bar: 0, kg_meter_color: kg, rate_meter_color: 0, rate_bar_color: 0, ...sizes })
        .pipe(
          // Kept, so a refusal of the role does not add the profile a second time.
          tap((row) => (f.productId = row.id)),
          switchMap((row) => of(row.id))
        );
    }
    const p = f.product;
    const same = !!p && p.profile_code === f.code.trim() && p.profile_name === f.name.trim() && DIMS.every((d) => (p[d.key] ?? null) === (sizes as any)[d.key]);
    if (!p || same) return of(f.productId as number);
    return this.setup
      .updateProduct(p.id, { ...p, profile_code: f.code.trim(), profile_name: f.name.trim(), ...sizes })
      .pipe(switchMap(() => of(p.id)));
  }

  private change(f: RoleForm, productId: number): RoleChange {
    const rate = typedNumber(f.rate);
    const bar = typedText(f.bar) !== f.barHeld ? { bar_length_mm: typedNumber(f.bar) } : {};
    return { role: f.role.role, product_id: productId, kg_meter: Number(f.kg), charge_basis: f.basis || null, ...(rate !== null ? { rate_meter: rate } : {}), ...bar };
  }

  /** The role is emptied; the profile stays in the catalogue. */
  takeOut(role: SystemRole): void {
    if (this.saving) return;
    this.saving = true;
    this.formErrors = [];
    this.setup.saveRoles(this.id, [{ role: role.role, product_id: null }]).subscribe({
      next: (detail) => {
        this.saving = false;
        this.detail = detail;
        this.form = null;
        this.free = [];
        this.toast.showSuccess(`${role.label}: the role is empty now`);
      },
      error: (e: SetupRefusal) => {
        this.saving = false;
        this.formErrors = e.errors?.length ? e.errors : [e.message];
      },
    });
  }

  /** The role is emptied and the profile is removed from the catalogue (refused while a quotation uses it). */
  remove(): void {
    const role = this.deleting;
    const p = role?.profile;
    if (!role || !p || this.busy) return;
    this.busy = true;
    this.deleteError = '';
    this.setup
      .saveRoles(this.id, [{ role: role.role, product_id: null }])
      .pipe(
        tap((detail) => (this.detail = detail)),
        switchMap(() => this.setup.deleteProduct(p.id))
      )
      .subscribe({
        next: () => {
          this.busy = false;
          this.deleting = null;
          this.form = null;
          this.free = [];
          this.toast.showSuccess(`${p.profile_code} removed`);
        },
        error: (e: Error) => {
          this.busy = false;
          this.deleteError = e.message;
        },
      });
  }

  trackRole = (_: number, r: SystemRole): string => r.role;
}
