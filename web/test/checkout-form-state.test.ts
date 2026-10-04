import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_FORM, loadPersistedForm } from '@/features/checkout/form-state.ts';

beforeEach(() => localStorage.clear());

describe('persisted checkout form', () => {
  it('a form saved before newer fields existed loads with their defaults', () => {
    const { addressLine3: _a, deliveryMethod: _d, servicePoint: _s, pointPostcode: _p, ...old } = { ...DEFAULT_FORM, addressLine1: '1 High St', city: 'Leeds' };
    localStorage.setItem('sf-checkout-v1', JSON.stringify(old));
    const loaded = loadPersistedForm();
    expect(loaded).toMatchObject({ addressLine3: '', deliveryMethod: 'home', servicePoint: null, pointPostcode: '', addressLine1: '1 High St' });
  });
});
