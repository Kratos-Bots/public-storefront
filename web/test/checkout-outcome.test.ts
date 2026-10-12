import { describe, expect, it } from 'vitest';
import { accountOrderPath, checkoutUrlFromState, resolveCheckoutOutcome } from '@/features/checkout/outcome.ts';
import type { CheckoutResult } from '@/types/checkout.ts';

const result = (payment: CheckoutResult['payment'], extra: Partial<CheckoutResult> = {}): CheckoutResult =>
  ({ reference: 'K4M2QP', publicUrl: 'https://shop.example/order/K4M2QP/key', status: 'pending', total: 46.03, payment, ...extra });
const hosted = { type: 'checkout_url', url: 'https://pay.example/x' } as CheckoutResult['payment'];

describe('accountOrderPath', () => {
  it('encodes the reference', () => expect(accountOrderPath('A/1')).toBe('/account/orders/A%2F1'));
});

describe('resolveCheckoutOutcome', () => {
  it('a hosted checkout, signed in: the account order page, no state', () => {
    expect(resolveCheckoutOutcome(result(hosted), true)).toEqual({ to: '/account/orders/K4M2QP' });
  });
  it('a hosted checkout, guest: order placed, with the address in state and not in the URL', () => {
    const outcome = resolveCheckoutOutcome(result(hosted), false);
    expect(outcome).toEqual({ to: '/order-placed?order=K4M2QP', state: { checkoutUrl: 'https://pay.example/x' } });
    expect(outcome.to).not.toContain('pay.example');
  });
  it('a hosted checkout with a warning still carries the flag', () => {
    expect(resolveCheckoutOutcome(result(hosted, { warning: 'x' }), false).to).toBe('/order-placed?order=K4M2QP&warning=1');
  });
  it.each(['crypto', 'manual'])('signed in, %s: the account order page, never the key link', (type) => {
    expect(resolveCheckoutOutcome(result({ type } as CheckoutResult['payment']), true)).toEqual({ to: '/account/orders/K4M2QP' });
  });
  it.each(['crypto', 'manual'])('guest, %s: order placed, no state', (type) => {
    expect(resolveCheckoutOutcome(result({ type } as CheckoutResult['payment']), false)).toEqual({ to: '/order-placed?order=K4M2QP' });
  });
  it.each([true, false])('no payment: order placed, with the warning flag (signed in: %s)', (loggedIn) => {
    expect(resolveCheckoutOutcome(result({ type: 'none' } as CheckoutResult['payment'], { warning: 'x' }), loggedIn))
      .toEqual({ to: '/order-placed?order=K4M2QP&warning=1' });
  });
});

describe('checkoutUrlFromState', () => {
  it('reads a web address', () => expect(checkoutUrlFromState({ checkoutUrl: 'https://pay.example/x' })).toBe('https://pay.example/x'));
  it.each([null, undefined, {}, { checkoutUrl: 5 }, { checkoutUrl: 'javascript:alert(1)' }])('rejects %j', (s) => {
    expect(checkoutUrlFromState(s)).toBeNull();
  });
});
