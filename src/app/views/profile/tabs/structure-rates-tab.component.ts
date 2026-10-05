import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ToastService } from 'src/app/shared/services/toast.service';
import { BAR_SECTIONS, HUB_LABELS } from 'src/app/shared/structure-model/bar-sections';
import { Rate, StructureLineService, StructureRates, StructureRatesAnswer } from '../../structure-designer/structure-line.service';

/** One figure of the rates: where it lives in the api's object, what it is called, and its unit. */
export interface RateField {
  /** The api's path, as in its "missing" list: "bar_rate_m.rafter". */
  path: string;
  label: string;
  /** Printed after the box: "per sq m", "per metre", "each", "%". */
  unit: string;
  /** Rupees (a ₹ before the box) or a percentage. */
  money: boolean;
  /** As typed. Empty = not set; 0 is a figure. */
  value: string;
  hint?: string;
}

export interface RateGroup {
  id: string;
  title: string;
  text: string;
  fields: RateField[];
}

const OPENING_LABEL: Record<string, string> = {
  casement: 'Casement (side-hung)',
  'top-hung': 'Top-hung vent',
  door: 'Door',
  sliding: 'Sliding (2 leaves)',
};

function words(key: string): string {
  const text = key.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function shown(rate: Rate | undefined): string {
  return rate === null || rate === undefined ? '' : String(rate);
}

function field(path: string, label: string, unit: string, rate: Rate | undefined, hint?: string): RateField {
  return { path, label, unit, money: unit !== '%', value: shown(rate), hint };
}

/** The api's rates as the groups of the form, in the order a structure is priced. */
export function rateGroups(answer: StructureRatesAnswer): RateGroup[] {
  const r = answer.rates;
  const glass = r.glass_rate_sq_m ?? { default: null, by_glass: {} };
  const bars = r.bar_rate_m ?? {};
  const hubs = r.hub_rate ?? {};
  const openings = r.opening_extra ?? {};
  const barRoles = [...new Set([...(answer.bar_roles ?? []), ...Object.keys(bars)])].filter((role) => role !== 'default');
  const hubRoles = [...new Set([...(answer.hub_roles ?? Object.keys(HUB_LABELS)), ...Object.keys(hubs)])].filter((role) => role !== 'default');
  const openingKinds = [...new Set([...(answer.openings ?? []), ...Object.keys(openings)])];
  return [
    {
      id: 'glass',
      title: 'Glass and solid panels',
      text: 'Charged on the area of the panels. A glass with its own rate uses it; every other glass uses the usual rate.',
      fields: [
        field('glass_rate_sq_m.default', 'Glass, usual rate', 'per sq m', glass.default),
        ...Object.keys(glass.by_glass ?? {}).map((key) => field(`glass_rate_sq_m.by_glass.${key}`, `Glass: ${words(key)}`, 'per sq m', glass.by_glass[key])),
        field('solid_panel_rate_sq_m', 'Solid panel', 'per sq m', r.solid_panel_rate_sq_m),
      ],
    },
    {
      id: 'bars',
      title: 'Bars, per metre',
      text: 'Charged on the length of each kind of bar. A kind left empty uses “Any other bar”.',
      fields: [
        field('bar_rate_m.default', 'Any other bar', 'per metre', bars['default'], 'Used for a kind of bar that has no figure of its own.'),
        ...barRoles.map((role) => field(`bar_rate_m.${role}`, BAR_SECTIONS.find((s) => s.role === role)?.label ?? words(role), 'per metre', bars[role])),
      ],
    },
    {
      id: 'hubs',
      title: 'Hubs',
      text: 'The piece where bars meet, such as the crown of a dome or a pyramid.',
      fields: [
        field('hub_rate.default', 'Any other hub', 'each', hubs['default'], 'Used for a hub that has no figure of its own.'),
        ...hubRoles.map((role) => field(`hub_rate.${role}`, HUB_LABELS[role] ?? words(role), 'each', hubs[role])),
      ],
    },
    {
      id: 'openings',
      title: 'Extra for a panel that opens',
      text: 'Added once for each panel of that kind, for its sash, hinges and handle.',
      fields: openingKinds.map((kind) => field(`opening_extra.${kind}`, OPENING_LABEL[kind] ?? words(kind), 'each', openings[kind])),
    },
    {
      id: 'work',
      title: 'Wastage, labour, installation and overhead',
      text: 'Wastage is added to glass, solid panels and bars. Labour and installation are charged on the area. Overhead is added to material, wastage and labour.',
      fields: [
        field('wastage_pct', 'Wastage', '%', r.wastage_pct),
        field('labour_rate_sq_ft', 'Labour', 'per sq ft', r.labour_rate_sq_ft),
        field('installation_rate_sq_ft', 'Installation', 'per sq ft', r.installation_rate_sq_ft),
        field('overhead_pct', 'Overhead', '%', r.overhead_pct),
      ],
    },
  ];
}

/** The whole rates object the api takes, from what is typed. Empty = null (not set). */
export function ratesFrom(groups: RateGroup[]): StructureRates {
  const out: any = { glass_rate_sq_m: { default: null, by_glass: {} }, bar_rate_m: {}, hub_rate: {}, opening_extra: {} };
  for (const f of groups.flatMap((g) => g.fields)) {
    const typed = String(f.value ?? '').trim();
    const value: Rate = typed === '' ? null : Number(typed);
    const path = f.path.split('.');
    let at = out;
    for (const key of path.slice(0, -1)) {
      at = at[key] ??= {};
    }
    at[path[path.length - 1]] = value;
  }
  return out as StructureRates;
}

/**
 * Settings → Structure rates (card T123): what a 3D structure of a quotation
 * is priced with. The api works the price out; this page only keeps its rates.
 * A figure the api reports as missing is marked, because a structure that
 * needs it is refused a price until it is set.
 */
@Component({
  selector: 'app-settings-structure-rates',
  standalone: true,
  imports: [CommonModule, FormsModule, SharedComponentsModule],
  templateUrl: './structure-rates-tab.component.html',
  styleUrls: ['../settings-tab.scss', './structure-rates-tab.component.scss'],
})
export class StructureRatesTabComponent implements OnInit {
  state: 'loading' | 'error' | 'ready' = 'loading';
  loadError = '';
  groups: RateGroup[] = [];
  missing = new Set<string>();
  /** The rate a refused price named (…?missing=bar_rate_m.rafter): shown first. */
  asked = '';
  saving = false;
  saveError = '';
  dirty = false;
  submitted = false;
  newGlass = '';

  constructor(private readonly lines: StructureLineService, private readonly toast: ToastService, private readonly route: ActivatedRoute) {}

  ngOnInit(): void {
    this.asked = this.route.snapshot.queryParamMap?.get('missing') ?? '';
    this.load();
  }

  load(): void {
    this.state = 'loading';
    this.lines.rates().subscribe({
      next: (answer) => {
        this.show(answer);
        this.state = 'ready';
        if (this.asked) setTimeout(() => this.focusField(this.asked), 50);
      },
      error: (e: Error) => {
        this.loadError = e.message;
        this.state = 'error';
      },
    });
  }

  private show(answer: StructureRatesAnswer): void {
    this.groups = rateGroups(answer);
    this.missing = new Set(answer.missing ?? []);
    this.dirty = false;
    this.submitted = false;
  }

  get missingFields(): RateField[] {
    return this.groups.flatMap((g) => g.fields).filter((f) => this.missing.has(f.path));
  }

  inputId(path: string): string {
    return 'rate-' + path.replace(/[^A-Za-z0-9]+/g, '-');
  }

  focusField(path: string): void {
    document.getElementById(this.inputId(path))?.focus();
  }

  isMissing(f: RateField): boolean {
    return this.missing.has(f.path) && String(f.value ?? '').trim() === '';
  }

  invalid(f: RateField): boolean {
    const typed = String(f.value ?? '').trim();
    if (typed === '') return false;
    const n = Number(typed);
    return !Number.isFinite(n) || n < 0 || (!f.money && n > 100);
  }

  /** A glass with its own rate: the key is the name the designer and the api use for it. */
  addGlass(): void {
    const key = this.newGlass.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const glass = this.groups.find((g) => g.id === 'glass');
    if (!key || !glass || glass.fields.some((f) => f.path === `glass_rate_sq_m.by_glass.${key}`)) return;
    glass.fields.splice(glass.fields.length - 1, 0, field(`glass_rate_sq_m.by_glass.${key}`, `Glass: ${words(key)}`, 'per sq m', null));
    this.newGlass = '';
    this.dirty = true;
  }

  save(): void {
    this.submitted = true;
    this.saveError = '';
    if (this.saving || this.groups.some((g) => g.fields.some((f) => this.invalid(f)))) return;
    this.saving = true;
    this.lines.saveRates(ratesFrom(this.groups)).subscribe({
      next: (answer) => {
        this.saving = false;
        this.show(answer);
        this.toast.showSuccess('Structure rates saved');
      },
      error: (e: Error) => {
        this.saving = false;
        this.saveError = e.message;
      },
    });
  }

  trackField = (_: number, f: RateField): string => f.path;
}
