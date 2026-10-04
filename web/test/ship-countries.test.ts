import { describe, expect, it } from 'vitest';
import { DEFAULT_FORM } from '@/features/checkout/form-state.ts';
import { applyShipCountries, normaliseShipCountries, reconcileCountry } from '@/features/checkout/ship-countries.ts';

describe('normaliseShipCountries', () => {
  it('upper-cases, trims, de-duplicates and drops non two-letter entries', () => {
    expect(normaliseShipCountries([' gb ', 'GB', 'ie', '', 'GBR', '1X', 'fr'])).toEqual(['GB', 'IE', 'FR']);
  });
  it('a missing list is empty', () => {
    expect(normaliseShipCountries(undefined)).toEqual([]);
    expect(normaliseShipCountries(null)).toEqual([]);
  });
});

describe('reconcileCountry', () => {
  it('an empty list changes nothing (unknown = every country)', () => {
    expect(reconcileCountry('NO', [])).toBe('NO');
    expect(reconcileCountry('', [])).toBe('');
  });
  it('keeps a country that is in the list', () => {
    expect(reconcileCountry('GB', ['GB', 'IE'])).toBe('GB');
  });
  it('clears a country that is not in the list', () => {
    expect(reconcileCountry('NO', ['GB', 'IE'])).toBe('');
  });
  it('preselects the only country, over a blank or a stale one', () => {
    expect(reconcileCountry('', ['GB'])).toBe('GB');
    expect(reconcileCountry('NO', ['GB'])).toBe('GB');
  });
  it('does not preselect when there is a choice', () => {
    expect(reconcileCountry('', ['GB', 'IE'])).toBe('');
  });
});

describe('applyShipCountries', () => {
  it('returns the same object when nothing changes', () => {
    const form = { ...DEFAULT_FORM, country: 'GB' };
    expect(applyShipCountries(form, ['GB', 'IE'])).toBe(form);
    expect(applyShipCountries(form, [])).toBe(form);
  });
  it('clears a stale country and leaves the phone prefix alone', () => {
    const next = applyShipCountries({ ...DEFAULT_FORM, country: 'NO', phonePrefix: 'NO' }, ['GB', 'IE']);
    expect(next.country).toBe('');
    expect(next.phonePrefix).toBe('NO');
  });
  it('a single-country shop preselects it and the blank phone prefix follows', () => {
    const next = applyShipCountries(DEFAULT_FORM, ['GB']);
    expect(next.country).toBe('GB');
    expect(next.phonePrefix).toBe('GB');
  });
  it('never overwrites a prefix the shopper chose, or one already set', () => {
    expect(applyShipCountries({ ...DEFAULT_FORM, phonePrefix: 'FR', phonePrefixTouched: true }, ['GB']).phonePrefix).toBe('FR');
    expect(applyShipCountries({ ...DEFAULT_FORM, phonePrefix: 'IE' }, ['GB']).phonePrefix).toBe('IE');
  });
});
