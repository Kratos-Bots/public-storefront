import { describe, expect, it } from 'vitest';
import { methodName } from '@/lib/method-name.ts';

describe('methodName', () => {
  it('is the shop\u2019s name, trimmed', () => {
    expect(methodName({ method: 'stripe', displayName: '  Pay by card ' })).toBe('Pay by card');
  });
  it('falls back to the id as words for an empty or missing name', () => {
    expect(methodName({ method: 'uk_bank_transfer', displayName: '' })).toBe('uk bank transfer');
    expect(methodName({ method: 'crypto-static', displayName: '   ' })).toBe('crypto static');
    expect(methodName({ method: 'paypal', displayName: undefined as unknown as string })).toBe('paypal');
  });
});
