import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { WriteDirective } from 'src/app/shared/access/write.directive';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { ToastService } from 'src/app/shared/services/toast.service';
import { Figures, FiguresBody, SetupRefusal, refusalsFor, refusalsLeft, shownNumber, typedNumber, typedText, words } from './pricing-setup.models';
import { PricingSetupService } from './pricing-setup.service';

export interface FigureField {
  key: string;
  label: string;
  /** The api's unit without "INR": "per kg", "percent", "mm". */
  unit: string;
  money: boolean;
  /** A choice (`profile_rate_basis`, `labour_mode`) and not a number. */
  choices: string[] | null;
  value: string;
  /** What the api holds: the box is "changed" when it differs. */
  held: string;
  /** null: the figure has no default (a rupee rate: empty = not set). */
  fallback: string | null;
  own: boolean;
}

export interface FigureGroup {
  id: string;
  title: string;
  text: string;
  fields: FigureField[];
}

const GROUPS: { id: string; title: string; text: string; keys: string[] }[] = [
  { id: 'rates', title: 'Rates', text: 'Rupees, before margin and GST. A rate has no default: empty means not set.', keys: ['profile_rate_kg', 'steel_rate_kg', 'labour_rate', 'installation_rate'] },
  { id: 'basis', title: 'How you buy and charge', text: 'A profile can say otherwise on its own line of a profile system.', keys: ['profile_rate_basis', 'labour_mode'] },
  { id: 'wastage', title: 'Wastage', text: 'Added to the material of every window.', keys: ['profile_wastage_pct', 'steel_wastage_pct', 'glass_wastage_pct'] },
  { id: 'glass', title: 'Glass rounding', text: 'A pane is billed at the rounded size. 0 = off.', keys: ['glass_round_up_mm', 'glass_min_side_mm', 'glass_min_area_sq_m'] },
  { id: 'other', title: 'Other figures', text: '', keys: ['min_area_sq_ft_per_window', 'overhead_pct', 'hardware_weight_safety_factor'] },
];

const CHOICES: Record<string, string[]> = { profile_rate_basis: ['per_kg', 'per_m'], labour_mode: ['per_sq_ft'] };

/** The api's settings as the groups of the form; a key the web does not know goes to "Other figures". */
export function figureGroups(figures: Figures): FigureGroup[] {
  const known = new Set(GROUPS.flatMap((g) => g.keys));
  const extra = Object.keys(figures.settings).filter((key) => !known.has(key));
  return GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    text: g.text,
    fields: [...g.keys, ...(g.id === 'other' ? extra : [])]
      .filter((key) => key in figures.settings)
      .map((key) => {
        const label = figures.labels[key] ?? { label: words(key), unit: '' };
        const money = /^INR\b/.test(label.unit);
        const held = shownNumber(figures.settings[key]);
        return {
          key,
          label: label.label,
          unit: money ? label.unit.replace(/^INR\s*/, '') : label.unit === 'percent' ? '%' : CHOICES[key] ? '' : label.unit,
          money,
          choices: CHOICES[key] ?? null,
          value: held,
          held,
          fallback: key in figures.defaults ? shownNumber(figures.defaults[key]) : null,
          own: figures.set_by_company.includes(key),
        };
      }),
  })).filter((g) => g.fields.length);
}

/** Only what was changed is sent: a key not sent stays, an emptied box is null (back to the default, or not set). */
export function figuresBody(groups: FigureGroup[], glass: { id: number; value: string; held: string }[], colours: { id: number; value: string; held: string }[]): FiguresBody {
  const body: FiguresBody = {};
  const settings: Record<string, number | string | null> = {};
  for (const f of groups.flatMap((g) => g.fields)) {
    if (typedText(f.value) !== f.held) settings[f.key] = f.choices ? f.value || null : typedNumber(f.value);
  }
  if (Object.keys(settings).length) body.settings = settings;
  const g = glass.filter((row) => typedText(row.value) !== row.held).map((row) => ({ id: row.id, glass_mm: typedNumber(row.value) }));
  if (g.length) body.glass = g;
  const c = colours.filter((row) => typedText(row.value) !== row.held).map((row) => ({ id: row.id, rate_kg: typedNumber(row.value) }));
  if (c.length) body.colours = c;
  return body;
}

/**
 * Rates and figures (GET / PUT pricing-setup/settings): the company's rates, wastage, glass
 * rounding and overhead, the thickness of each glass and the rate per kg of each colour.
 * The api prices; the web only keeps the figures.
 */
@Component({
  selector: 'app-setup-figures',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SharedComponentsModule, WriteDirective],
  templateUrl: './figures-tab.component.html',
  styleUrls: ['./setup.scss'],
})
export class FiguresTabComponent implements OnInit {
  /** The figure a line of the check list pointed at. */
  @Input() asked = '';

  state: 'loading' | 'error' | 'ready' = 'loading';
  loadError = '';
  figures: Figures | null = null;
  groups: FigureGroup[] = [];
  glass: { id: number; name: string; rate: number; unit: string; value: string; held: string }[] = [];
  colours: { id: number; name: string; value: string; held: string }[] = [];
  saving = false;
  submitted = false;
  errors: string[] = [];

  words = words;

  constructor(private setup: PricingSetupService, private toast: ToastService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state = 'loading';
    this.setup.figures().subscribe({
      next: (figures) => {
        this.show(figures);
        this.state = 'ready';
        if (this.asked) setTimeout(() => document.getElementById(this.inputId(this.asked))?.focus(), 50);
      },
      error: (e: Error) => {
        this.loadError = e.message;
        this.state = 'error';
      },
    });
  }

  private show(figures: Figures): void {
    this.figures = figures;
    this.groups = figureGroups(figures);
    this.glass = figures.glass.map((g) => ({ id: g.id, name: g.name, rate: g.rate, unit: g.unit, value: shownNumber(g.glass_mm), held: shownNumber(g.glass_mm) }));
    this.colours = figures.colours.map((c) => ({ id: c.id, name: c.name, value: shownNumber(c.rate_kg), held: shownNumber(c.rate_kg) }));
    this.submitted = false;
    this.errors = [];
  }

  get fields(): FigureField[] {
    return this.groups.flatMap((g) => g.fields);
  }

  inputId(key: string): string {
    return 'figure-' + key.replace(/[^A-Za-z0-9]+/g, '-');
  }

  /** The api's sentence for a figure that stands between the company and a price. */
  missing(f: FigureField): string {
    return typedText(f.value) === '' ? this.figures?.missing.find((m) => m.key === f.key)?.text ?? '' : '';
  }

  invalid(f: FigureField): boolean {
    if (f.choices) return false;
    const n = typedNumber(f.value);
    return n !== null && (!Number.isFinite(n) || n < 0 || (f.unit === '%' && n > 100));
  }

  badNumber(value: string, max: number): boolean {
    const n = typedNumber(value);
    return n !== null && (!Number.isFinite(n) || n < 0 || n > max);
  }

  said(f: FigureField): string[] {
    return [...new Set([...refusalsFor(this.errors, f.label), ...this.errors.filter((sentence) => sentence.includes(f.key))])];
  }

  get left(): string[] {
    const taken = new Set(this.fields.flatMap((f) => this.said(f)));
    return refusalsLeft(this.errors, []).filter((sentence) => !taken.has(sentence));
  }

  get body(): FiguresBody {
    return figuresBody(this.groups, this.glass, this.colours);
  }

  get dirty(): boolean {
    return Object.keys(this.body).length > 0;
  }

  save(): void {
    this.submitted = true;
    this.errors = [];
    const bad = this.fields.some((f) => this.invalid(f)) || this.glass.some((g) => this.badNumber(g.value, 100)) || this.colours.some((c) => this.badNumber(c.value, 1000000));
    if (this.saving || bad || !this.dirty) return;
    this.saving = true;
    this.setup.saveFigures(this.body).subscribe({
      next: (figures) => {
        this.saving = false;
        this.show(figures);
        this.toast.showSuccess('Figures saved');
      },
      error: (e: SetupRefusal) => {
        this.saving = false;
        this.errors = e.errors?.length ? e.errors : [e.message];
      },
    });
  }

  trackField = (_: number, f: FigureField): string => f.key;
  trackRow = (_: number, row: { id: number }): number => row.id;
}
