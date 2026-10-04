import type { CheckoutResult } from '@/types/checkout.ts';

export type CheckoutOutcome = { kind: 'external'; url: string } | { kind: 'navigate'; to: string };

export const accountOrderPath = (reference: string) => `/account/orders/${encodeURIComponent(reference)}`;

/**
 * Where to send the shopper once an order has been placed. A signed-in customer who still has to act (send crypto,
 * make a transfer) goes to their order page, where the details are. A guest has no order page until they sign in,
 * so they get the order-placed screen, which says so.
 */
export function resolveCheckoutOutcome(r: CheckoutResult, loggedIn: boolean): CheckoutOutcome {
  if (r.payment.type === 'checkout_url') return { kind: 'external', url: r.payment.url };
  if (loggedIn && r.payment.type !== 'none') return { kind: 'navigate', to: accountOrderPath(r.reference) };
  const q = new URLSearchParams({ order: r.reference });
  if (r.warning) q.set('warning', '1');
  return { kind: 'navigate', to: `/order-placed?${q}` };
}
