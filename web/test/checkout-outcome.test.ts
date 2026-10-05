import { describe, expect, it } from 'vitest';
import { accountOrderPath, resolveCheckoutOutcome } from '@/features/checkout/outcome.ts';
import type { CheckoutResult } from '@/types/checkout.ts';

const result = (payment: CheckoutResult['payment'], extra: Partial<CheckoutResult> = {}): CheckoutResult =>
  ({ reference: 'K4M2QP', publicUrl: 'https://shop.example/order/K4M2QP/key', status: 'pending', total: 46.03, payment, ...extra });

describe('accountOrderPath', () => {
  it('encodes the reference', () => expect(accountOrderPath('A/1')).toBe('/account/orders/A%2F1'));
});

describe('resolveCheckoutOutcome', () => {
  it.each([true, false])('a hosted checkout goes to the processor (signed in: %s)', (loggedIn) => {
    expect(resolveCheckoutOutcome(result({ type: 'checkout_url', url: 'https://pay.example/x' } as CheckoutResult['payment']), loggedIn))
      .toEqual({ kind: 'external', url: 'https://pay.example/x' });
  });
  it.each(['crypto', 'manual'])('signed in, %s: the account order page, never the key link', (type) => {
    expect(resolveCheckoutOutcome(result({ type } as CheckoutResult['payment']), true)).toEqual({ kind: 'navigate', to: '/account/orders/K4M2QP' });
  });
  it.each(['crypto', 'manual'])('guest, %s: order placed', (type) => {
    expect(resolveCheckoutOutcome(result({ type } as CheckoutResult['payment']), false)).toEqual({ kind: 'navigate', to: '/order-placed?order=K4M2QP' });
  });
  it.each([true, false])('no payment: order placed, with the warning flag (signed in: %s)', (loggedIn) => {
    expect(resolveCheckoutOutcome(result({ type: 'none' } as CheckoutResult['payment'], { warning: 'x' }), loggedIn))
      .toEqual({ kind: 'navigate', to: '/order-placed?order=K4M2QP&warning=1' });
  });
});
