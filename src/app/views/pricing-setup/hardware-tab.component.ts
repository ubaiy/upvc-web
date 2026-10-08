import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { WriteDirective } from 'src/app/shared/access/write.directive';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ToastService } from 'src/app/shared/services/toast.service';
import { ConfirmDialogComponent } from '../bills/confirm-dialog.component';
import { CostHead, HardwarePack, HardwareRule, HardwareSet, HardwareSetDetail, HardwareSets, SetupRefusal, SystemSummary, shownNumber, typedNumber, words } from './pricing-setup.models';
import { PricingSetupService } from './pricing-setup.service';

export interface SetForm {
  id: number | null;
  code: string;
  name: string;
  category: string;
  brand: string;
  /** '' = for any system of the kind. */
  systemId: string;
  rebate: string;
  isDefault: boolean;
}

export interface LineForm {
  id: number | null;
  item: string;
  kind: string;
  role: string;
  scope: string;
  opening: string;
  formula: string;
  factor: string;
  /** '' = no price yet. */
  costheadId: string;
}

/** What a line is counted for, and how many: the values the api takes (phase-47 log, section 1). */
export const LINE_SCOPES = ['sash', 'pane', 'bottom_pane', 'steel_piece', 'frame_side', 'window'];
/** tilt_turn (T196): the rows of a tilt and turn sash; a set without one refuses a tilt and turn window and sends the owner here. */
export const LINE_OPENINGS = ['side_hung', 'top_hung', 'tilt_turn'];
export const QTY_FORMULAS: { key: string; label: string }[] = [
  { key: 'fixed', label: 'A fixed number' },
  { key: 'per_m', label: 'Per metre' },
  { key: 'per_sq_m', label: 'Per sq m' },
  { key: 'steps', label: 'One for each step of length' },
  { key: 'per_cam', label: 'One for each cam of the lock' },
];

/** "2 (a fixed number)", "1.5 per metre". */
export function quantityRule(rule: Pick<HardwareRule, 'qty_formula' | 'qty_factor' | 'step_mm'>): string {
  const factor = Number(rule.qty_factor ?? 1);
  switch (rule.qty_formula) {
    case 'per_m':
      return `${factor} per metre`;
    case 'per_sq_m':
      return `${factor} per sq m`;
    case 'steps':
      return `${factor} for each ${rule.step_mm ?? '?'} mm`;
    case 'per_cam':
      return `${factor} for each cam`;
    default:
      return `${factor}`;
  }
}

/** "rebate height 1001 to 1200 mm", "30.1 to 55 kg": when a line of a pack applies. */
export function bandOf(rule: HardwareRule): string {
  const parts: string[] = [];
  if (rule.band_on) parts.push(`${words(rule.band_on).toLowerCase()} ${rule.band_min_mm ?? 0} to ${rule.band_max_mm ?? 'any'} mm`);
  if (rule.weight_min_kg !== null || rule.weight_max_kg !== null) parts.push(`${rule.weight_min_kg ?? 0} to ${rule.weight_max_kg ?? 'any'} kg`);
  return parts.join(', ');
}

/**
 * Hardware sets (GET hardware-sets): the list, a ready pack copied into the company, a set of
 * the company's own, and inside a set its lines: the item, what it is counted for, how many, and
 * the catalogue item it is priced with. A set is tied to a kind of window (and to one profile
 * system, or to any); the default set of a kind is the one a price uses.
 */
@Component({
  selector: 'app-setup-hardware',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SharedComponentsModule, WriteDirective, ConfirmDialogComponent],
  templateUrl: './hardware-tab.component.html',
  styleUrls: ['./setup.scss'],
})
export class HardwareTabComponent implements OnChanges {
  /** The set that is open; none: the list. */
  @Input() setId: number | null = null;

  readonly scopes = LINE_SCOPES;
  readonly openings = LINE_OPENINGS;
  readonly formulas = QTY_FORMULAS;
  state: 'loading' | 'error' | 'ready' = 'loading';
  loadError = '';
  sets: HardwareSets = { sets: [], packs: [], categories: [] };
  systems: SystemSummary[] = [];
  items: CostHead[] = [];
  detail: HardwareSetDetail | null = null;

  setForm: SetForm | null = null;
  line: LineForm | null = null;
  saving = false;
  submitted = false;
  errors: string[] = [];
  importing = '';
  removing: HardwareRule | null = null;
  busy = false;
  removeError = '';
  /** The set asked to be deleted, with its lines. */
  deleting: HardwareSet | null = null;
  deleteError = '';

  quantity = quantityRule;
  band = bandOf;
  words = words;

  constructor(private setup: PricingSetupService, private toast: ToastService, private router: Router) {}

  ngOnChanges(): void {
    this.load();
  }

  load(): void {
    this.state = 'loading';
    this.setForm = null;
    this.line = null;
    this.errors = [];
    const none = of(null as HardwareSetDetail | null);
    forkJoin({
      sets: this.setup.hardwareSets(),
      // The names of the systems and the items of the catalogue are helps: the page stands without them.
      list: this.setup.checklist().pipe(catchError(() => of(null))),
      detail: this.setId ? (this.setup.hardwareSet(this.setId) as Observable<HardwareSetDetail | null>) : none,
      items: this.setId ? this.setup.hardwareItems().pipe(catchError(() => of([] as CostHead[]))) : of([] as CostHead[]),
    }).subscribe({
      next: ({ sets, list, detail, items }) => {
        this.sets = sets;
        this.systems = list?.systems ?? [];
        this.detail = detail;
        this.items = items;
        this.state = 'ready';
      },
      error: (e: Error) => {
        this.loadError = e.message;
        this.state = 'error';
      },
    });
  }

  systemName(id: number | null): string {
    return id ? this.systems.find((s) => s.id === id)?.name ?? `System ${id}` : 'Any system';
  }

  /** The kinds that have no default set: a window of that kind cannot be priced. */
  get withoutDefault(): string[] {
    return this.sets.categories.filter((c) => !this.sets.sets.some((s) => s.category === c && s.is_default));
  }

  importPack(pack: HardwarePack): void {
    if (this.importing) return;
    this.importing = pack.code;
    this.errors = [];
    this.setup.addHardwareSet({ pack: pack.code }).subscribe({
      next: (answer) => {
        this.importing = '';
        this.toast.showSuccess(answer.created ? `${pack.code} copied into your sets` : `${pack.code} was already in your sets`);
        this.load();
      },
      error: (e: SetupRefusal) => {
        this.importing = '';
        this.errors = e.errors?.length ? e.errors : [e.message];
      },
    });
  }

  openSet(set?: HardwareSet): void {
    this.setForm = {
      id: set?.id ?? null,
      code: set?.code ?? '',
      name: set?.name ?? '',
      category: set?.category ?? this.sets.categories[0] ?? 'casement',
      brand: set?.brand ?? '',
      systemId: set?.profile_system_id ? String(set.profile_system_id) : '',
      rebate: shownNumber(set?.rebate_offset_mm),
      isDefault: set?.is_default ?? false,
    };
    this.reset();
  }

  private reset(): void {
    this.submitted = false;
    this.saving = false;
    this.errors = [];
  }

  get codeInvalid(): boolean {
    return !/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(this.setForm?.code.trim() ?? '');
  }

  get rebateInvalid(): boolean {
    const n = typedNumber(this.setForm?.rebate);
    return n !== null && (!Number.isInteger(n) || n < 0 || n > 100);
  }

  saveSet(): void {
    const f = this.setForm;
    this.submitted = true;
    this.errors = [];
    if (!f || this.saving || !f.name.trim() || this.rebateInvalid || (!f.id && this.codeInvalid)) return;
    const body: Record<string, unknown> = {
      name: f.name.trim(),
      brand: f.brand.trim() || null,
      profile_system_id: f.systemId ? Number(f.systemId) : null,
      rebate_offset_mm: typedNumber(f.rebate),
      is_default: f.isDefault,
    };
    this.saving = true;
    const call = f.id ? this.setup.updateHardwareSet(f.id, body) : this.setup.addHardwareSet({ ...body, code: f.code.trim(), category: f.category });
    call.subscribe({
      next: (answer) => {
        this.saving = false;
        this.setForm = null;
        this.toast.showSuccess(f.id ? 'Hardware set saved' : 'Hardware set added');
        if (f.id) {
          this.load();
        } else {
          this.router.navigate(['/pricing-setup'], { queryParams: { tab: 'hardware', set: answer.set.id } });
        }
      },
      error: (e: SetupRefusal) => {
        this.saving = false;
        this.errors = e.errors?.length ? e.errors : [e.message];
      },
    });
  }

  openLine(rule?: HardwareRule): void {
    this.line = {
      id: rule?.id ?? null,
      item: rule?.item_name ?? '',
      kind: rule?.kind ?? 'hardware',
      role: rule?.role ?? '',
      scope: rule?.scope ?? 'sash',
      opening: rule?.applies_opening ?? '',
      formula: rule?.qty_formula ?? 'fixed',
      factor: rule ? String(Number(rule.qty_factor ?? 1)) : '1',
      costheadId: rule?.costhead_id ? String(rule.costhead_id) : '',
    };
    this.reset();
  }

  /** A catalogue item is chosen: an empty item name takes its name. */
  onItem(): void {
    const l = this.line;
    const item = this.items.find((i) => String(i.id) === l?.costheadId);
    if (l && item && !l.item.trim()) l.item = item.name;
  }

  get roleInvalid(): boolean {
    return !/^[a-z][a-z0-9_]{0,29}$/.test(this.line?.role.trim() ?? '');
  }

  get factorInvalid(): boolean {
    const n = typedNumber(this.line?.factor);
    return n === null || !Number.isFinite(n) || n < 0 || n > 100000;
  }

  saveLine(): void {
    const l = this.line;
    const set = this.detail?.set;
    this.submitted = true;
    this.errors = [];
    if (!l || !set || this.saving || !l.item.trim() || this.roleInvalid || this.factorInvalid) return;
    const body: Partial<HardwareRule> = {
      item_name: l.item.trim(),
      kind: l.kind,
      role: l.role.trim(),
      scope: l.scope,
      applies_opening: l.opening || null,
      qty_formula: l.formula,
      qty_factor: Number(l.factor),
      costhead_id: l.costheadId ? Number(l.costheadId) : null,
    };
    this.saving = true;
    (l.id ? this.setup.updateHardwareRule(l.id, body) : this.setup.addHardwareRule(set.id, body)).subscribe({
      next: (answer) => {
        this.saving = false;
        this.detail = answer;
        this.line = null;
        this.toast.showSuccess(l.id ? 'Line saved' : 'Line added');
      },
      error: (e: SetupRefusal) => {
        this.saving = false;
        this.errors = e.errors?.length ? e.errors : [e.message];
      },
    });
  }

  removeLine(): void {
    const rule = this.removing;
    if (!rule || this.busy) return;
    this.busy = true;
    this.removeError = '';
    this.setup.deleteHardwareRule(rule.id).subscribe({
      next: (answer) => {
        this.busy = false;
        this.removing = null;
        this.detail = answer;
        this.toast.showSuccess('Line removed');
      },
      error: (e: Error) => {
        this.busy = false;
        this.removeError = e.message;
      },
    });
  }

  /** Refused by the api while the set is the default of its kind, or tied to a system in use: its sentences stay in the dialog. */
  deleteSet(): void {
    const set = this.deleting;
    if (!set || this.busy) return;
    this.busy = true;
    this.deleteError = '';
    this.setup.deleteHardwareSet(set.id).subscribe({
      next: () => {
        this.busy = false;
        this.deleting = null;
        this.toast.showSuccess(`${set.name} deleted`);
        this.router.navigate(['/pricing-setup'], { queryParams: { tab: 'hardware' } });
      },
      error: (e: SetupRefusal) => {
        this.busy = false;
        this.deleteError = (e.errors?.length ? e.errors : [e.message]).join(' ');
      },
    });
  }

  trackSet = (_: number, s: HardwareSet): number => s.id;
  trackRule = (_: number, r: HardwareRule): number => r.id;
}
