import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_FORM, loadPersistedForm, sanitiseServicePoint } from '@/features/checkout/form-state.ts';

const good = {
  id: '1', carrier: 'inpost', name: 'Tesco Express', street: 'Kirkgate', houseNumber: '14', postalCode: 'LS1 6BY',
  city: 'Leeds', country: 'GB', latitude: 53.8, longitude: -1.5, distance: 300,
};

beforeEach(() => localStorage.clear());

describe('persisted checkout form', () => {
  it('a form saved before newer fields existed loads with their defaults', () => {
    const { addressLine3: _a, deliveryMethod: _d, servicePoint: _s, pointPostcode: _p, ...old } = { ...DEFAULT_FORM, addressLine1: '1 High St', city: 'Leeds' };
    localStorage.setItem('sf-checkout-v1', JSON.stringify(old));
    const loaded = loadPersistedForm();
    expect(loaded).toMatchObject({ addressLine3: '', deliveryMethod: 'home', servicePoint: null, pointPostcode: '', addressLine1: '1 High St' });
  });

  it('sanitiseServicePoint keeps a valid point unchanged', () => {
    expect(sanitiseServicePoint(good)).toEqual(good);
  });

  it('sanitiseServicePoint rejects anything that is not a complete point', () => {
    for (const bad of ['x', 42, [], {}, null, undefined, { ...good, street: 5 }]) expect(sanitiseServicePoint(bad)).toBeNull();
  });

  it('sanitiseServicePoint drops extra keys and non-finite numbers', () => {
    const out = sanitiseServicePoint({ ...good, extra: 'x', distance: 'far', latitude: Infinity });
    expect(out).toEqual({ ...good, distance: null, latitude: null });
    expect(out).not.toHaveProperty('extra');
  });

  it('an unknown deliveryMethod loads as home', () => {
    localStorage.setItem('sf-checkout-v1', JSON.stringify({ ...DEFAULT_FORM, deliveryMethod: 'drone' }));
    expect(loadPersistedForm()?.deliveryMethod).toBe('home');
  });

  it('a malformed saved point and postcode do not break loading', () => {
    localStorage.setItem('sf-checkout-v1', JSON.stringify({ ...DEFAULT_FORM, deliveryMethod: 'collection', servicePoint: { ...good, street: 5 }, pointPostcode: 7 }));
    const loaded = loadPersistedForm();
    expect(loaded).toMatchObject({ deliveryMethod: 'collection', servicePoint: null, pointPostcode: '' });
  });
});
