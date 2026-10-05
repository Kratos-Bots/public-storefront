import type { OrderDetail } from '@/types/orders.ts';

/** What a payment is called when the shop sent no name for it: the gateway's id read as words, never a raw slug. */
export function methodLabel(method: string): string {
  return method
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}

/**
 * The shop's own name for the method a customer is paying with now, but only when it is certain. The account
 * order's payment rows carry no payment id, so the rows are matched by method id: the name is used when every
 * pending row of that method says the same label. No matching row yet (the account order lags the payment view
 * for a moment after a switch), no label, or rows that disagree: undefined, and the face shows no "Paying with"
 * part rather than a guess or the method id read as words.
 */
export function activeMethodName(payments: OrderDetail['payments'], method: string | null | undefined): string | undefined {
  if (!method) return undefined;
  const labels = new Set(payments.filter((p) => p.method === method && p.status === 'pending').map((p) => p.methodLabel?.trim() ?? ''));
  if (labels.size !== 1) return undefined;
  const [label] = labels;
  return label || undefined;
}
