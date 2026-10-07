import { ComponentFixture } from '@angular/core/testing';

import { CompareTabComponent, fixWords, roleWords } from './compare-tab.component';
import { FakeApi, checklist, comparison, http, linkOf, mount, ok, settle } from './pricing-setup.testing';

describe('Pricing setup, the compare of the two methods (T186)', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<CompareTabComponent>;
  const el = (): HTMLElement => fixture.nativeElement;
  const row = (line: number): HTMLElement => el().querySelector(`tr[data-line="${line}"]`)!;
  const cells = (line: number): string[] => Array.from(row(line).querySelectorAll('td')).map((td) => td.textContent!.replace(/\s+/g, ' ').trim());
  const said = (name: string): string => el().querySelector(`[data-setup="${name}"]`)!.textContent!.replace(/\s+/g, ' ').trim();
  const answers = (compare: () => unknown) => (c: { url: string }) =>
    (c.url === 'pricing-setup' ? ok(checklist()) : c.url.startsWith('pricing-setup/compare') ? compare() : undefined) as any;

  beforeEach(() => {
    api = new FakeApi();
  });

  it('says in words where a refusal is fixed and what a part is', () => {
    expect(fixWords({ tab: 'figures', key: 'labour_rate' })).toBe('Set it in Rates and figures');
    expect(fixWords({ tab: 'hardware' })).toBe('Open Hardware sets');
    expect(fixWords({ tab: 'systems', system: 4 })).toBe('Open the system');
    expect(fixWords({ tab: 'systems', system: 4, role: 'bead' })).toBe('Give the profile');
    expect(fixWords({ tab: 'systems' })).toBe('Open Profile systems');
    expect(roleWords('sash+mesh_sash')).toBe('sash + mesh sash');
  });

  it('shows each window old, new and difference in rupees, and the total of the windows both methods price', async () => {
    api.answer = answers(() => ok(comparison()));
    fixture = await mount(CompareTabComponent, api);

    expect(api.sent).toContain('GET pricing-setup/compare?limit=20');
    expect(api.writes).toEqual([]);
    expect(said('compare-total')).toBe(
      '2 of 3 windows priced by both methods: area formula ₹18,440.00, bill of materials ₹17,210.36, difference −₹1,229.64. 1 cannot be compared; each row says why.'
    );
    expect(row(311).querySelector('.title')!.textContent).toBe('W1');
    expect(row(311).querySelector('.small')!.textContent).toBe('Casement Openable window, 1200 x 1500 mm, quantity 2, Q-0057');
    expect(cells(311).slice(1, 4)).toEqual(['₹9,000.00', '₹7,948.50', '−₹1,051.50']);
  });

  it("a window the new method cannot price says why in the api's sentence, with a link to where it is fixed", async () => {
    api.answer = answers(() => ok(comparison()));
    fixture = await mount(CompareTabComponent, api);

    expect(cells(310)[2]).toContain('Cannot be priced: profile CAS-F belongs to no profile system, so there are no cutting rules for it.');
    expect(cells(310)[3]).toBe('–');
    expect(linkOf(row(310), 'Open Profile systems')).toContain('/pricing-setup?tab=systems');
    expect(linkOf(row(309), 'Set it in Rates and figures')).toContain('/pricing-setup?tab=figures&key=labour_rate');
    expect(row(310).querySelector('[data-act="bom"]')).toBeNull();
  });

  it('a row opens the bill of materials of one window in short, and closes it', async () => {
    api.answer = answers(() => ok(comparison()));
    fixture = await mount(CompareTabComponent, api);
    expect(el().querySelector('[data-bom]')).toBeNull();

    row(311).querySelector<HTMLButtonElement>('[data-act="bom"]')!.click();
    await settle(fixture);
    // Each row of the opened part as its cells, then the sentences under the table.
    const opened = el().querySelector('[data-bom="311"]')!;
    const words = (e: Element): string => e.textContent!.replace(/\s+/g, ' ').trim();
    const bom = [...Array.from(opened.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.children).map(words).filter(Boolean).join(' ')), ...Array.from(opened.querySelectorAll('p, li')).map(words)].join(' / ');
    expect(bom).toContain('For one window; the line has 2.');
    expect(bom).toContain('frame B-frame Beta 70 frame 4.6894 m 6.096 kg ₹984.78');
    expect(bom).toContain('sash + mesh sash B-sash');
    expect(bom).toContain('glass Clear float 5 mm 10.6562 sq ft ₹479.53');
    expect(bom).toContain('hardware Casement, espagnolette + hinges or friction stays (RS-CAS-1) 9 items ₹512.40');
    expect(bom).toContain('Fabrication at ₹25.00 per sq ft ₹322.92');
    expect(bom).toContain('10 percent on material and labour ₹314.33');
    expect(bom).toContain('One window ₹3,974.25');
    expect(bom).toContain('Wastage in the quantities: profile 6 percent, steel 5 percent, glass 0 percent.');
    expect(bom).toContain('The profile system lists no interlock for this number of sliding sashes.');

    row(311).querySelector<HTMLButtonElement>('[data-act="bom"]')!.click();
    await settle(fixture);
    expect(el().querySelector('[data-bom]')).toBeNull();
  });

  it('"Price my old windows as": the systems in use are offered, none chosen; a choice asks the api again and the row says what it was compared as', async () => {
    const as = comparison();
    as.windows[1] = { ...as.windows[1], new: { method: 'bom_v1', priced: true, total: 4100, reason: null }, compared_as: { id: 4, name: 'Alpha 60 casement' }, difference: -1100 };
    api.answer = answers(() => ok(api.sent[api.sent.length - 1].includes('as_system_id=4') ? as : comparison()));
    fixture = await mount(CompareTabComponent, api);

    const picker = el().querySelector<HTMLSelectElement>('[data-setup="compare-as"]')!;
    // The retired system of the check list is not offered.
    expect(Array.from(picker.options).map((o) => o.textContent!.trim())).toEqual(['Not chosen', 'Alpha 60 casement']);
    expect(picker.value).toBe('');
    expect(row(310).querySelector('[data-setup="compared-as"]')).toBeNull();

    picker.value = '4';
    picker.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(api.sent).toContain('GET pricing-setup/compare?limit=20&as_system_id=4');
    expect(row(310).querySelector('[data-setup="compared-as"]')!.textContent).toBe('Compared as Alpha 60 casement');
    expect(cells(310)[2]).toBe('₹4,100.00');
    expect(el().querySelector<HTMLSelectElement>('[data-setup="compare-as"]')!.value).toBe('4');
  });

  it('no saved window: it says so; a failure says so in words and offers to try again', async () => {
    api.answer = answers(() => ok(comparison({ windows: [], totals: { windows: 0, compared: 0, not_priced: 0, old: 0, new: 0, difference: 0 } })));
    fixture = await mount(CompareTabComponent, api);
    expect(said('compare-empty')).toBe('No window is saved on a quotation yet, so there is nothing to compare.');
    expect(el().querySelector('[data-setup="compare"]')).toBeNull();

    api.answer = answers(() => ok(comparison({ totals: { windows: 3, compared: 0, not_priced: 3, old: 0, new: 0, difference: 0 } })));
    fixture.componentInstance.load();
    await settle(fixture);
    expect(said('compare-total')).toBe('None of your last 3 saved windows can be priced by both methods yet; each row says why.');

    api.answer = answers(() => http(500));
    fixture.componentInstance.load();
    await settle(fixture);
    expect(el().textContent).toContain('We could not compare your windows. The comparison could not be worked out.');
  });
});
