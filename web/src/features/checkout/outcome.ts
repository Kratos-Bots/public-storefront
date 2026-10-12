import type { CheckoutResult } from '@/types/checkout.ts';

/**
 * Router `state` the order-placed screen reads: the hosted checkout's address, for the "Open checkout" button.
 * It travels in navigation state, never the query string, so it does not end up in a shareable URL.
 */
export interface OrderPlacedState { checkoutUrl: string }

/** Where to navigate once an order is placed, and any router state to carry along. */
export interface CheckoutOutcome { to: string; state?: OrderPlacedState }

export const accountOrderPath = (reference: string) => `/account/orders/${encodeURIComponent(reference)}`;

/**
 * Where to send the shopper once an order has been placed. Nobody is ever sent off to a payment processor: a hosted
 * checkout only opens when the shopper taps "Open checkout" on the page this returns. A signed-in customer who still
 * has to act (pay online, send crypto, make a transfer) goes to their order page, where the button and the details are;
 * that includes a guest whose checkout just created their account. A guest with no session has no order page, so they
 * get the order-placed screen, which carries the hosted checkout's address in router state for its own button.
 */
export function resolveCheckoutOutcome(r: CheckoutResult, loggedIn: boolean): CheckoutOutcome {
  if (loggedIn && r.payment.type !== 'none') return { to: accountOrderPath(r.reference) };
  const q = new URLSearchParams({ order: r.reference });
  if (r.warning) q.set('warning', '1');
  const to = `/order-placed?${q}`;
  return r.payment.type === 'checkout_url' ? { to, state: { checkoutUrl: r.payment.url } } : { to };
}

/** The hosted checkout address in an order-placed navigation state, or null when absent or not a web address. */
export function checkoutUrlFromState(state: unknown): string | null {
  const url = (state as Partial<OrderPlacedState> | null | undefined)?.checkoutUrl;
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
}
