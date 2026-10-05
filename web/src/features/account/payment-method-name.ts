import type { OrderDetail } from '@/types/orders.ts';

/** What a payment is called when the shop sent no name for it: the gateway's id read as words, never a raw slug. */
export function methodLabel(method: string): string {
  return method
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}

/**
 * The name to show for the method a customer is paying with now: the shop's own name (`methodLabel`) on the newest
 * pending payment of that method, else the method id read as words. Undefined when there is no method to name.
 */
export function activeMethodName(payments: OrderDetail['payments'], method: string | null | undefined): string | undefined {
  if (!method) return undefined;
  const newest = payments
    .filter((p) => p.method === method && p.status === 'pending')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const name = newest?.methodLabel?.trim() || methodLabel(method);
  return name || undefined;
}
