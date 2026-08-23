import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  formatDate,
  formatDateTime,
  formatCoinAmount,
  deriveStockStatus,
  stockLabel,
  resolveTier,
  resolveUnitPrice,
} from '@/lib/format.ts';

describe('formatMoney', () => {
  it('formats GBP with locale en', () => {
    expect(formatMoney(4.5, 'GBP')).toBe('£4.50');
  });
  it('formats USD with a bare $ (locale en, not en-GB which renders US$)', () => {
    expect(formatMoney(4.5, 'USD')).toBe('$4.50');
  });
});

describe('formatDate', () => {
  it('formats an ISO timestamp as "7 July 2026"', () => {
    expect(formatDate('2026-07-07T10:00:00.000Z')).toBe('7 July 2026');
  });
  it('returns an empty string for unparseable input', () => {
    expect(formatDate('not-a-date')).toBe('');
  });
});

describe('formatDateTime', () => {
  it('formats using dateStyle medium + timeStyle short in the viewer locale', () => {
    const iso = '2026-07-07T10:00:00.000Z';
    const expected = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
    expect(formatDateTime(iso)).toBe(expected);
  });
  it('returns an empty string for unparseable input', () => {
    expect(formatDateTime('nope')).toBe('');
  });
});

describe('formatCoinAmount', () => {
  it('trims trailing zeros from a decimal string', () => {
    expect(formatCoinAmount('0.00081000')).toBe('0.00081');
  });
  it('passes through a non-decimal value unchanged', () => {
    expect(formatCoinAmount(12)).toBe('12');
  });
  it('trims a whole-number decimal down to the bare integer', () => {
    expect(formatCoinAmount('5.000000000000')).toBe('5');
  });
});

describe('deriveStockStatus', () => {
  it('is "out" when not in stock, regardless of the low-stock alert', () => {
    expect(deriveStockStatus(false, false)).toBe('out');
    expect(deriveStockStatus(false, true)).toBe('out');
  });
  it('is "low" when in stock but the low-stock alert is set', () => {
    expect(deriveStockStatus(true, true)).toBe('low');
  });
  it('is "in" when in stock and not low', () => {
    expect(deriveStockStatus(true, false)).toBe('in');
  });
});

describe('stockLabel', () => {
  it('maps each status to its display label', () => {
    expect(stockLabel('in')).toBe('In Stock');
    expect(stockLabel('low')).toBe('Low Stock');
    expect(stockLabel('out')).toBe('Out of Stock');
  });
});

const product = {
  price: 10,
  pricingTiers: [
    { id: 1, minQuantity: 5, price: 8 },
    { id: 2, minQuantity: 10, price: 7 },
  ],
};

describe('resolveTier', () => {
  it('resolves the highest-minQuantity tier the quantity satisfies', () => {
    expect(resolveTier(product, 7)?.price).toBe(8);
  });
  it('resolves the top tier once quantity clears its threshold', () => {
    expect(resolveTier(product, 10)?.price).toBe(7);
  });
  it('returns null below every tier threshold', () => {
    expect(resolveTier(product, 1)).toBeNull();
  });
});

describe('resolveUnitPrice', () => {
  it('uses the resolved tier price', () => {
    expect(resolveUnitPrice(product, 7)).toBe(8);
  });
  it('falls back to the base price when no tier applies', () => {
    expect(resolveUnitPrice(product, 1)).toBe(10);
  });
});
