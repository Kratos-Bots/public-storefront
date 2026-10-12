import { describe, expect, it } from 'vitest';
import { chargedIn, chargedInFor, chargedInFromPayment } from '@/lib/charged-in.ts';

describe('chargedIn', () => {
  it('is null when the backend sent neither field (an older backend)', () => {
    expect(chargedIn({}, 'USD')).toBeNull();
    expect(chargedIn({ chargeCurrency: 'EUR' }, 'USD')).toBeNull();
    expect(chargedIn({ settlementTotal: 65.25 }, 'USD')).toBeNull();
  });
  it('is null when the charge currency is the store currency', () => {
    expect(chargedIn({ chargeCurrency: 'USD', settlementTotal: 70 }, 'USD')).toBeNull();
    expect(chargedIn({ chargeCurrency: 'usd', settlementTotal: 70 }, 'USD')).toBeNull();
  });
  it('gives the amount and currency when they differ', () => {
    expect(chargedIn({ chargeCurrency: 'EUR', settlementTotal: 65.25 }, 'USD')).toEqual({ amount: 65.25, currency: 'EUR' });
  });
  it('ignores a figure that is not a finite number', () => {
    expect(chargedIn({ chargeCurrency: 'EUR', settlementTotal: Number.NaN }, 'USD')).toBeNull();
  });
});

describe('chargedInFor', () => {
  const method = { chargeCurrency: 'EUR', settlementTotal: 65.25 };
  it('follows the chosen method', () => {
    expect(chargedInFor(method, null, 'USD')).toEqual({ amount: 65.25, currency: 'EUR' });
  });
  it('follows the chosen coin over its method', () => {
    expect(chargedInFor(method, { chargeCurrency: 'EUR', settlementTotal: 64.1 }, 'USD')).toEqual({ amount: 64.1, currency: 'EUR' });
  });
  it('falls back to the method when the coin carries nothing', () => {
    expect(chargedInFor(method, {}, 'USD')).toEqual({ amount: 65.25, currency: 'EUR' });
  });
  it('is null with nothing chosen', () => {
    expect(chargedInFor(undefined, null, 'USD')).toBeNull();
  });
});

describe('chargedInFromPayment', () => {
  it('reads the placed payment settlement for any kind', () => {
    expect(chargedInFromPayment({ settlementAmount: 65.25, settlementCurrency: 'EUR' })).toEqual({ amount: 65.25, currency: 'EUR' });
  });
  it('is null when absent or partial', () => {
    expect(chargedInFromPayment({})).toBeNull();
    expect(chargedInFromPayment({ settlementAmount: null, settlementCurrency: null })).toBeNull();
    expect(chargedInFromPayment({ settlementAmount: 5 })).toBeNull();
    expect(chargedInFromPayment(null)).toBeNull();
  });
});
