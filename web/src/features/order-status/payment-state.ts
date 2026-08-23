import type {
  CryptoTxidVerification,
  PublicCryptoPayment,
  PublicOrder,
} from '@/types/public-order.ts';
import type { PaymentMethod } from '@/types/checkout.ts';

// The order page's payment logic, kept out of the components that render it.
// Ported from `ecommerce-menu/web/src/features/order-status/{PaymentSection,
// CryptoPaymentCard,OrderStatusPage}.tsx` — the branching is identical, only the
// call sites moved.

/**
 * Crypto payments the customer should see. A cancelled or failed payment is a
 * dead end: its address must never be shown again, and its verification must
 * not keep the page polling.
 */
export function visibleCryptoPayments(order: PublicOrder): PublicCryptoPayment[] {
  return (order.cryptoPayments ?? []).filter(
    (p) => p.paymentStatus !== 'cancelled' && p.paymentStatus !== 'failed',
  );
}

/** Mirror the backend's masking for a just-submitted txid, until the refetch lands. */
export function maskTxid(txid: string): string {
  const t = txid.trim();
  return t.length > 14 ? `${t.slice(0, 6)}…${t.slice(-6)}` : t;
}

/** What the customer's submit returned, before the order refetch overtakes it. */
export interface TxidSubmission {
  verification: CryptoTxidVerification;
  txid: string;
}

/** The masked id to show: the backend's, or the one just submitted here. */
export function submittedTxidMask(
  payment: PublicCryptoPayment,
  submission: TxidSubmission | null | undefined,
): string | null {
  return payment.txidMasked ?? (submission ? maskTxid(submission.txid) : null);
}

export type CardState = 'awaiting' | 'checking' | 'confirmed' | 'attention';

/**
 * Which face a crypto payment card wears. A live submission outranks the order
 * payload — the card has to leave the form the instant the customer submits,
 * including out of `needs_review`, where the submission is the very thing the
 * customer was asked to redo.
 */
export function cardState(
  payment: PublicCryptoPayment,
  submission?: TxidSubmission | null,
): CardState {
  const submitted = submission?.verification ?? null;
  const verification = submitted ?? payment.verificationStatus;
  if (verification === 'confirmed' || payment.paymentStatus === 'completed') return 'confirmed';
  if (verification === 'needs_review' || (payment.needsAttention && !submitted)) return 'attention';
  if (verification === 'checking' || submittedTxidMask(payment, submission)) return 'checking';
  return 'awaiting';
}

/**
 * How often to re-read the order. Fast while something is actively expected to
 * change (a hosted checkout open in another tab, or a txid being verified
 * on-chain), slower while payment is merely outstanding, and not at all once
 * there is nothing left to wait for.
 */
export function pollInterval(order: PublicOrder): number | false {
  const checking = visibleCryptoPayments(order).some((p) => p.verificationStatus === 'checking');
  if (order.payment?.canPay) {
    const gatewayPending = order.payment.activePayment?.kind === 'gateway';
    return gatewayPending || checking ? 10_000 : 30_000;
  }
  return checking ? 30_000 : false;
}

/** What the customer is offered, named by what it is rather than by who settles it. */
const SLOT_BASE: Record<PaymentMethod['slot'], string | null> = {
  card: 'Card',
  crypto: 'Crypto',
  // A bank transfer's display name describes the method ('UK Bank Transfer'),
  // so it is the honest label; the card and crypto slots carry a processor's
  // brand instead, which only raises questions the customer can't act on.
  manual: null,
};

/**
 * Button copy for a payment method: the slot's own name, plus the fee spelled
 * out. The backend signs every rate ('−3%' / '+2%'), and a bare '−3%' reads as
 * a fee at a glance, so the sign becomes a word.
 */
export function slotLabel(method: PaymentMethod): string {
  const base = SLOT_BASE[method.slot] ?? method.displayName;
  const rate = method.feeRateText?.trim();
  if (!rate) return base;
  if (rate.startsWith('−') || rate.startsWith('-')) return `${base} (${rate.slice(1)} discount)`;
  return `${base} (${rate.replace(/^\+/, '')} fee)`;
}

/**
 * A manual bank transfer can't be started from this page: the backend refuses
 * every `manual: true` gateway on the public payment-method route, so the
 * picker shows the transfer details instead of creating a payment.
 */
export function isManual(method: PaymentMethod): boolean {
  return method.slot === 'manual';
}
