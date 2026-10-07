import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';

import { WriteDirective } from 'src/app/shared/access/write.directive';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ToastService } from 'src/app/shared/services/toast.service';
import { SetupRefusal, SystemDetail, SystemRule, refusalsFor, refusalsLeft, shownNumber, typedNumber, typedText } from './pricing-setup.models';
import { PricingSetupService } from './pricing-setup.service';

/** A rule as the table edits it. */
export interface RuleRow {
  rule: SystemRule;
  /** As typed. Empty = not set. */
  value: string;
  note: string;
}

export interface RuleGroup {
  key: string;
  title: string;
  rows: RuleRow[];
}

/** How far a value can be trusted, from what the api says of it. */
export function confidenceOf(rule: SystemRule): { text: string; tone: string } {
  if (!rule.is_set) return rule.default === null ? { text: 'Not set, no default', tone: 'badge-warning' } : { text: 'Not set, default used', tone: '' };
  return rule.is_placeholder ? { text: 'Placeholder: check it', tone: 'badge-warning' } : { text: 'Your figure', tone: 'badge-success' };
}

/** The rules in the api's groups, in the order the api names the groups. */
export function ruleGroups(detail: SystemDetail): RuleGroup[] {
  const titles = detail.rule_groups ?? {};
  const keys = [...Object.keys(titles), ...detail.rules.map((r) => r.group).filter((g) => !(g in titles))];
  return [...new Set(keys)]
    .map((key) => ({
      key,
      title: titles[key] ?? key,
      rows: detail.rules.filter((r) => r.group === key).map((rule) => ({ rule, value: shownNumber(rule.value), note: rule.notes ?? '' })),
    }))
    .filter((group) => group.rows.length);
}

/**
 * The rules of a profile system (deductions, weld allowance, glass deductions, cut angles ...):
 * one editable table with the value, the unit, the engine's default, where the value comes from
 * and how far it can be trusted, and a note. Values go in one PUT .../rules (a number sets, empty
 * removes); a changed note is kept on the api's single-rule route, which is the one that takes it.
 */
@Component({
  selector: 'app-setup-rules',
  standalone: true,
  imports: [CommonModule, FormsModule, SharedComponentsModule, WriteDirective],
  templateUrl: './system-rules.component.html',
  styleUrls: ['./setup.scss'],
})
export class SystemRulesComponent implements OnChanges {
  @Input() detail!: SystemDetail;
  @Output() saved = new EventEmitter<SystemDetail>();

  groups: RuleGroup[] = [];
  /** Only the rules that hold a value, or every rule the engine knows. */
  onlySet = true;
  group = '';
  template = '';
  saving = false;
  submitted = false;
  errors: string[] = [];
  added: string[] | null = null;

  confidence = confidenceOf;

  constructor(private setup: PricingSetupService, private toast: ToastService) {}

  ngOnChanges(): void {
    this.groups = ruleGroups(this.detail);
    this.submitted = false;
    if (!this.detail.rules.some((r) => r.is_set)) this.onlySet = false;
  }

  get rows(): RuleRow[] {
    return this.groups.flatMap((g) => g.rows);
  }

  get shownGroups(): RuleGroup[] {
    return this.groups
      .filter((g) => !this.group || g.key === this.group)
      .map((g) => ({ ...g, rows: g.rows.filter((row) => !this.onlySet || row.rule.is_set || this.changed(row)) }))
      .filter((g) => g.rows.length);
  }

  get setCount(): number {
    return this.detail.rules.filter((r) => r.is_set).length;
  }

  changed(row: RuleRow): boolean {
    return typedText(row.value) !== shownNumber(row.rule.value) || row.note.trim() !== (row.rule.notes ?? '').trim();
  }

  get dirty(): number {
    return this.rows.filter((row) => this.changed(row)).length;
  }

  invalid(row: RuleRow): boolean {
    const n = typedNumber(row.value);
    if (n === null) return false;
    return !Number.isFinite(n) || (row.rule.unit === 'flag' && n !== 0 && n !== 1);
  }

  /** A note belongs to a value: it cannot be kept on a rule that is not set. */
  noteAlone(row: RuleRow): boolean {
    return row.note.trim() !== (row.rule.notes ?? '').trim() && typedNumber(row.value) === null && !!row.note.trim();
  }

  said(row: RuleRow): string[] {
    return [...refusalsFor(this.errors, row.rule.label), ...refusalsFor(this.errors, row.rule.key)];
  }

  get left(): string[] {
    return refusalsLeft(this.errors, this.rows.flatMap((row) => [row.rule.label, row.rule.key]));
  }

  inputId(key: string): string {
    return 'rule-' + key.replace(/[^A-Za-z0-9]+/g, '-');
  }

  save(): void {
    this.submitted = true;
    this.errors = [];
    this.added = null;
    const rows = this.rows.filter((row) => this.changed(row));
    if (this.saving || !rows.length || rows.some((row) => this.invalid(row) || this.noteAlone(row))) return;
    const values: Record<string, number | null> = {};
    for (const row of rows) {
      if (typedText(row.value) !== shownNumber(row.rule.value)) values[row.rule.key] = typedNumber(row.value);
    }
    // The notes go in the same call. A note on a rule the system does not hold yet is sent with the value shown.
    const notes: Record<string, string | null> = {};
    for (const row of rows.filter((r) => r.note.trim() !== (r.rule.notes ?? '').trim() && typedNumber(r.value) !== null)) {
      notes[row.rule.key] = row.note.trim() || null;
      if (!row.rule.is_set) values[row.rule.key] = typedNumber(row.value);
    }
    this.saving = true;
    this.setup
      .saveRules(this.detail.system.id, values, undefined, notes)
      .pipe(switchMap(() => this.setup.system(this.detail.system.id)))
      .subscribe({
        next: (detail) => {
          this.saving = false;
          this.toast.showSuccess(rows.length === 1 ? 'Rule saved' : `${rows.length} rules saved`);
          this.saved.emit(detail);
        },
        error: (e: SetupRefusal) => {
          this.saving = false;
          this.errors = e.errors?.length ? e.errors : [e.message];
        },
      });
  }

  /** Copies a pack's values for every rule the system does not have yet; none it has is overwritten. */
  copyTemplate(): void {
    if (this.saving || !this.template) return;
    this.saving = true;
    this.errors = [];
    this.setup.saveRules(this.detail.system.id, {}, this.template).subscribe({
      next: (detail) => {
        this.saving = false;
        this.added = detail.template_added ?? [];
        this.template = '';
        this.onlySet = true;
        this.saved.emit(detail);
      },
      error: (e: SetupRefusal) => {
        this.saving = false;
        this.errors = e.errors?.length ? e.errors : [e.message];
      },
    });
  }

  trackGroup = (_: number, g: RuleGroup): string => g.key;
  trackRow = (_: number, row: RuleRow): string => row.rule.key;
}
