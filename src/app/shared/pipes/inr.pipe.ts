import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formats an amount of money in Indian rupees with Indian digit grouping.
 *
 *   {{ 141595.8 | inr }}        ₹1,41,595.80   (tables, totals)
 *   {{ 157402.17 | inr : 0 }}   ₹1,57,402      (headline figures)
 *
 * This is the only place currency is formatted. A missing or non-numeric
 * value prints an en dash so a blank API field never shows "₹NaN".
 */
export function formatInr(value: unknown, decimals = 2): string {
  if (value === null || value === undefined || value === '') {
    return '–';
  }
  const amount = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(amount)) {
    return '–';
  }
  const digits = Math.max(0, Math.min(decimals, 4));
  const body = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(amount));
  // Rounding can turn a small negative into zero; do not print "-₹0.00".
  const isNegative = amount < 0 && Number(body.replace(/,/g, '')) !== 0;
  return (isNegative ? '−₹' : '₹') + body;
}

@Pipe({ name: 'inr', standalone: true })
export class InrPipe implements PipeTransform {
  transform(value: unknown, decimals = 2): string {
    return formatInr(value, decimals);
  }
}
