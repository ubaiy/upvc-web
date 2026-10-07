import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Observable, Subscription, forkJoin } from 'rxjs';

import { AccessService } from 'src/app/shared/access/access.service';
import { OwnRatesComponent } from 'src/app/shared/access/own-rates.component';
import { hasExampleRates } from 'src/app/shared/access/starter-catalogue';
import { WriteDirective } from 'src/app/shared/access/write.directive';
import { SharedComponentsModule } from 'src/app/shared/components/shared-components.module';
import { InrPipe } from 'src/app/shared/pipes/inr.pipe';
import { ToastService } from 'src/app/shared/services/toast.service';
import { BomShortComponent } from './bom-short.component';
import { fixLabel, placeOf } from './checklist-tab.component';
import { quantityRule } from './hardware-tab.component';
import { Checklist, Figures, FiguresBody, GlassRow, HardwareRule, HardwareSet, SetupRefusal, SystemSummary, Trial, shownNumber, typedNumber } from './pricing-setup.models';
import { PricingSetupService } from './pricing-setup.service';

/** A line of "Which systems do you sell?": a ready system of the starter pack, or a system of the company's own. */
export interface Choice {
  name: string;
  note: string;
  /** The pack to add when the company has no system of it yet. */
  pack: string | null;
  system: SystemSummary | null;
}

/** An item of an opened hardware set: its catalogue item (the price), and how the set counts it. */
export interface SetItem {
  name: string;
  costhead: HardwareRule['costhead'];
  counted: string;
}

/** One line per item of the set, with every quantity rule the set has for it ("2 / 3 / 4", "1 per metre"). */
export function itemsOf(rules: HardwareRule[]): SetItem[] {
  const names = [...new Set(rules.map((r) => r.item_name))];
  return names.map((name) => {
    const of = rules.filter((r) => r.item_name === name);
    return { name, costhead: of.find((r) => r.costhead)?.costhead ?? null, counted: [...new Set(of.map(quantityRule))].join(' / ') };
  });
}

/** The four rupee rates of the company, in the order of the table. */
export const QUICK_RATES = ['profile_rate_kg', 'steel_rate_kg', 'labour_rate', 'installation_rate'];

/** The ready systems first, then the company's own. A system is of a pack by the id the api gives. */
export function choicesOf(list: Checklist): Choice[] {
  const ofPack = new Set(list.packs.map((p) => p.system_id));
  return [
    ...list.packs.map((p) => ({ name: p.what, note: p.pack, pack: p.pack, system: list.systems.find((s) => s.id === p.system_id) ?? null })),
    ...list.systems.filter((s) => !ofPack.has(s.id)).map((s) => ({ name: s.name, note: s.category, pack: null, system: s })),
  ];
}

/**
 * What the rates table sends: only what was changed. A glass rate goes without the thickness (it stays);
 * a profile with a rate typed is bought per metre at it, emptied it is bought the company's way again.
 */
export function ratesBody(
  figures: Figures,
  rates: Record<string, string>,
  glass: Record<number, { rate: string; mm: string }>,
  own: Record<number, string>,
  items: SetItem[] = [],
  prices: Record<number, string> = {}
): FiguresBody {
  const body: FiguresBody = {};
  const settings = Object.fromEntries(QUICK_RATES.filter((key) => typedNumber(rates[key]) !== (figures.settings[key] ?? null)).map((key) => [key, typedNumber(rates[key])]));
  if (Object.keys(settings).length) body.settings = settings;
  const panes = figures.glass
    .map((g) => {
      const rate = typedNumber(glass[g.id]?.rate);
      const mm = typedNumber(glass[g.id]?.mm);
      return { id: g.id, ...(rate !== null && rate !== g.rate ? { rate } : {}), ...(mm !== (g.glass_mm ?? null) ? { glass_mm: mm } : {}) };
    })
    .filter((row) => Object.keys(row).length > 1);
  if (panes.length) body.glass = panes;
  const profiles = figures.profiles
    .filter((p) => typedNumber(own[p.id]) !== (p.charge_basis === 'per_m' ? p.rate_meter : null))
    .map((p) => (typedNumber(own[p.id]) === null ? { id: p.id, charge_basis: null } : { id: p.id, charge_basis: 'per_m' as const, rate_meter: typedNumber(own[p.id]) as number }));
  if (profiles.length) body.profiles = profiles;
  // An item of two sets is one catalogue item: its price goes once.
  const heads = new Map(items.filter((i) => i.costhead).map((i) => [i.costhead!.id, Number(i.costhead!.cost)]));
  const priced = [...heads].filter(([id, cost]) => typedNumber(prices[id]) !== null && typedNumber(prices[id]) !== cost).map(([id]) => ({ id, rate: typedNumber(prices[id]) as number }));
  if (priced.length) body.items = priced;
  return body;
}

/**
 * Quick setup (card T187), what Pricing setup opens on: three steps on one page.
 * 1. Which systems do you sell: a tick takes a ready system (POST pricing-setup/packs) or brings one back, no tick retires it.
 * 2. Your rates: one table, one save (PUT pricing-setup/settings).
 * 3. Check a window: the trial windows the api prices, each with its bill of materials, then "These are my rates now".
 * Everything else of the set-up is under Advanced. The web works out no price.
 */
@Component({
  selector: 'app-setup-quick',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, SharedComponentsModule, WriteDirective, OwnRatesComponent, InrPipe, BomShortComponent],
  templateUrl: './quick-setup.component.html',
  styleUrls: ['./setup.scss'],
})
export class QuickSetupComponent implements OnInit, OnDestroy {
  state: 'loading' | 'error' | 'ready' = 'loading';
  loadError = '';
  list: Checklist | null = null;
  figures: Figures | null = null;
  sets: HardwareSet[] = [];
  choices: Choice[] = [];

  /** The line being ticked. */
  ticking = '';
  tickError = '';

  readonly rateKeys = QUICK_RATES;
  rates: Record<string, string> = {};
  glass: Record<number, { rate: string; mm: string }> = {};
  own: Record<number, string> = {};
  /** The items of each hardware set that was opened, and the price typed for a catalogue item. */
  items: Record<number, SetItem[]> = {};
  prices: Record<number, string> = {};
  saving = false;
  saveErrors: string[] = [];

  place = placeOf;
  fix = fixLabel;

  private sub = new Subscription();

  constructor(private setup: PricingSetupService, private access: AccessService, private toast: ToastService) {}

  ngOnInit(): void {
    this.load();
    // "These are my rates now" changes GET me; the line about example values goes with it.
    this.sub.add(
      this.access.state$.subscribe((state) => {
        if (this.list?.example && state?.me && !hasExampleRates(state)) this.load();
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  /** The three reads of the page. After a change the page stays up while they come again. */
  load(): void {
    if (!this.list) this.state = 'loading';
    forkJoin({ list: this.setup.checklist(), figures: this.setup.figures(), sets: this.setup.hardwareSets() }).subscribe({
      next: ({ list, figures, sets }) => {
        this.list = list;
        this.choices = choicesOf(list);
        this.sets = sets.sets.filter((s) => s.is_default);
        this.takeFigures(figures);
        // The sets that stand open are read again with it.
        this.prices = {};
        Object.keys(this.items).forEach((id) => this.readSet(Number(id)));
        this.ticking = '';
        this.state = 'ready';
      },
      error: (e: Error) => {
        this.loadError = e.message;
        this.ticking = '';
        this.state = this.list ? 'ready' : 'error';
      },
    });
  }

  private takeFigures(figures: Figures): void {
    this.figures = figures;
    this.rates = Object.fromEntries(QUICK_RATES.map((key) => [key, shownNumber(figures.settings[key])]));
    this.glass = Object.fromEntries(figures.glass.map((g) => [g.id, { rate: shownNumber(g.rate), mm: shownNumber(g.glass_mm) }]));
    this.own = Object.fromEntries(figures.profiles.map((p) => [p.id, p.charge_basis === 'per_m' ? shownNumber(p.rate_meter) : '']));
  }

  /** A hardware row is opened: its items come with their prices (GET hardware-sets/{id}). */
  opened(set: HardwareSet, event: Event): void {
    if ((event.target as HTMLDetailsElement).open && !this.items[set.id]) this.readSet(set.id);
  }

  private readSet(id: number): void {
    this.setup.hardwareSet(id).subscribe({
      next: (detail) => {
        this.items[id] = itemsOf(detail.rules);
        for (const item of this.items[id]) if (item.costhead) this.prices[item.costhead.id] ??= shownNumber(item.costhead.cost);
      },
      error: (e: Error) => (this.saveErrors = [e.message]),
    });
  }

  noPrice(set: HardwareSet): number {
    return set.unmatched.length + set.unpriced.length;
  }

  /** The figure held is still the one the example pack gave: not looked at yet. Gone once it is changed, or the owner confirms his rates. */
  isExample(what: string, key: string, held: unknown): boolean {
    const given = this.list?.example?.to_confirm.find((v) => v.what === what && v.key === key && v.stored);
    return !!given && given.value !== null && held !== null && held !== undefined && Number(given.value) === Number(held);
  }

  inUse(c: Choice): boolean {
    return !!c.system && !c.system.retired;
  }

  /** A tick: the ready system is added, or the system is in use again; no tick: it is retired (nothing is deleted). */
  tick(c: Choice, wanted: boolean): void {
    if (this.ticking) return;
    this.ticking = c.name;
    this.tickError = '';
    const call: Observable<unknown> = c.system ? this.setup.retire(c.system.id, !wanted) : this.setup.addPack(c.pack as string);
    call.subscribe({
      next: () => this.load(),
      error: (e: SetupRefusal) => {
        this.tickError = e.errors?.length ? e.errors.join(' ') : e.message;
        this.load();
      },
    });
  }

  label(key: string): string {
    return this.figures?.labels[key]?.label ?? key;
  }

  unit(key: string): string {
    return (this.figures?.labels[key]?.unit ?? '').replace(/^INR /, '');
  }

  /** The glass of the table: what has a thickness; a catalogue with none shows its first three. The rest is folded. */
  get glassShown(): GlassRow[] {
    const all = this.figures?.glass ?? [];
    const sized = all.filter((g) => g.glass_mm);
    return sized.length ? sized : all.slice(0, 3);
  }

  get glassFolded(): GlassRow[] {
    const shown = new Set(this.glassShown);
    return (this.figures?.glass ?? []).filter((g) => !shown.has(g));
  }

  get ownCount(): number {
    return Object.values(this.own).filter((typed) => String(typed ?? '').trim() !== '').length;
  }

  saveRates(): void {
    const f = this.figures;
    if (!f || this.saving) return;
    this.saveErrors = [];
    const typed = [...Object.values(this.rates), ...Object.values(this.own), ...Object.values(this.prices), ...Object.values(this.glass).flatMap((g) => [g.rate, g.mm])].map(typedNumber);
    if (typed.some((n) => n !== null && (!Number.isFinite(n) || n < 0))) {
      this.saveErrors = ['Enter amounts of 0 or more.'];
      return;
    }
    const body = ratesBody(f, this.rates, this.glass, this.own, Object.values(this.items).flat(), this.prices);
    if (!Object.keys(body).length) {
      this.toast.showInfo('Nothing was changed.');
      return;
    }
    this.saving = true;
    this.setup.saveFigures(body).subscribe({
      next: () => {
        this.saving = false;
        this.toast.showSuccess('Your rates are saved');
        // The trial windows are priced again with them.
        this.load();
      },
      error: (e: SetupRefusal) => {
        this.saving = false;
        this.saveErrors = e.errors?.length ? e.errors : [e.message];
      },
    });
  }

  /** The trial windows of the systems in use, each under the name of its system. */
  get trials(): { system: string; trial: Trial }[] {
    return (this.list?.systems ?? []).filter((s) => !s.retired).flatMap((s) => s.trials.map((trial) => ({ system: s.name, trial })));
  }

  get methodLabel(): string {
    return this.list?.methods.find((m) => m.key === this.list?.method)?.label ?? this.list?.method ?? '';
  }

  trackChoice = (_: number, c: Choice): string => c.name;
}
