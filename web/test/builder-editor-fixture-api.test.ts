import { describe, expect, it, vi } from 'vitest';
import { createFixtureInterceptor } from '@/builder/editor/fixture-api.ts';
import { FIXTURE_ACCESS_KEY, FIXTURE_ORDER_REF } from '@/builder/editor/fixtures.ts';
import type { PreviewAs } from '@/builder/mode.ts';

const ORIGIN = 'http://localhost:3000';
const req = (path: string, method = 'GET') => new Request(`${ORIGIN}/api/${path}`, { method, headers: { Authorization: 'Bearer sf-builder-fixture-token' } });

async function call(as: PreviewAs, path: string, method = 'GET') {
  const notify = vi.fn();
  const request = req(path, method);
  const result = await createFixtureInterceptor(() => as, notify)(request);
  return { result, request, notify };
}
const body = async (r: unknown) => (await (r as Response).json()) as { success: boolean; data: unknown; error: string | null; meta?: unknown };

const IN_ORDERS: PreviewAs = { session: 'signed-in-orders', cart: 'items' };
const IN_EMPTY: PreviewAs = { session: 'signed-in', cart: 'empty' };
const OUT: PreviewAs = { session: 'signed-out', cart: 'empty' };

/** ky retries GETs on these; a fixture answer with one of them would be asked for twice. */
const RETRIED = [408, 413, 429, 500, 502, 503, 504];

describe('fixture interceptor', () => {
  it('lets settings and the public catalogue through with no token', async () => {
    for (const path of ['storefront/settings', 'catalog', 'catalog/products/101']) {
      const { result, request } = await call(IN_ORDERS, path);
      expect(result).toBeUndefined();
      expect(request.headers.get('authorization')).toBeNull();
    }
  });

  it('rewrites the personalised catalogue to the public one', async () => {
    const { result } = await call(IN_ORDERS, 'storefront/catalog/products/7');
    expect(result).toBeInstanceOf(Request);
    expect(new URL((result as Request).url).pathname).toBe('/api/catalog/products/7');
    expect((result as Request).headers.get('authorization')).toBeNull();
  });

  it('refuses a personalised catalogue path whose public twin is not a live read', async () => {
    const { result, notify } = await call(IN_ORDERS, 'storefront/catalog/secret/7');
    expect(result).toMatchObject({ status: 400 });
    expect(notify).toHaveBeenCalledTimes(1);
    expect((await call(IN_ORDERS, 'storefront/catalog')).result).toBeInstanceOf(Request);
  });

  it('answers a malformed order reference with 404 instead of throwing', async () => {
    expect((await call(IN_ORDERS, 'storefront/orders/%E0%A4%A')).result).toMatchObject({ status: 404 });
  });

  it('keeps the original request\'s signal and method on a rewrite', async () => {
    const controller = new AbortController();
    const request = new Request(`${ORIGIN}/api/storefront/catalog`, { signal: controller.signal, headers: { Authorization: 'Bearer x' } });
    const result = (await createFixtureInterceptor(() => IN_ORDERS, vi.fn())(request)) as Request;
    expect(result.method).toBe('GET');
    controller.abort();
    expect(result.signal.aborted).toBe(true);
  });

  it('is idempotent: running it again on its own rewrite (a ky GET retry) passes it through tokenless', async () => {
    const intercept = createFixtureInterceptor(() => IN_ORDERS, vi.fn());
    const first = (await intercept(req('storefront/catalog/products/7'))) as Request;
    first.headers.set('Authorization', 'Bearer sf-builder-fixture-token'); // the token hook runs again on retry
    expect(await intercept(first)).toBeUndefined();
    expect(first.headers.get('authorization')).toBeNull();
    // and a fixture answer is the same answer twice
    const a = await body(await intercept(req('storefront/profile')));
    const b = await body(await intercept(req('storefront/profile')));
    expect(a).toEqual(b);
  });

  it('never answers a GET with a status ky would retry', async () => {
    const paths = ['storefront/profile', 'storefront/cart', 'storefront/orders', `storefront/orders/${FIXTURE_ORDER_REF}`, 'storefront/orders/X',
      `orders/${FIXTURE_ORDER_REF}/${FIXTURE_ACCESS_KEY}`, 'orders/A/B', 'orders/A/B/payment-options', 'verify/A/1', 'storefront/profile/redeem-options', 'nope'];
    for (const as of [IN_ORDERS, IN_EMPTY, OUT]) {
      for (const path of paths) {
        const { result } = await call(as, path);
        if (result instanceof Response) expect(RETRIED).not.toContain(result.status);
      }
    }
  });

  it('answers session routes from fixtures when signed in, 401 when signed out', async () => {
    expect((await body((await call(IN_ORDERS, 'storefront/profile')).result)).data).toMatchObject({ nickname: 'Morgan', totalOrders: 2 });
    expect((await call(OUT, 'storefront/profile')).result).toMatchObject({ status: 401 });
    expect((await body((await call(IN_ORDERS, 'storefront/cart')).result)).data).toMatchObject({ itemCount: 4 });
    expect((await body((await call(IN_EMPTY, 'storefront/cart')).result)).data).toMatchObject({ itemCount: 0 });
  });

  it('lists fixture orders only for "has orders", with page meta', async () => {
    const withOrders = await body((await call(IN_ORDERS, 'storefront/orders?page=1&limit=10')).result);
    expect(withOrders.data).toHaveLength(2);
    expect(withOrders.meta).toMatchObject({ page: 1, hasNextPage: false });
    expect((await body((await call(IN_EMPTY, 'storefront/orders')).result)).data).toEqual([]);
    expect((await body((await call(IN_ORDERS, `storefront/orders/${FIXTURE_ORDER_REF}`)).result)).data).toMatchObject({ reference: FIXTURE_ORDER_REF });
    expect((await call(IN_EMPTY, `storefront/orders/${FIXTURE_ORDER_REF}`)).result).toMatchObject({ status: 404 });
  });

  it('serves the fixture order-status link and nothing else under orders/', async () => {
    expect((await body((await call(OUT, `orders/${FIXTURE_ORDER_REF}/${FIXTURE_ACCESS_KEY}`)).result)).data).toMatchObject({ status: 'shipped' });
    expect((await call(OUT, 'orders/REAL1/KEY')).result).toMatchObject({ status: 404 });
  });

  it('quotes from fixtures without a toast', async () => {
    const { result, notify } = await call(IN_ORDERS, 'storefront/checkout/quote', 'POST');
    expect((await body(result)).data).toMatchObject({ grandTotal: 90.45 });
    expect(notify).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', 'storefront/checkout'],
    ['POST', 'storefront/checkout/guest'],
    ['PUT', 'storefront/cart'],
    ['POST', 'storefront/auth/whatsapp/start'],
    ['POST', 'storefront/auth/logout'],
    ['POST', 'storefront/profile/redeem'],
    ['POST', `orders/${FIXTURE_ORDER_REF}/${FIXTURE_ACCESS_KEY}/payment-method`],
    ['POST', 'storefront/tracking'],
    ['GET', 'verify/ABC/123'],
    ['DELETE', 'storefront/anything-new'],
  ])('refuses %s %s with a toast and never lets it out', async (method, path) => {
    const { result, notify } = await call(IN_ORDERS, path, method);
    expect(result).toMatchObject({ status: 400 });
    expect((await body(result)).error).toBe('Preview only — nothing was sent.');
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
