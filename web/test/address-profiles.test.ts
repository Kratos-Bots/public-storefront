import { describe, expect, it } from 'vitest';
import { addressLabels, addressProfile } from '@/features/checkout/address-profiles.ts';
import { textSnapshot } from '@/text/snapshot.ts';

describe('addressProfile', () => {
  it('maps the UK and the Crown Dependencies to uk', () => {
    for (const iso of ['GB', 'IM', 'JE', 'GG']) expect(addressProfile(iso)).toBe('uk');
  });
  it('maps IE, US, CA and AU to their own profiles', () => {
    expect(addressProfile('IE')).toBe('ie');
    expect(addressProfile('US')).toBe('us');
    expect(addressProfile('CA')).toBe('ca');
    expect(addressProfile('AU')).toBe('au');
  });
  it('is case- and whitespace-insensitive', () => {
    expect(addressProfile(' gb ')).toBe('uk');
  });
  it('falls back for every other country and for no country', () => {
    for (const iso of ['FR', 'DE', 'NZ', 'ZZ', '', null, undefined]) expect(addressProfile(iso)).toBe('default');
  });
});

describe('addressLabels', () => {
  const english = (iso: string | null) => {
    const keys = addressLabels(iso);
    // With no text provider mounted the snapshot answers with the built-in English.
    const { t } = textSnapshot();
    return [t(keys.city), t(keys.county), t(keys.zip)];
  };
  it.each([
    ['GB', ['Town / City', 'County', 'Postcode']],
    ['IE', ['Town / City', 'County', 'Eircode']],
    ['US', ['City', 'State', 'ZIP code']],
    ['CA', ['City', 'Province', 'Postal code']],
    ['AU', ['Suburb', 'State', 'Postcode']],
    ['FR', ['City', 'State / Region', 'Postal code']],
    [null, ['City', 'State / Region', 'Postal code']],
  ])('%s reads %j', (iso, expected) => {
    expect(english(iso)).toEqual(expected);
  });
});
