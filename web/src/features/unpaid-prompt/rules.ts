// The unpaid-order pop-up: every decision that needs no React.
import type { SavedOrder } from '@/stores/saved-orders.ts';
import type { UnpaidOrder } from '@/types/orders.ts';
import type { CancelBlockedBy, PublicOrder } from '@/types/public-order.ts';

/** Paths where the pop-up would be in the way of paying, or is already the subject of the page. */
const BLOCKED = [/^\/checkout(\/|$)/, /^\/order\//, /^\/payment\//, /^\/order-placed(\/|$)/, /^\/account\/orders\/[^/]+/, /^\/login(\/|$)/, /^\/auth\//, /^\/__builder/,
  // Pages the customer reached from an email or a printed label to do one thing.
  /^\/reset-password(\/|$)/, /^\/verify-email(\/|$)/, /^\/verify(\/|$)/, /^\/tracking(\/|$)/];

export function promptAllowedOn(pathname: string): boolean {
  return !BLOCKED.some((re) => re.test(pathname));
}

const MAX_GUEST_CHECKS = 3;
const MAX_AGE_MS = 14 * 86_400_000;

/** The saved order links worth asking about: the newest few, placed recently. */
export function guestCandidates(saved: readonly SavedOrder[], now: Date): SavedOrder[] {
  return saved
    .filter((s) => {
      const at = Date.parse(s.savedAt);
      return Number.isFinite(at) && now.getTime() - at <= MAX_AGE_MS;
    })
    .slice(0, MAX_GUEST_CHECKS);
}

/** A saved order the guest lookup should forget: the link is dead, or the order is over for good. */
export function isTerminalStatus(status: string | undefined): boolean {
  return status === 'cancelled' || status === 'refunded';
}

export interface PromptOrder {
  reference: string;
  accessKey: string | null;
  amount: number;
  /** Where "Complete payment" goes. */
  payPath: string;
  /** Cancel through the order link (a guest) rather than the session. */
  viaLink: boolean;
  canCancel: boolean;
  cancelBlockedBy: CancelBlockedBy | null;
}

export function fromUnpaid(order: UnpaidOrder): PromptOrder {
  return {
    reference: order.reference, accessKey: order.accessKey, amount: order.outstandingBalance,
    payPath: `/account/orders/${encodeURIComponent(order.reference)}`, viaLink: false,
    canCancel: order.canCancel, cancelBlockedBy: order.cancelBlockedBy,
  };
}

/** A guest's saved order, if it can still be paid. */
export function fromPublic(saved: SavedOrder, order: PublicOrder): PromptOrder | null {
  if (!order.payment?.canPay) return null;
  // `canPay` implies nothing has been paid yet, so the order total is the amount due.
  return {
    reference: saved.reference, accessKey: saved.accessKey, amount: order.totals.totalAmount,
    payPath: `/order/${encodeURIComponent(saved.reference)}/${encodeURIComponent(saved.accessKey)}`, viaLink: true,
    canCancel: order.payment.canCancel ?? false, cancelBlockedBy: order.payment.cancelBlockedBy ?? null,
  };
}
