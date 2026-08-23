import type { CheckoutResult } from '@/types/checkout.ts';

export type CheckoutOutcome = { kind: 'external'; url: string } | { kind: 'navigate'; to: string };

/**
 * Where to send the shopper once an order has been placed. Pure — it does not save
 * the order reference/access key for later lookup (`saveOrder` in
 * `@/stores/saved-orders.ts`); the submit handler that owns the `publicUrl`/reference
 * pair calls that itself once it decides to navigate there.
 */
export function resolveCheckoutOutcome(r: CheckoutResult): CheckoutOutcome {
  if (r.payment.type === 'checkout_url') return { kind: 'external' as const, url: r.payment.url };
  const orderPath = publicOrderPath(r.publicUrl);
  if ((r.payment.type === 'crypto' || r.payment.type === 'manual') && orderPath) return { kind: 'navigate' as const, to: orderPath };
  const q = new URLSearchParams({ order: r.reference });
  if (r.warning) q.set('warning', '1');
  return { kind: 'navigate' as const, to: orderPath && r.payment.type !== 'none' ? orderPath : `/order-placed?${q}` };
}

/** Same-origin `/order/:ref/:key` when publicUrl points at this site, else null. */
export function publicOrderPath(publicUrl: string | null): string | null {
  if (!publicUrl) return null;
  try { const u = new URL(publicUrl, window.location.origin); const m = u.pathname.match(/^\/order\/([^/]+)\/([^/]+)$/); return m && u.origin === window.location.origin ? u.pathname : null; } catch { return null; }
}
