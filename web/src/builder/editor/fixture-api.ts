import type { ApiInterceptor } from '@/api/client.ts';
import type { PreviewAs } from '@/builder/mode.ts';
import { notifyPreviewOnly, PREVIEW_ONLY_MESSAGE } from '@/builder/editor/fixture-mode.ts';
import {
  FIXTURE_ORDER_DETAIL, FIXTURE_ORDER_REF, FIXTURE_ORDERS, FIXTURE_PUBLIC_ORDER, FIXTURE_QUOTE,
  FIXTURE_PRODUCT, FIXTURE_REDEEM, fixtureProfile, fixtureServerCart,
} from '@/builder/editor/fixtures.ts';

/**
 * Only 200 / 400 / 401 / 404 are ever answered: ky retries GETs on 408, 413, 429 and 5xx, and a
 * retried fixture would just run this interceptor again for the same answer.
 */
function respond(status: 200 | 400 | 401 | 404, dataOrError: unknown, meta?: unknown): Response {
  const envelope = status < 400
    ? { success: true, data: dataOrError, error: null, ...(meta === undefined ? {} : { meta }) }
    : { success: false, data: null, error: dataOrError };
  return new Response(JSON.stringify(envelope), { status, headers: { 'content-type': 'application/json' } });
}

/** A malformed escape is just an unknown reference (404), never a throw inside beforeRequest. */
function safeDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** Live, shopper-independent reads the editor must show for real (spec §6). */
const LIVE_GET = /^(?:storefront\/settings|catalog|catalog\/products\/\d+|storefront\/pages\/[a-z]+)$/;
const ACCOUNT_ORDER = /^storefront\/orders\/([^/]+)$/;
/** What the account order page reads to show its payment section: the payment view and the method list. */
const ORDER_PAYMENT = /^storefront\/orders\/([^/]+)\/(payment|payment-options)$/;
/** The "Preview with" sample (spec §11): an empty catalogue still has a product to show. */
const FIXTURE_PRODUCT_PATH = `catalog/products/${FIXTURE_PRODUCT.id}`;

/**
 * The api client's interceptor while the editor is open. No token ever leaves the frame; no
 * mutation or lookup ever reaches the backend. Unknown routes are refused, not passed through.
 *
 * Idempotent by construction: ky re-runs every beforeRequest hook on a GET retry, against the
 * request this returned the first time (a rewrite lands on a LIVE_GET path, so it passes).
 */
export function createFixtureInterceptor(getPreviewAs: () => PreviewAs, notify: () => void = notifyPreviewOnly): ApiInterceptor {
  return (request) => {
    request.headers.delete('Authorization');
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\//, '');
    const method = request.method.toUpperCase();
    const as = getPreviewAs();
    const signedIn = as.session !== 'signed-out';
    const refuse = () => {
      notify();
      return respond(400, PREVIEW_ONLY_MESSAGE);
    };

    if (method === 'GET' && (path === FIXTURE_PRODUCT_PATH || path === `storefront/${FIXTURE_PRODUCT_PATH}`)) return respond(200, FIXTURE_PRODUCT);
    if (method === 'GET' && (path === 'storefront/catalog' || path.startsWith('storefront/catalog/'))) {
      const publicPath = path.slice('storefront/'.length);
      // Only a rewrite that lands on a live read (the same check a ky retry of it will meet).
      if (!LIVE_GET.test(publicPath)) return refuse();
      const rewritten = new URL(request.url);
      rewritten.pathname = `/api/${publicPath}`;
      // Keeps method, headers (already tokenless), signal and everything else of the original.
      return new Request(rewritten, request);
    }
    if (method === 'GET' && LIVE_GET.test(path)) return undefined;

    if (method === 'POST' && (path === 'storefront/checkout/quote' || path === 'storefront/checkout/guest/quote')) {
      return respond(200, FIXTURE_QUOTE);
    }

    if (method === 'GET') {
      if (path === 'storefront/cart') return signedIn ? respond(200, fixtureServerCart(as)) : respond(401, 'Unauthorized');
      if (path === 'storefront/profile') return signedIn ? respond(200, fixtureProfile(as)) : respond(401, 'Unauthorized');
      if (path === 'storefront/profile/redeem-options') return signedIn ? respond(200, FIXTURE_REDEEM) : respond(401, 'Unauthorized');
      if (path === 'storefront/orders') {
        if (!signedIn) return respond(401, 'Unauthorized');
        const orders = as.session === 'signed-in-orders' ? FIXTURE_ORDERS : [];
        return respond(200, orders, { page: 1, limit: 10, totalItems: orders.length, totalPages: 1, hasNextPage: false, hasPrevPage: false });
      }
      const accountOrder = ACCOUNT_ORDER.exec(path);
      if (accountOrder) {
        if (!signedIn) return respond(401, 'Unauthorized');
        return as.session === 'signed-in-orders' && safeDecode(accountOrder[1]!) === FIXTURE_ORDER_REF
          ? respond(200, FIXTURE_ORDER_DETAIL)
          : respond(404, 'Order not found');
      }
      const orderPayment = ORDER_PAYMENT.exec(path);
      if (orderPayment) {
        if (!signedIn) return respond(401, 'Unauthorized');
        if (as.session !== 'signed-in-orders' || safeDecode(orderPayment[1]!) !== FIXTURE_ORDER_REF) return respond(404, 'Order not found');
        return respond(200, orderPayment[2] === 'payment' ? FIXTURE_PUBLIC_ORDER : FIXTURE_QUOTE.paymentMethods);
      }
      if (/^storefront\/auth\/attempts\/[^/]+$/.test(path)) return respond(200, { status: 'pending' });
    }

    return refuse();
  };
}
