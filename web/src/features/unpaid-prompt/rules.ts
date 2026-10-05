// The unpaid-order pop-up: every decision that needs no React.
import type { UnpaidOrder } from '@/types/orders.ts';

/** Paths where the pop-up would be in the way of paying, or is already the subject of the page. */
const BLOCKED = [/^\/checkout(\/|$)/, /^\/order\//, /^\/payment\//, /^\/order-placed(\/|$)/, /^\/account\/orders\/[^/]+/, /^\/login(\/|$)/, /^\/auth\//, /^\/__builder/,
  // Pages the customer reached from an email or a printed label to do one thing.
  /^\/reset-password(\/|$)/, /^\/verify-email(\/|$)/, /^\/verify(\/|$)/, /^\/tracking(\/|$)/];

export function promptAllowedOn(pathname: string): boolean {
  return !BLOCKED.some((re) => re.test(pathname));
}

export interface PromptOrder {
  reference: string;
  amount: number;
  /** Where "Review or cancel order" goes. */
  reviewPath: string;
}

export function fromUnpaid(order: UnpaidOrder): PromptOrder {
  return { reference: order.reference, amount: order.outstandingBalance, reviewPath: `/account/orders/${encodeURIComponent(order.reference)}` };
}
