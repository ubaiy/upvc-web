import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { WriteDirective } from 'src/app/shared/access/write.directive';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ToastService } from 'src/app/shared/services/toast.service';
import { ConfirmDialogComponent } from '../bills/confirm-dialog.component';
import { SetupRefusal, SystemBody, SystemSummary } from './pricing-setup.models';
import { PricingSetupService } from './pricing-setup.service';

export interface SystemForm {
  /** null: a new system. */
  id: number | null;
  /** The system whose rules are written again in the new one ("Copy"). */
  copyOf: number | null;
  name: string;
  category: string;
  depth: string;
  series: string;
  notes: string;
}

/** "1 rule", "31 rules". */
const count = (n: number | undefined, what: string): string => `${n ?? 0} ${what}${n === 1 ? '' : 's'}`;

/** The api takes these two; a door is priced from a casement system (roles "Door sash"). */
export const SYSTEM_CATEGORIES = ['Casement', 'Sliding'];

/**
 * Profile systems: the list (type, how many profiles hold a role, ready or not), and add,
 * rename, copy and retire. A system opens on its own page: profiles by role, and rules.
 */
@Component({
  selector: 'app-setup-systems',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SharedComponentsModule, WriteDirective, ConfirmDialogComponent],
  templateUrl: './systems-tab.component.html',
  styleUrls: ['./setup.scss'],
})
export class SystemsTabComponent implements OnInit {
  readonly categories = SYSTEM_CATEGORIES;
  state: 'loading' | 'error' | 'ready' = 'loading';
  loadError = '';
  systems: SystemSummary[] = [];
  /** Profiles that hold a role, by system. Empty when the catalogue could not be read. */
  profiles: Record<number, number> = {};
  showRetired = false;

  form: SystemForm | null = null;
  saving = false;
  submitted = false;
  formError = '';

  retiring: SystemSummary | null = null;
  busy = false;
  actionError = '';

  constructor(private setup: PricingSetupService, private toast: ToastService, private router: Router) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state = 'loading';
    forkJoin({
      list: this.setup.checklist(),
      // The count is a help, not a need: the list is shown without it when the catalogue does not answer.
      products: this.setup.products().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ list, products }) => {
        this.systems = list.systems;
        this.profiles = {};
        for (const p of products) {
          if (p.profile_system_id && p.role) this.profiles[p.profile_system_id] = (this.profiles[p.profile_system_id] ?? 0) + 1;
        }
        // The api's own count, where it gives one.
        for (const s of list.systems) if (s.profiles_with_role !== undefined) this.profiles[s.id] = s.profiles_with_role;
        this.state = 'ready';
      },
      error: (e: Error) => {
        this.loadError = e.message;
        this.state = 'error';
      },
    });
  }

  get shown(): SystemSummary[] {
    return this.systems.filter((s) => this.showRetired || !s.retired);
  }

  get retiredCount(): number {
    return this.systems.filter((s) => s.retired).length;
  }

  openNew(): void {
    this.form = { id: null, copyOf: null, name: '', category: this.categories[0], depth: '60', series: '', notes: '' };
    this.resetForm();
  }

  /** Rename and copy start from the system as the api holds it (depth, series, notes). */
  openFor(s: SystemSummary, copy: boolean): void {
    this.actionError = '';
    this.setup.system(s.id).subscribe({
      next: (d) => {
        this.form = {
          id: copy ? null : s.id,
          copyOf: copy ? s.id : null,
          name: copy ? `Copy of ${d.system.name}` : d.system.name,
          category: d.system.category,
          depth: String(d.system.system_depth_mm ?? ''),
          series: d.system.series ?? '',
          notes: d.system.notes ?? '',
        };
        this.resetForm();
      },
      error: (e: Error) => (this.actionError = e.message),
    });
  }

  private resetForm(): void {
    this.submitted = false;
    this.formError = '';
    this.saving = false;
  }

  depthInvalid(): boolean {
    const n = Number(String(this.form?.depth ?? '').trim());
    return !String(this.form?.depth ?? '').trim() || !Number.isFinite(n) || n <= 0 || n > 500;
  }

  save(): void {
    const f = this.form;
    this.submitted = true;
    this.formError = '';
    if (!f || this.saving || !f.name.trim() || (!f.copyOf && this.depthInvalid())) return;
    const body: SystemBody = {
      name: f.name.trim(),
      category: f.category,
      system_depth_mm: Number(f.depth),
      series: f.series.trim() || null,
      notes: f.notes.trim() || null,
    };
    this.saving = true;
    // A copy is the api's: the profiles under new codes, their roles, and every rule with its source and note.
    const call = f.id
      ? this.setup.updateSystem(f.id, body).pipe(map((row) => ({ row, copied: '' })))
      : f.copyOf
      ? this.setup.copySystem(f.copyOf, body.name).pipe(map((d) => ({ row: d.system, copied: `System copied with ${count(d.copied?.profiles, 'profile')} and ${count(d.copied?.rules, 'rule')}.` })))
      : this.setup.addSystem(body).pipe(map((row) => ({ row, copied: '' })));
    call.subscribe({
      next: ({ row, copied }) => {
        this.saving = false;
        const wasNew = !f.id;
        this.form = null;
        this.toast.showSuccess(wasNew ? copied || 'Profile system added' : 'Profile system saved');
        if (wasNew) {
          this.router.navigate(['/pricing-setup'], { queryParams: { tab: 'systems', system: row.id } });
        } else {
          this.load();
        }
      },
      error: (e: SetupRefusal) => {
        this.saving = false;
        this.formError = [e.message, ...(e.errors ?? []).filter((s) => s !== e.message)].join(' ');
      },
    });
  }

  askRetire(s: SystemSummary): void {
    this.actionError = '';
    this.retiring = s;
  }

  retire(): void {
    const s = this.retiring;
    if (!s || this.busy) return;
    this.busy = true;
    this.actionError = '';
    this.setup.retire(s.id, !s.retired).subscribe({
      next: () => {
        this.busy = false;
        this.retiring = null;
        this.toast.showSuccess(s.retired ? 'Profile system brought back' : 'Profile system retired');
        this.load();
      },
      error: (e: Error) => {
        this.busy = false;
        this.actionError = e.message;
      },
    });
  }

  trackSystem = (_: number, s: SystemSummary): number => s.id;
}
