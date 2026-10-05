import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { AccessService } from 'src/app/shared/access/access.service';
import { AccessState } from 'src/app/shared/access/access.models';
import { toQuotationView } from './detail/quotation-detail.model';
import { NotPricedNoteComponent, notPricedOf } from './not-priced';
import { priceLinesOf } from './sub-quotation-design/designer-request';

/** A row of the api's group "Bars and shapes" (BarShapePricing::rateRow). */
const row = (name: string, type: string, cost: number, quantity: number, totalCost: number) => ({
  id: null,
  product_no: null,
  name,
  type,
  costhead: 'Bars and shapes',
  cost,
  totalCost,
  quantity,
});

/** The live answer of a sash with one bar of 0.594 m, the bar rate set to 120. */
const PRICED = {
  total: 6400,
  costhead_information: {
    costhead: [
      { name: '5mm plain glass', type: 'sqft', costhead: 'Glazzing', cost: 40, totalCost: 320, quantity: 8 },
      row('Bar in a sash', 'm', 120, 0.594, 71.28),
      row('Profile bending', 'bend', 500, 1, 500),
      row('Shaped glass surcharge', 'percent', 30, 1, 96),
      row('Centre pivot set', 'set', 1500, 1, 1500),
    ],
  },
  product_information: [],
};

/** The same sash with no rate set, and a pivot with no pivot hardware in the catalogue. */
const UNSET = {
  total: 6328.72,
  costhead_information: {
    costhead: [
      { name: '5mm plain glass', type: 'sqft', costhead: 'Glazzing', cost: 40, totalCost: 320, quantity: 8 },
      row('Bar in a sash: not priced, set the rate (sash_bar_rate_m) or give the bar a profile', 'm', 0, 0.594, 0),
      row('Profile bending: not priced, set the rate (bend_rate_per_bend or bend_rate_per_m)', 'bend', 0, 1, 0),
      row('Pivot hardware: not priced, add a cost head in group "Pivot Hardware" (the sash is charged its hinges instead)', 'set', 0, 1, 0),
    ],
  },
  product_information: [],
};

describe('What a price draws and does not charge (T144)', () => {
  it('the rows the api charged show in Price details with their quantity and amount', () => {
    const lines = priceLinesOf(PRICED).filter((line) => line.group === 'Bars and shapes');
    expect(lines.map((l) => [l.name, l.quantity, l.rate, l.cost])).toEqual([
      ['Bar in a sash', 0.594, 120, 71.28],
      ['Profile bending', 1, 500, 500],
      ['Shaped glass surcharge', 1, 30, 96],
      ['Centre pivot set', 1, 1500, 1500],
    ]);
    expect(notPricedOf(PRICED)).toEqual([]);
  });

  it('a row of amount 0 that says "not priced" is not a price row: it is said in plain words, without the setting keys', () => {
    expect(priceLinesOf(UNSET).some((line) => line.group === 'Bars and shapes')).toBeFalse();
    expect(notPricedOf(UNSET)).toEqual([
      'Bar in a sash: not priced, set the rate or give the bar a profile',
      'Profile bending: not priced, set the rate',
      'Pivot hardware: not priced, add a cost head in group "Pivot Hardware" (the sash is charged its hinges instead)',
    ]);
  });

  it('a saved line also says the notes the api keeps with it, each sentence once', () => {
    const summary = {
      rates: {},
      charged: [],
      notes: [
        'Profile bending (1 bent pieces, 3.142 m): not priced, set the rate (bend_rate_per_bend or bend_rate_per_m).',
        'Shaped glass surcharge: not priced, set the rate (shaped_glass_surcharge_pct). The glass is charged on its rectangle.',
      ],
    };
    const expected = [
      'Profile bending (1 bent pieces, 3.142 m): not priced, set the rate',
      'Shaped glass surcharge: not priced, set the rate. The glass is charged on its rectangle',
    ];
    // As an object, and as the JSON text the api stores.
    expect(notPricedOf({ costhead_information: { costhead: [] }, quatation_object_data: { bar_shape_pricing: summary } })).toEqual(expected);
    expect(
      notPricedOf({ costhead_information: { costhead: [] }, quatation_object_data: JSON.stringify({ bar_shape_pricing: summary }) })
    ).toEqual(expected);
    expect(notPricedOf({ bar_shape_pricing: summary })).toEqual(expected);
    // A line with nothing of the kind, and an answer with no breakdown at all.
    expect(notPricedOf({ costhead_information: [] })).toEqual([]);
    expect(notPricedOf(null)).toEqual([]);
  });

  it('a line of the quotation carries what it does not charge', () => {
    const view = toQuotationView({
      id: 14,
      quatation_product: [
        { id: 1, width: 1500, height: 1200, quantity: 1, ...UNSET },
        { id: 2, width: 1500, height: 1200, quantity: 1, ...PRICED },
      ],
    });
    expect(view.lines[0].notPriced?.length).toBe(3);
    expect(view.lines[1].notPriced).toEqual([]);
  });

  describe('the amber line', () => {
    let fixture: ComponentFixture<NotPricedNoteComponent>;
    const state$ = new BehaviorSubject<AccessState>({ me: null, subscription: null });
    const as = (abilities: string[]): void => state$.next({ me: { abilities } as any, subscription: null });
    const el = (): HTMLElement => fixture.nativeElement;

    beforeEach(() => {
      TestBed.configureTestingModule({
        imports: [NotPricedNoteComponent],
        providers: [provideRouter([]), { provide: AccessService, useValue: { state$, get state() { return state$.value; } } }],
      });
      fixture = TestBed.createComponent(NotPricedNoteComponent);
    });

    it('the owner reads the sentences and gets "Set these rates", which opens the settings card', () => {
      as(['prices.view_cost', 'settings.write']);
      fixture.componentRef.setInput('notes', notPricedOf(UNSET));
      fixture.detectChanges();
      const note = el().querySelector('[data-price="not-priced"]')!;
      expect(note.textContent).toContain('Bar in a sash: not priced, set the rate or give the bar a profile.');
      const link = note.querySelector('a')!;
      expect(link.textContent?.trim()).toBe('Set these rates');
      expect(link.getAttribute('href')).toBe('/profile?tab=pricing&rates=extras');
      expect(link.getAttribute('target')).withContext('the window being drawn stays open').toBe('_blank');
    });

    it('a role that cannot change settings reads the same sentences, without the link', () => {
      as(['quotations.view', 'quotations.write']);
      fixture.componentRef.setInput('notes', notPricedOf(UNSET));
      fixture.detectChanges();
      const note = el().querySelector('[data-price="not-priced"]')!;
      expect(note.textContent).toContain('Profile bending: not priced, set the rate.');
      expect(note.querySelector('a')).toBeNull();
    });

    it('nothing to say: nothing drawn', () => {
      as(['settings.write']);
      fixture.componentRef.setInput('notes', []);
      fixture.detectChanges();
      expect(el().querySelector('[data-price="not-priced"]')).toBeNull();
    });
  });
});
