import { formatInr, InrPipe } from './inr.pipe';

describe('InrPipe', () => {
  const pipe = new InrPipe();

  it('groups digits the Indian way with two decimals', () => {
    expect(pipe.transform(141595.8)).toBe('₹1,41,595.80');
    expect(pipe.transform(14159.58)).toBe('₹14,159.58');
    expect(pipe.transform(12345678.9)).toBe('₹1,23,45,678.90');
    expect(pipe.transform(999)).toBe('₹999.00');
  });

  it('drops decimals for headline figures', () => {
    expect(pipe.transform(157402.17, 0)).toBe('₹1,57,402');
    expect(pipe.transform(77765.5, 0)).toBe('₹77,766');
  });

  it('accepts numeric strings from the API, with or without separators', () => {
    expect(pipe.transform('174062.58')).toBe('₹1,74,062.58');
    expect(pipe.transform('1,74,062.58')).toBe('₹1,74,062.58');
  });

  it('puts the minus sign before the rupee sign', () => {
    expect(pipe.transform(-7263.29)).toBe('−₹7,263.29');
    expect(pipe.transform(-0.001)).toBe('₹0.00');
  });

  it('prints an en dash for missing or non-numeric values', () => {
    expect(pipe.transform(null)).toBe('–');
    expect(pipe.transform(undefined)).toBe('–');
    expect(pipe.transform('')).toBe('–');
    expect(pipe.transform('abc')).toBe('–');
    expect(formatInr(NaN)).toBe('–');
  });

  it('formats zero as money, not as missing', () => {
    expect(pipe.transform(0)).toBe('₹0.00');
  });
});
