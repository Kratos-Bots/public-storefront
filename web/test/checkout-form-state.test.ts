import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_FORM, loadPersistedForm } from '@/features/checkout/form-state.ts';

beforeEach(() => localStorage.clear());

describe('persisted checkout form', () => {
  it('a form saved before address line 3 existed loads with a blank line 3', () => {
    const { addressLine3: _dropped, ...old } = { ...DEFAULT_FORM, addressLine1: '1 High St', city: 'Leeds' };
    localStorage.setItem('sf-checkout-v1', JSON.stringify(old));
    const loaded = loadPersistedForm();
    expect(loaded?.addressLine3).toBe('');
    expect(loaded?.addressLine1).toBe('1 High St');
  });
});
