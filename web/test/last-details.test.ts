import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_FORM, type CheckoutForm } from '@/features/checkout/form-state.ts';
import {
  DISMISS_KEY,
  addressHasTyping,
  isShippable,
  lastDetailsPatch,
  offerSummary,
  readDismissed,
  shouldOfferLastDetails,
  splitPhone,
  writeDismissed,
} from '@/features/checkout/last-details.ts';
import type { LastCheckoutDetails } from '@/types/checkout.ts';
import type { ContactModes } from '@/types/settings.ts';

const DETAILS: LastCheckoutDetails = {
  orderReference: 'ORD-0001', placedAt: '2026-09-01T10:00:00.000Z',
  firstName: 'Alex', surname: 'Rowan',
  addressLine1: '14 Test Lane', addressLine2: 'Flat 2', addressLine3: null,
  city: 'Leeds', county: 'West Yorkshire', zip: 'LS1 4AB', country: 'GB',
  email: 'alex@example.invalid', phone: '+447700900123', servicePoint: null,
};
const MODES: ContactModes = { phoneMode: 'optional', emailMode: 'required', defaultPhoneCountry: 'GB' };
const form = (o: Partial<CheckoutForm> = {}): CheckoutForm => ({ ...DEFAULT_FORM, ...o });
const ctx = (o: Partial<Parameters<typeof lastDetailsPatch>[1]> = {}) => ({ contactModes: MODES, shipCountries: ['GB', 'DE'], shipsNowhere: false, form: form(), ...o });

afterEach(() => sessionStorage.clear());

describe('shouldOfferLastDetails', () => {
  const base = { loggedIn: true, customerId: 7, details: DETAILS, form: form(), dismissedFor: null as number | null };

  it('offers to a signed-in shopper with details and an empty form', () => {
    expect(shouldOfferLastDetails(base)).toBe(true);
  });
  it('ignores the seeded country and phone prefix', () => {
    expect(shouldOfferLastDetails({ ...base, form: form({ country: 'GB', phonePrefix: 'GB' }) })).toBe(true);
  });
  it.each([
    ['a guest', { loggedIn: false }],
    ['no customer id', { customerId: null }],
    ['a details response of null', { details: null }],
    ['details still loading', { details: undefined }],
    ['this customer said no thanks', { dismissedFor: 7 }],
  ] as const)('does not offer for %s', (_label, over) => {
    expect(shouldOfferLastDetails({ ...base, ...over })).toBe(false);
  });
  it('offers again to another customer in the same tab', () => {
    expect(shouldOfferLastDetails({ ...base, customerId: 8, dismissedFor: 7 })).toBe(true);
  });
  it.each(['firstName', 'surname', 'email', 'phone'] as const)(
    'still offers with %s filled in (a restored draft): only the address decides', (field) => {
      expect(shouldOfferLastDetails({ ...base, form: form({ [field]: 'x' }) })).toBe(true);
    },
  );
  it('still offers with every contact field filled and the address empty', () => {
    expect(shouldOfferLastDetails({ ...base, form: form({ firstName: 'A', surname: 'B', email: 'a@example.invalid', phone: '7700900123' }) })).toBe(true);
  });
  it.each(['addressLine1', 'addressLine2', 'addressLine3', 'city', 'county', 'zip'] as const)(
    'does not offer once %s holds anything', (field) => {
      expect(shouldOfferLastDetails({ ...base, form: form({ [field]: 'x' }) })).toBe(false);
    },
  );
  it('whitespace is not typing; a restored collection point is', () => {
    expect(addressHasTyping(form({ addressLine1: '   ' }))).toBe(false);
    expect(addressHasTyping(form({ servicePoint: { id: 'p', carrier: 'c', name: 'n', street: '', houseNumber: '', postalCode: '', city: '', country: 'GB', latitude: null, longitude: null, distance: null } }))).toBe(true);
    expect(shouldOfferLastDetails({ ...base, form: form({ servicePoint: { id: 'p', carrier: 'c', name: 'n', street: '', houseNumber: '', postalCode: '', city: '', country: 'GB', latitude: null, longitude: null, distance: null } }) })).toBe(false);
  });
});

describe('dismissal storage', () => {
  it('round-trips the customer id in sessionStorage under the agreed key', () => {
    expect(readDismissed()).toBeNull();
    writeDismissed(7);
    expect(sessionStorage.getItem(DISMISS_KEY)).toBe('7');
    expect(readDismissed()).toBe(7);
  });
  it('a non-numeric stored value reads as nobody', () => {
    sessionStorage.setItem(DISMISS_KEY, 'abc');
    expect(readDismissed()).toBeNull();
  });
  it('blocked storage neither throws nor remembers', () => {
    const real = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    Storage.prototype.setItem = () => { throw new Error('blocked'); };
    try {
      expect(() => writeDismissed(7)).not.toThrow();
      expect(readDismissed()).toBeNull();
    } finally {
      Storage.prototype.getItem = real;
      Storage.prototype.setItem = set;
    }
  });
});

describe('splitPhone', () => {
  it('splits an E.164 number into the picker country and the national digits that compose back to it', () => {
    expect(splitPhone('+447700900123', ['GB'])).toEqual({ prefix: 'GB', national: '7700900123' });
  });
  it('prefers a hinted country that shares the calling code, else the first that has it', () => {
    expect(splitPhone('+12025550123', ['CA'])).toEqual({ prefix: 'CA', national: '2025550123' });
    expect(splitPhone('+12025550123', ['FR', ''])!.national).toBe('2025550123');
    expect(splitPhone('+12025550123', [])).toMatchObject({ national: '2025550123' });
  });
  it('takes the longest calling code', () => {
    expect(splitPhone('+353871234567', [])).toEqual({ prefix: 'IE', national: '871234567' });
  });
  it.each([
    ['no plus sign', '07700900123'],
    ['no phone', null],
    ['blank', '  '],
    ['no known calling code', '+999123456789'],
    ['a national part too short', '+4412'],
    ['a national part too long', '+4412345678901234567'],
  ])('cannot split %s: null', (_label, phone) => {
    expect(splitPhone(phone as string | null, ['GB'])).toBeNull();
  });
});

describe('isShippable', () => {
  it('needs an ISO code the shop delivers to; an unknown (empty) list takes any', () => {
    expect(isShippable('GB', ['GB'], false)).toBe(true);
    expect(isShippable('gb', ['GB'], false)).toBe(true);
    expect(isShippable('FR', ['GB'], false)).toBe(false);
    expect(isShippable('FR', [], false)).toBe(true);
    expect(isShippable('France', [], false)).toBe(false);
    expect(isShippable('GB', ['GB'], true)).toBe(false);
  });
});

describe('lastDetailsPatch', () => {
  it('fills only the blanks: a typed name, email or phone is never overwritten', () => {
    const patch = lastDetailsPatch(DETAILS, ctx({ form: form({ firstName: 'Sam', email: 'typed@example.invalid', phone: '7000000000', phonePrefix: 'DE' }) }));
    expect(patch).not.toHaveProperty('firstName');
    expect(patch).not.toHaveProperty('email');
    expect(patch).not.toHaveProperty('phone');
    expect(patch).not.toHaveProperty('phonePrefix');
    expect(patch).not.toHaveProperty('phonePrefixTouched');
    expect(patch).toMatchObject({ surname: 'Rowan', addressLine1: '14 Test Lane', city: 'Leeds', country: 'GB' });
  });
  it('fills the blank ones next to a typed one', () => {
    const patch = lastDetailsPatch(DETAILS, ctx({ form: form({ email: 'typed@example.invalid' }) }));
    expect(patch).toMatchObject({ firstName: 'Alex', surname: 'Rowan', phone: '7700900123' });
    expect(patch).not.toHaveProperty('email');
  });
  it('fills name, address, country, email and phone', () => {
    expect(lastDetailsPatch(DETAILS, ctx())).toEqual({
      firstName: 'Alex', surname: 'Rowan', email: 'alex@example.invalid',
      phonePrefix: 'GB', phonePrefixTouched: true, phone: '7700900123',
      addressLine1: '14 Test Lane', addressLine2: 'Flat 2', addressLine3: '', city: 'Leeds', county: 'West Yorkshire', zip: 'LS1 4AB', country: 'GB',
    });
  });
  it('leaves the country as it was when the shop cannot deliver there, and fills the rest', () => {
    const patch = lastDetailsPatch({ ...DETAILS, country: 'FR' }, ctx());
    expect(patch).not.toHaveProperty('country');
    expect(patch).toMatchObject({ addressLine1: '14 Test Lane', city: 'Leeds', zip: 'LS1 4AB' });
  });
  it('leaves the country alone when the warehouse delivers nowhere', () => {
    expect(lastDetailsPatch(DETAILS, ctx({ shipsNowhere: true }))).not.toHaveProperty('country');
  });
  it('a collection-point order takes the name and contact details only: no address lines, no country', () => {
    const patch = lastDetailsPatch({ ...DETAILS, servicePoint: { id: 'sp-1', carrier: 'evri', name: 'Corner News' }, addressLine1: '1 Point Street' }, ctx());
    expect(Object.keys(patch).sort()).toEqual(['email', 'firstName', 'phone', 'phonePrefix', 'phonePrefixTouched', 'surname']);
    expect(patch).not.toHaveProperty('deliveryMethod');
  });
  it('leaves the phone empty when it cannot be split, and does not touch the prefix', () => {
    const patch = lastDetailsPatch({ ...DETAILS, phone: '07700900123' }, ctx());
    expect(patch).not.toHaveProperty('phone');
    expect(patch).not.toHaveProperty('phonePrefix');
    expect(patch.email).toBe('alex@example.invalid');
  });
  it('skips contact fields the shop hides, and absent ones', () => {
    const patch = lastDetailsPatch(DETAILS, ctx({ contactModes: { phoneMode: 'hidden', emailMode: 'hidden', defaultPhoneCountry: null } }));
    expect(patch).not.toHaveProperty('email');
    expect(patch).not.toHaveProperty('phone');
    expect(lastDetailsPatch({ ...DETAILS, email: null, phone: null }, ctx())).not.toHaveProperty('email');
  });
});

describe('offerSummary', () => {
  it('names the shopper and sums the address on one line', () => {
    expect(offerSummary(DETAILS)).toEqual({ name: 'Alex Rowan', address: '14 Test Lane, Flat 2, Leeds, West Yorkshire, LS1 4AB, GB' });
  });
  it('shows no address for a collection order', () => {
    expect(offerSummary({ ...DETAILS, servicePoint: { id: 'sp-1', carrier: 'evri', name: 'Corner News' } })).toEqual({ name: 'Alex Rowan', address: null });
  });
});
