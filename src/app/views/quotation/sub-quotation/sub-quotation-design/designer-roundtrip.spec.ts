/**
 * Round-trip acceptance test of the designer (card T39 / D1, gap G6):
 * save a window, reopen it, and the design payload and the total are the
 * same. Six reference windows: fixed, casement, 3-track slider with fly
 * mesh, mullion and transom, door, arch.
 *
 * The api is replaced by a stand-in that does what the real one does with
 * a design: stores the document under `old_post_data.design` and returns
 * it on show-product, with empty strings turned into null on the way (the
 * api's ConvertEmptyStringsToNull). Its "total" is a function of the priced
 * payload alone, so an identical payload is an identical total. The same
 * six windows are checked against the running demo by
 * docs/review/e2e/designer-integration/roundtrip-e2e.js.
 */

import {
  WindowDesign,
  setLeafSpec,
  splitPane,
  walkLeaves,
} from 'src/app/shared/design-model';
import { DesignerCatalog, completeDesign } from './designer-catalog';
import {
  ManageProductBody,
  buildManageProductBody,
  pricedPayloadOf,
  ratePerSqFt,
  sellingAmount,
} from './designer-request';
import { openSavedLine } from './saved-line';
import { STARTING_DESIGNS } from './starting-designs';
import { demoCatalog } from './testing/demo-catalog';

const start = (key: string): WindowDesign =>
  STARTING_DESIGNS.find((s) => s.key === key)!.build();

/** A mullion, then a transom in the right-hand column; the lower right pane opens. */
function mullionAndTransom(): WindowDesign {
  let d = start('fixed');
  d = splitPane(d, 'p1', 'x', 690, { dividerFaceMm: 60 });
  const right = walkLeaves(d.root)[1];
  d = splitPane(d, right.id, 'y', 400, { dividerFaceMm: 60 });
  const lowerRight = walkLeaves(d.root)[2];
  return setLeafSpec(d, lowerRight.id, {
    category: 'Casement',
    casementType: 'Openable',
    opening: { direction: 'Right', handleId: null, hingesType: null },
  });
}

const WINDOWS: { name: string; build: () => WindowDesign }[] = [
  { name: 'fixed window', build: () => start('fixed') },
  { name: 'casement', build: () => start('casement-2') },
  { name: '3-track slider with fly mesh', build: () => start('slider-3') },
  { name: 'window with a mullion and a transom', build: mullionAndTransom },
  { name: 'door', build: () => start('door') },
  { name: 'arch', build: () => start('arch') },
];

/** What Laravel's ConvertEmptyStringsToNull does to a request. */
function emptyToNull<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (_k, v) => (v === '' ? null : v));
}

/** A total that depends on the priced payload and on nothing else. */
function standInTotal(body: ManageProductBody): number {
  const text = JSON.stringify(emptyToNull(pricedPayloadOf(body)));
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 1000003;
  return Math.round(h) / 100;
}

/** The show-product row the api returns for a line saved with `body`. */
function savedRow(body: ManageProductBody, id: number): any {
  const stored = emptyToNull(body);
  return {
    id,
    width: String(stored.width),
    height: String(stored.height),
    quantity: stored.quantity,
    label: stored.label,
    total: standInTotal(body),
    costhead_information: {
      costhead: [],
      old_post_data: { ...stored.parts[0], design: stored.design, door: (stored as any).door },
    },
    quatation_object_data: JSON.stringify(stored),
  };
}

describe('designer round trip: save, reopen, same payload and same total', () => {
  let catalog: DesignerCatalog;
  const ctx = (lineId: number | null) => ({ quotationId: 22, lineId, quantity: 1, label: 'Master bedroom' });

  beforeEach(() => {
    catalog = demoCatalog();
  });

  for (const [i, w] of WINDOWS.entries()) {
    it(w.name, () => {
      const design = completeDesign(w.build(), catalog);
      const saved = buildManageProductBody(design, catalog, ctx(null), { image: null });
      expect(saved.is_saved).toBeTrue();
      expect(saved.design).toBeDefined();
      expect(saved.parts.length).toBeGreaterThan(0);

      const row = savedRow(saved, 100 + i);
      const opened = openSavedLine(row);
      expect(opened.source).toBe('design');
      expect(opened.faithful).toBeTrue();

      // Reopening completes the document again; nothing may move.
      const reopened = completeDesign(opened.design, catalog);
      expect(JSON.stringify(reopened)).toBe(JSON.stringify(design));

      const again = buildManageProductBody(reopened, catalog, ctx(100 + i));
      expect(JSON.stringify(pricedPayloadOf(again))).toBe(JSON.stringify(pricedPayloadOf(saved)));
      expect(standInTotal(again)).toBe(row.total);

      // Saving the reopened window unchanged stores the same document.
      const resaved = buildManageProductBody(reopened, catalog, ctx(100 + i), { image: null });
      expect(JSON.stringify(resaved.design)).toBe(JSON.stringify(saved.design));
    });
  }

  it('the live price request and the save request price the same payload', () => {
    const design = completeDesign(mullionAndTransom(), catalog);
    const live = buildManageProductBody(design, catalog, ctx(null));
    const save = buildManageProductBody(design, catalog, ctx(null), { image: 'data:image/png;base64,AAAA' });
    expect(live.is_saved).toBeFalse();
    expect('design' in live).toBeFalse();
    expect(JSON.stringify(pricedPayloadOf(live))).toBe(JSON.stringify(pricedPayloadOf(save)));
  });

  it('every part of every reference window carries the ids of its own system', () => {
    const slider = buildManageProductBody(completeDesign(start('slider-3'), catalog), catalog, ctx(null));
    expect(slider.parts.length).toBe(3);
    for (const p of slider.parts) {
      expect(p.product_id).toBe(34); // the 3-track frame, not the 2-track one
      expect(p.sash_id).toBe(35);
      expect(p.is_track).toBe('3 Track');
      expect(p.fly_mesh).toBeTrue();
      expect(p.palla_type).toBe(1);
    }
    const mixed = buildManageProductBody(completeDesign(mullionAndTransom(), catalog), catalog, ctx(null));
    expect(mixed.mullion.map((m) => [m.direction, m.product_id])).toEqual([
      ['vertical', 29],
      ['horizontal', 29],
    ]);
    expect(mixed.parts.map((p) => [p.casement_type, p.product_id, p.sash_id, p.handle_id])).toEqual([
      ['Fixed', 26, '', null],
      ['Fixed', 26, '', null],
      ['Openable', 32, 27, 55],
    ]);
    const door = buildManageProductBody(completeDesign(start('door'), catalog), catalog, ctx(null));
    expect(door.parts[0].product_type).toBe('Door');
    expect((door as any).door).toEqual({ threshold: 'Standard', swing: 'In' });
    const arch = buildManageProductBody(completeDesign(start('arch'), catalog), catalog, ctx(null));
    expect(arch.shape?.kind).toBe('arch_segmental');
  });

  it('selling price mirrors the api rule: cost plus the margin, each rounded to paise', () => {
    // The figures of quotation 22 on the demo (Retail 20%).
    expect(sellingAmount(6158.18, 20)).toBe(7389.82);
    expect(sellingAmount(6316.83, 20)).toBe(7580.2);
    expect(sellingAmount(12882.35, 20)).toBe(15458.82);
    expect(sellingAmount(7376.55, 20)).toBe(8851.86);
    expect(sellingAmount(100, 0)).toBe(100);
    // The api divides by the unrounded area.
    expect(ratePerSqFt(8851.86, 23.2500465072)).toBe(380.72);
    expect(ratePerSqFt(100, 0)).toBe(0);
  });
});
