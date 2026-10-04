import {
  PriceFactors,
  ProfileRow,
  RateChange,
  changedFactors,
  changedRates,
  deriveRates,
  fixSpelling,
  parseAmount,
  sampleCost,
  unitLabel,
  usedAs,
  withMetreRate,
} from './catalogue.model';

const FACTORS: PriceFactors = { per_kg: 190, rate_bar: 5.8, color_per_kg: 410, color_rate_bar: 5.8 };

function profile(over: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: 1,
    category: 'Casement',
    profile_code: 'P60-K-X-R',
    profile_name: 'Outer frame',
    kg_meter: 1.01,
    kg_meter_color: 1.01,
    rate_meter: 191.9,
    rate_bar: 1113.02,
    rate_meter_color: 414.1,
    rate_bar_color: 2401.78,
    sub_category: 'Frame',
    ...over,
  };
}

describe('catalogue rules', () => {
  it('corrects the misspelt words the API stores, and nothing else', () => {
    expect(fixSpelling('Slidding')).toBe('Sliding');
    expect(fixSpelling('Glazzing')).toBe('Glazing');
    expect(fixSpelling('Casment Outward Outer Frame - R')).toBe('Casement Outward Outer Frame - R');
    expect(fixSpelling('per mulian 4 pc')).toBe('per mullion 4 pc');
    expect(fixSpelling('C/S')).toBe('Casement and sliding');
    expect(fixSpelling('Handle')).toBe('Handle');
    expect(fixSpelling(null)).toBe('');
  });

  it('names units the way a rate is read', () => {
    expect(unitLabel('Sq M')).toBe('sq m');
    expect(unitLabel('Rmt')).toBe('m');
    expect(unitLabel('Meter')).toBe('m');
    expect(unitLabel('Pair')).toBe('pair');
    expect(unitLabel(null)).toBe('unit');
  });

  it('shows the role of a profile, falling back to the older sub-category', () => {
    expect(usedAs({ role: 'sash', sub_category: 'Frame' })).toBe('Sash');
    expect(usedAs({ role: null, sub_category: 'Frame' })).toBe('Frame');
    expect(usedAs({ role: null, sub_category: null })).toBe('');
  });

  it('derives the four rates from the weight exactly as the API does', () => {
    // The demo row: 1.01 kg/m at ₹190 and ₹410 per kg, 5.8 m bars.
    expect(deriveRates(1.01, 1.01, FACTORS)).toEqual({
      rate_meter: 191.9,
      rate_bar: 1113.02,
      rate_meter_color: 414.1,
      rate_bar_color: 2401.78,
    });
  });

  it('keeps the bar rate in step when a metre rate is typed in the row', () => {
    const rates = withMetreRate(profile(), 'rate_meter', 200, FACTORS);
    expect(rates.rate_meter).toBe(200);
    expect(rates.rate_bar).toBe(1160);
    expect(rates.rate_meter_color).toBe(414.1);
    expect(rates.rate_bar_color).toBe(2401.78);
  });

  it('uses the company bar length when the profile had no rate before', () => {
    const rates = withMetreRate(profile({ rate_meter_color: 0, rate_bar_color: 0 }), 'rate_meter_color', 100, FACTORS);
    expect(rates.rate_bar_color).toBe(580);
  });

  it('raises the factors by a percentage for a change to every profile', () => {
    const change: RateChange = { mode: 'percent', category: null, percent: 5, factors: FACTORS };
    expect(changedFactors(FACTORS, change)).toEqual({ per_kg: 199.5, rate_bar: 5.8, color_per_kg: 430.5, color_rate_bar: 5.8 });
    expect(changedRates(profile(), change, FACTORS).rate_meter).toBe(201.5); // 1.01 × 199.5
  });

  it('moves the rate a profile has now when only one category changes', () => {
    const edited = profile({ rate_meter: 250, rate_bar: 1450 });
    const change: RateChange = { mode: 'percent', category: 'Casement', percent: -10, factors: FACTORS };
    const rates = changedRates(edited, change, FACTORS);
    expect(rates.rate_meter).toBe(225);
    expect(rates.rate_bar).toBe(1305);
    expect(rates.rate_meter_color).toBe(372.69);
  });

  it('prices from the weight when a new rate per kg is set', () => {
    const change: RateChange = { mode: 'rate', category: 'Casement', percent: 0, factors: { ...FACTORS, per_kg: 200 } };
    expect(changedRates(profile({ rate_meter: 250 }), change, FACTORS).rate_meter).toBe(202);
  });

  it('costs the sample window from the frame and the sash of the same category', () => {
    const frame = profile();
    const sash = profile({ id: 2, profile_name: 'Sash', sub_category: 'Sash', rate_meter: 245.1 });
    const other = profile({ id: 3, category: 'Slidding', sub_category: 'Sash', rate_meter: 999 });
    const cost = sampleCost([other, sash, frame], (p) => ({ ...p, rate_meter: p.rate_meter * 2 }));
    expect(cost?.frame).toBe(frame);
    expect(cost?.sash).toBe(sash);
    expect(cost?.before).toBe(2261.76); // 191.9 × 5.4 + 245.1 × 5.0
    expect(cost?.after).toBe(4523.52);
    expect(sampleCost([], (p) => p)).toBeNull();
  });

  it('reads what a person types into a rate box', () => {
    expect(parseAmount('₹1,41,595.80')).toBe(141595.8);
    expect(parseAmount(' 72 ')).toBe(72);
    expect(parseAmount('')).toBeNaN();
    expect(parseAmount('abc')).toBeNaN();
  });
});
