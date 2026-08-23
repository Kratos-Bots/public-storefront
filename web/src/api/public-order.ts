import { api, unwrap } from '@/api/client.ts';
import { ApiError } from '@/lib/errors.ts';
import type { PaymentMethod } from '@/types/checkout.ts';
import type {
  CryptoTxidVerification,
  PublicOrder,
  SelectPaymentResult,
} from '@/types/public-order.ts';

/**
 * The order's own public surface. Auth is the reference plus its HMAC access
 * key — the link itself is the credential — so nothing here reads the session,
 * and these are the only storefront calls that work for a signed-out customer
 * holding a link from a chat message.
 *
 * The Worker rewrites `/api/<rest>` to `<backend>/api/v1/public/<rest>`, so the
 * paths below start at `orders/`.
 */

/** The link is unusable: wrong reference, wrong or expired key, no such order. */
export class InvalidLinkError extends Error {
  constructor() {
    super('Invalid order link');
    this.name = 'InvalidLinkError';
  }
}

/** 409 — the order's payment state moved under us (paid, cancelled, no longer pending). */
export class PaymentConflictError extends Error {
  constructor() {
    super('Order payment state changed');
    this.name = 'PaymentConflictError';
  }
}

const base = (reference: string, accessKey: string) =>
  `orders/${encodeURIComponent(reference)}/${encodeURIComponent(accessKey)}`;

/**
 * A bad reference or key is a client-facing "this link isn't valid", not a
 * server fault. The backend answers 404 for an unknown reference or a wrong
 * key, and 422 when the params schema refuses the pair outright — an
 * oversized or garbled reference/key never becomes a valid link, so retrying it
 * is hopeless and it belongs on the invalid-link screen. Everything else stays
 * an `ApiError`, so a 503 or a network drop reaches the retry screen instead of
 * telling the customer their link is broken.
 *
 * 422 is deliberately NOT in `asActionError`: on the two action routes the same
 * status carries the backend's own customer-written message about the *method*
 * or the *txid*, which the customer can act on.
 */
const LINK_STATUSES = [400, 403, 404, 422];

function asLinkError(err: unknown): never {
  if (err instanceof ApiError && LINK_STATUSES.includes(err.status)) throw new InvalidLinkError();
  throw err;
}

/**
 * The action routes map 404 alone. A 422 there is the backend's own
 * ValidationError about the *method* or the *txid* ("Payment method 'x' is not
 * available online", "That transaction has already been used") — written for
 * customers, and reading it as a broken link would throw the whole page away
 * over a message they can act on.
 */
function asActionError(err: unknown): never {
  if (err instanceof ApiError && err.status === 404) throw new InvalidLinkError();
  throw err;
}

export function fetchPublicOrder(reference: string, accessKey: string): Promise<PublicOrder> {
  return unwrap<PublicOrder>(api.get(base(reference, accessKey))).catch(asLinkError);
}

/**
 * The methods this order can be paid with right now, in the same shape as the
 * checkout quote's `paymentMethods`. `[]` once the order can no longer be paid.
 */
export function fetchPaymentOptions(
  reference: string,
  accessKey: string,
): Promise<PaymentMethod[]> {
  return unwrap<PaymentMethod[]>(api.get(`${base(reference, accessKey)}/payment-options`)).catch(
    asLinkError,
  );
}

export interface PaymentSelection {
  method: string;
  coin?: string;
  network?: string;
}

/**
 * Create the order's first payment, or switch a pending one. A 409 means the
 * order moved on while the page was open — the caller refetches rather than
 * showing an error, because the new state is the answer.
 */
export function selectPaymentMethod(
  reference: string,
  accessKey: string,
  selection: PaymentSelection,
): Promise<SelectPaymentResult> {
  return unwrap<SelectPaymentResult>(
    api.post(`${base(reference, accessKey)}/payment-method`, { json: selection }),
  ).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 409) throw new PaymentConflictError();
    return asActionError(err);
  });
}

/**
 * Submit the customer's transaction id for a static-crypto payment. Rate
 * limited 30/15min by the backend; a rejected id comes back as a 400/422 whose
 * message is written for customers, so it is surfaced verbatim.
 */
export async function submitCryptoTxid(
  reference: string,
  accessKey: string,
  paymentId: number,
  txid: string,
): Promise<CryptoTxidVerification> {
  const data = await unwrap<{ verificationStatus?: string }>(
    api.post(`${base(reference, accessKey)}/crypto-txid`, {
      json: { paymentId, txid: txid.trim() },
    }),
  ).catch(asActionError);
  // Anything the backend hasn't taught this client about is still in flight.
  return data.verificationStatus === 'confirmed' || data.verificationStatus === 'needs_review'
    ? data.verificationStatus
    : 'checking';
}
