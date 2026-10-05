import type {
  CryptoTxidVerification,
  PublicCryptoPayment,
  PublicOrder,
} from '@/types/public-order.ts';
import type { PaymentMethod } from '@/types/checkout.ts';
import { methodName } from '@/lib/method-name.ts';
import { textSnapshot } from '@/text/snapshot.ts';

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

// The payment read is rate limited, and a failed read is usually the limit or an outage: back right off.
const FAILED_READ_POLL_MS = 60_000;

/**
 * `pollInterval` for a query: React Query keeps the last good data after a failed refetch, so data alone cannot
 * say the last read failed. After a failure we keep polling, slowly, so a customer who finishes a hosted checkout
 * in another tab still catches up once the route answers again.
 */
export function paymentPollInterval(state: {
  data: PublicOrder | undefined;
  status: 'pending' | 'error' | 'success';
}): number | false {
  if (!state.data) return false;
  return state.status === 'error' ? FAILED_READ_POLL_MS : pollInterval(state.data);
}

/**
 * Everything on the public order that the account order page also shows or acts on: its status,
 * whether it can still be paid or cancelled, the active payment, and each crypto payment's
 * progress. Two reads with the same signature need no account-order refetch.
 */
export function paymentSignature(order: PublicOrder): string {
  const p = order.payment;
  return JSON.stringify([
    order.status,
    p?.canPay ?? null,
    p?.canCancel ?? null,
    p?.cancelBlockedBy ?? null,
    p?.activePayment ? [p.activePayment.paymentId, p.activePayment.status] : null,
    (order.cryptoPayments ?? []).map((c) => [c.paymentId, c.paymentStatus, c.verificationStatus]),
  ]);
}

/**
 * Button copy for a payment method: the name the shop gave it, plus the fee spelled
 * out. The backend signs every rate ('−3%' / '+2%'), and a bare '−3%' reads as
 * a fee at a glance, so the sign becomes a word.
 */
export function slotLabel(method: PaymentMethod): string {
  const { t } = textSnapshot();
  const base = methodName(method);
  const rate = method.feeRateText?.trim();
  if (!rate) return base;
  if (rate.startsWith('−') || rate.startsWith('-')) return t('order.method.withDiscount', { method: base, rate: rate.slice(1) });
  return t('order.method.withFee', { method: base, rate: rate.replace(/^\+/, '') });
}

/**
 * A manual bank transfer can't be started from this page: the backend refuses
 * every manual gateway on the public payment-method route, so the
 * picker shows the transfer details instead of creating a payment.
 */
export function isManual(method: PaymentMethod): boolean {
  return method.type === 'offline';
}

/** An amount in the currency the payment actually settles in. */
export interface SettlementQuote {
  amount: number;
  currency: string;
}

/**
 * The backend's settlement quote for `method`, when the order's pending payment
 * is that method and carries one (a UK bank transfer from a non-GBP store is
 * quoted in GBP once, when the payment is created). The picker lists every
 * method, so a quote on one must never be shown against another.
 */
export function settlementQuote(order: PublicOrder, method: PaymentMethod): SettlementQuote | null {
  const active = order.payment?.activePayment;
  if (!active || active.method !== method.method || active.status !== 'pending') return null;
  const { settlementAmount, settlementCurrency } = active;
  if (settlementAmount == null || !settlementCurrency) return null;
  return { amount: settlementAmount, currency: settlementCurrency };
}
