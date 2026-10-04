import { describe, expect, it } from 'vitest';
import { cancelView } from '@/features/order-status/cancel-state.ts';

describe('cancelView', () => {
  it('offers the button when the order can be cancelled', () => {
    expect(cancelView(true, null)).toBe('button');
  });
  it('points to the shop when money may be on its way', () => {
    expect(cancelView(false, 'bank_transfer')).toBe('contact');
    expect(cancelView(false, 'crypto_submitted')).toBe('contact');
  });
  it('shows nothing when the order is paid, not pending, or the backend is older', () => {
    expect(cancelView(false, 'paid')).toBe('none');
    expect(cancelView(false, null)).toBe('none');
    expect(cancelView(undefined, undefined)).toBe('none');
  });
});
