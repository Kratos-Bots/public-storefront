import type { PaymentMethod } from '@/types/checkout.ts';

/**
 * What a payment method is called on screen: the shop's own name for it, or, when the backend sent none, the
 * method's id read as words ('uk_bank_transfer' -> 'uk bank transfer'; the label's CSS cases it). Never blank.
 */
export function methodName(method: Pick<PaymentMethod, 'method' | 'displayName'>): string {
  const named = method.displayName?.trim();
  if (named) return named;
  return method.method.replace(/[_-]+/g, ' ').trim();
}
