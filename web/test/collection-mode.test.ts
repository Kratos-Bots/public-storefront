import { describe, expect, it } from 'vitest';
import { DEFAULT_FORM, type CheckoutForm } from '@/features/checkout/form-state.ts';
import {
  collectionAddress, modeForCountry, pickerCountries, quoteDeliveryFields, reconcileDelivery, shipListsOf,
} from '@/features/checkout/collection-mode.ts';
import type { ServicePoint } from '@/types/service-points.ts';

const point = (over: Partial<ServicePoint> = {}): ServicePoint => ({
  id: '12345', carrier: 'inpost', name: 'Tesco Express', street: 'Kirkgate', houseNumber: '14', postalCode: 'LS1 6BY',
  city: 'Leeds', country: 'GB', latitude: null, longitude: null, distance: 300, ...over,
});
const lists = { home: ['GB', 'IE'], collection: ['GB', 'FR'] };
const form = (over: Partial<CheckoutForm> = {}): CheckoutForm => ({ ...DEFAULT_FORM, ...over });

describe('shipListsOf', () => {
  it('normalises both lists and tolerates an older backend', () => {
    expect(shipListsOf({ shipping: { countries: ['gb', 'GB', 'x'], collectionCountries: [' fr '] } })).toEqual({ home: ['GB'], collection: ['FR'] });
    expect(shipListsOf({ shipping: { countries: ['GB'] } })).toEqual({ home: ['GB'], collection: [] });
    expect(shipListsOf({})).toEqual({ home: [], collection: [] });
  });
});

describe('pickerCountries', () => {
  it('is the union, home first, each country once', () => {
    expect(pickerCountries(lists)).toEqual(['GB', 'IE', 'FR']);
  });
  it('is empty (list every country) while the home list is unknown', () => {
    expect(pickerCountries({ home: [], collection: ['FR'] })).toEqual([]);
  });
});

describe('modeForCountry', () => {
  it.each([
    ['GB', 'choice'],      // in both
    ['FR', 'collection'],  // collection only
    ['IE', 'home'],        // home only
    ['DE', 'home'],        // in neither
    ['', 'home'],          // nothing chosen
  ] as const)('%s → %s', (country, mode) => {
    expect(modeForCountry(country, lists, 'optional')).toBe(mode);
  });
  it('with the home list unknown, a collection country offers the choice', () => {
    expect(modeForCountry('FR', { home: [], collection: ['FR'] }, 'optional')).toBe('choice');
    expect(modeForCountry('GB', { home: [], collection: ['FR'] }, 'optional')).toBe('home');
  });
  it('a shop that hides the phone field offers no collection', () => {
    expect(modeForCountry('GB', lists, 'hidden')).toBe('home');
    expect(modeForCountry('FR', lists, 'hidden')).toBe('home');
  });
});

describe('reconcileDelivery', () => {
  const run = (prev: CheckoutForm, patch: Partial<CheckoutForm>, phoneMode: 'hidden' | 'optional' | 'required' = 'optional') =>
    reconcileDelivery(prev, { ...prev, ...patch }, lists, phoneMode);

  it('returns the same object when nothing needs changing', () => {
    const next = form({ country: 'GB', addressLine1: '1 High St' });
    expect(reconcileDelivery(form({ country: 'GB' }), next, lists, 'optional')).toBe(next);
  });

  it('changing the country clears the point and the delivery option', () => {
    const prev = form({ country: 'GB', deliveryMethod: 'collection', servicePoint: point(), shippingOptionId: 7 });
    const out = run(prev, { country: 'FR' });
    expect(out.servicePoint).toBeNull();
    expect(out.shippingOptionId).toBeNull();
  });

  it('a collection-only country forces collection; a home-only one forces home', () => {
    expect(run(form({ country: 'GB' }), { country: 'FR' }).deliveryMethod).toBe('collection');
    expect(run(form({ country: 'GB', deliveryMethod: 'collection' }), { country: 'IE' }).deliveryMethod).toBe('home');
  });

  it('a country with both keeps what the shopper chose', () => {
    expect(run(form({ country: 'GB' }), { deliveryMethod: 'collection' }).deliveryMethod).toBe('collection');
  });

  it('switching method clears the delivery option but keeps the home address and the point', () => {
    const prev = form({ country: 'GB', addressLine1: '1 High St', city: 'Leeds', servicePoint: point(), shippingOptionId: 7 });
    const out = run(prev, { deliveryMethod: 'collection' });
    expect(out.shippingOptionId).toBeNull();
    expect(out.addressLine1).toBe('1 High St');
    expect(out.servicePoint).toEqual(point());
  });

  it('a point from another carrier clears the delivery option; the same carrier keeps it', () => {
    const prev = form({ country: 'GB', deliveryMethod: 'collection', servicePoint: point(), shippingOptionId: 7 });
    expect(run(prev, { servicePoint: point({ id: '9', carrier: 'evri' }) }).shippingOptionId).toBeNull();
    expect(run(prev, { servicePoint: point({ id: '9' }) }).shippingOptionId).toBe(7);
  });

  it('choosing a delivery option is left alone', () => {
    const prev = form({ country: 'GB', deliveryMethod: 'collection', servicePoint: point() });
    expect(run(prev, { shippingOptionId: 7 }).shippingOptionId).toBe(7);
  });

  it('a remembered collection choice is dropped when the shop hides the phone field', () => {
    const prev = form({ country: 'GB', deliveryMethod: 'collection', servicePoint: point(), shippingOptionId: 7 });
    const out = reconcileDelivery(prev, prev, lists, 'hidden');
    expect(out.deliveryMethod).toBe('home');
    expect(out.shippingOptionId).toBeNull();
  });
});

describe('what a collection form sends', () => {
  const collecting = form({ country: 'GB', firstName: ' Ada ', surname: 'Sterling', deliveryMethod: 'collection', servicePoint: point(), addressLine1: '1 High St', county: 'Yorks' });

  it('quoteDeliveryFields sends nothing for home, the method alone before a point is chosen, and the carrier after', () => {
    expect(quoteDeliveryFields(form({ country: 'GB' }))).toEqual({});
    // A point kept from before a switch back to home must not leak its carrier.
    expect(quoteDeliveryFields(form({ country: 'GB', servicePoint: point() }))).toEqual({});
    expect(quoteDeliveryFields(form({ country: 'GB', deliveryMethod: 'collection' }))).toEqual({ deliveryMethod: 'collection' });
    expect(quoteDeliveryFields(collecting)).toEqual({ deliveryMethod: 'collection', servicePointCarrier: 'inpost' });
  });

  it('collectionAddress needs the method and a point', () => {
    expect(collectionAddress(form({ country: 'GB', deliveryMethod: 'collection' }))).toBeNull();
    expect(collectionAddress(form({ country: 'GB', servicePoint: point() }))).toBeNull();
  });

  it('collectionAddress is the shopper’s name at the point’s address, with the point fields', () => {
    expect(collectionAddress(collecting)).toEqual({
      firstName: 'Ada', surname: 'Sterling', addressLine1: 'Kirkgate 14', addressLine2: null, addressLine3: null,
      city: 'Leeds', county: null, zip: 'LS1 6BY', country: 'GB',
      servicePointId: '12345', servicePointCarrier: 'inpost', servicePointName: 'Tesco Express',
    });
  });

  it('falls back to the point name when it has no street', () => {
    const noStreet = { ...collecting, servicePoint: point({ street: '', houseNumber: '' }) };
    expect(collectionAddress(noStreet)?.addressLine1).toBe('Tesco Express');
  });

  it('is null when the form is not a collection', () => {
    expect(collectionAddress(form({ country: 'GB' }))).toBeNull();
  });
});
