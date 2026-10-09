import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { isAllowedApiPath, buildBackendUrl, cacheTtlFor } from '../src/proxy';
import worker from '../src/index';

// NOTE (deviation from the brief — see task-8-report.md "RED phase / tooling
// gap"): the brief's tests use `fetchMock` imported from 'cloudflare:test'
// (undici's MockAgent, wired via `fetchMock.activate()` /
// `disableNetConnect()` / `fetchMock.get(...).intercept(...)`). That export
// does not exist in the installed @cloudflare/vitest-pool-workers@0.22.0 —
// confirmed against the package's own ambient .d.ts (no `fetchMock` export)
// and against Cloudflare's Vitest 3→4 migration guide, which states
// `fetchMock` was removed and the replacement is to "mock globalThis.fetch
// directly or use ecosystem libraries such as MSW". 0.22.0 is the latest
// published version, so this isn't a version-pinning fix. We mock
// `globalThis.fetch` directly instead; the worker-under-test runs in the
// same isolate as the test file (per vitest-pool-workers' own docs on
// `SELF`), so the global mock reaches `proxy.ts`'s `fetch(...)` call.
// Behaviour under test is unchanged: allowlist, backend URL + query
// composition, Authorization/X-Forwarded-For forwarding, Cookie stripping,
// edge cache hit/miss, and 502 on backend failure.

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init ?? {}));
  globalThis.fetch = spy as unknown as typeof fetch;
  return spy;
}

describe('allowlist', () => {
  it.each(['storefront/settings', 'storefront/cart', 'storefront/tracking', 'catalog', 'catalog/products/4', 'verify/x/y'])('allows %s', (p) => {
    expect(isAllowedApiPath(p)).toBe(true);
  });
  it.each(['', 'products', 'users', 'bot-settings', 'storefront-settings', 'catalogue', 'auth/login', 'wholesale/catalog', '../products', 'orders/ABC/key', 'orders/ABC/key/payment-options'])('blocks %s', (p) => {
    expect(isAllowedApiPath(p)).toBe(false);
  });
  it('allows the page-set route', () => {
    expect(isAllowedApiPath('storefront/pages/menu')).toBe(true);
  });
});

describe('buildBackendUrl', () => {
  it('joins under api/v1/public and keeps the query', () => {
    expect(buildBackendUrl('https://b.test/', 'catalog/products/4', '?x=1').toString()).toBe('https://b.test/api/v1/public/catalog/products/4?x=1');
  });
});

describe('cacheTtlFor', () => {
  it('caches settings 30s, catalog 60s, nothing else', () => {
    expect(cacheTtlFor('storefront/settings')).toBe(30);
    expect(cacheTtlFor('catalog')).toBe(60);
    expect(cacheTtlFor('catalog/products/9')).toBe(60);
    expect(cacheTtlFor('storefront/cart')).toBe(0);
  });
  it('caches the published page set 30s per layout and nothing next to it', () => {
    expect(cacheTtlFor('storefront/pages/storefront')).toBe(30);
    expect(cacheTtlFor('storefront/pages/menu')).toBe(30);
    expect(cacheTtlFor('storefront/pages/webapp')).toBe(30);
    expect(cacheTtlFor('storefront/pages/other')).toBe(0);
    expect(cacheTtlFor('storefront/pages/menu/extra')).toBe(0);
  });
});

describe('fetch /api/*', () => {
  it('404s a blocked path without contacting the backend', async () => {
    const fetchSpy = stubFetch(() => {
      throw new Error('unexpected outbound fetch for a blocked path');
    });
    const res = await worker.fetch(new Request('https://shop.test/api/products'), env, createExecutionContext());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, data: null, error: 'Not found' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('forwards an allowed path with Authorization + X-Forwarded-For and strips cookies', async () => {
    const fetchSpy = stubFetch((url, init) => {
      expect(url).toBe('https://backend.test/api/v1/public/storefront/cart');
      expect(init.method).toBe('GET');
      const h = new Headers(init.headers as HeadersInit);
      return new Response(
        JSON.stringify({ auth: h.get('authorization'), xff: h.get('x-forwarded-for'), cookie: h.get('cookie') }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const res = await worker.fetch(
      new Request('https://shop.test/api/storefront/cart', {
        headers: { Authorization: 'Bearer tok', Cookie: 'a=b', 'CF-Connecting-IP': '203.0.113.9' },
      }),
      env,
      createExecutionContext(),
    );
    expect(await res.json()).toEqual({ auth: 'Bearer tok', xff: '203.0.113.9', cookie: null });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('serves settings from cache on the second hit', async () => {
    const fetchSpy = stubFetch((url) => {
      expect(url).toBe('https://backend.test/api/v1/public/storefront/settings');
      return new Response('{"success":true,"data":{"enabled":true}}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const ctx = createExecutionContext();
    const a = await worker.fetch(new Request('https://shop.test/api/storefront/settings'), env, ctx);
    await waitOnExecutionContext(ctx);
    const b = await worker.fetch(new Request('https://shop.test/api/storefront/settings'), env, createExecutionContext());
    expect(a.headers.get('X-SF-Cache')).toBe('MISS');
    expect(b.headers.get('X-SF-Cache')).toBe('HIT');
    expect(await b.json()).toEqual({ success: true, data: { enabled: true } });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns 502 when the backend is unreachable', async () => {
    const fetchSpy = stubFetch((url) => {
      expect(url).toBe('https://backend.test/api/v1/public/catalog?nocache=1');
      throw new Error('boom');
    });
    const res = await worker.fetch(new Request('https://shop.test/api/catalog?nocache=1'), env, createExecutionContext());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ success: false, data: null, error: 'Backend unavailable' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('strips all inbound X-Forwarded-* headers and sets its own', async () => {
    const fetchSpy = stubFetch((url, init) => {
      expect(url).toBe('https://backend.test/api/v1/public/storefront/cart');
      const h = new Headers(init.headers as HeadersInit);
      return new Response(
        JSON.stringify({
          xfHost: h.get('x-forwarded-host'),
          xfPort: h.get('x-forwarded-port'),
          xff: h.get('x-forwarded-for'),
          xfProto: h.get('x-forwarded-proto'),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const res = await worker.fetch(
      new Request('https://shop.test/api/storefront/cart', {
        headers: { 'X-Forwarded-Host': 'evil', 'X-Forwarded-Port': '1', 'CF-Connecting-IP': '203.0.113.9' },
      }),
      env,
      createExecutionContext(),
    );
    // Inbound X-Forwarded-Host/Port never reach the backend; only the
    // proxy's own X-Forwarded-For (from CF-Connecting-IP) and
    // X-Forwarded-Proto: https do.
    expect(await res.json()).toEqual({ xfHost: null, xfPort: null, xff: '203.0.113.9', xfProto: 'https' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // The Worker never parses or projects a JSON body — it streams `upstream.body`
  // straight through (see `proxyApi`) — so there is no per-field allowlist for a
  // new backend field (order-quantity limits: `minOrderQuantity`, `maxOrderQuantity`,
  // `belowMin`, `aboveMax`) to be dropped from. This pins that contract for both
  // the catalog and the cart, so a future rewrite that DOES introduce a projection
  // is forced to carry these fields through.
  it('passes catalog and cart fields it has never heard of straight through unchanged', async () => {
    const catalogBody = JSON.stringify({
      success: true,
      data: {
        products: [{ id: 1, price: 10, minOrderQuantity: 10, maxOrderQuantity: 50 }],
        categories: [],
      },
    });
    const cartBody = JSON.stringify({
      success: true,
      data: {
        items: [
          {
            productId: 1, quantity: 4, belowMin: true, aboveMax: false,
            minOrderQuantity: 10, maxOrderQuantity: 50,
          },
        ],
        subtotal: 40,
        itemCount: 4,
      },
    });

    stubFetch((url) =>
      url.includes('/catalog')
        ? new Response(catalogBody, { status: 200, headers: { 'content-type': 'application/json' } })
        : new Response(cartBody, { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    // A distinct query string keeps this off the plain `/api/catalog` cache key
    // that a later test in this file relies on being a fresh MISS.
    const catalogRes = await worker.fetch(
      new Request('https://shop.test/api/catalog?probe=quantity-limits'),
      env,
      createExecutionContext(),
    );
    expect(await catalogRes.text()).toBe(catalogBody);

    const cartRes = await worker.fetch(
      new Request('https://shop.test/api/storefront/cart'),
      env,
      createExecutionContext(),
    );
    expect(await cartRes.text()).toBe(cartBody);
  });

  it('does not cache a non-200 upstream response on a cacheable path', async () => {
    const fetchSpy = stubFetch((url) => {
      expect(url).toBe('https://backend.test/api/v1/public/catalog');
      return new Response('{"success":false,"data":null,"error":"down"}', { status: 503, headers: { 'content-type': 'application/json' } });
    });
    const ctx = createExecutionContext();
    const first = await worker.fetch(new Request('https://shop.test/api/catalog'), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(first.status).toBe(503);
    expect(first.headers.get('X-SF-Cache')).toBe('BYPASS');
    expect(first.headers.get('cache-control')).toBe('no-store');

    // A following request must still hit upstream — the 503 was never cached.
    const second = await worker.fetch(new Request('https://shop.test/api/catalog'), env, createExecutionContext());
    expect(second.status).toBe(503);
    expect(second.headers.get('X-SF-Cache')).toBe('BYPASS');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('forwards a POST body with duplex half and does not cache the response', async () => {
    const fetchSpy = stubFetch(async (url, init) => {
      expect(url).toBe('https://backend.test/api/v1/public/storefront/cart');
      expect(init.method).toBe('POST');
      expect((init as RequestInit & { duplex?: string }).duplex).toBe('half');
      const h = new Headers(init.headers as HeadersInit);
      expect(h.get('content-type')).toBe('application/json');
      const bodyText = await new Response(init.body as BodyInit).text();
      expect(bodyText).toBe('{"productId":1,"qty":2}');
      return new Response('{"success":true,"data":{"ok":true}}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const res = await worker.fetch(
      new Request('https://shop.test/api/storefront/cart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId: 1, qty: 2 }),
      }),
      env,
      createExecutionContext(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('X-SF-Cache')).toBe('BYPASS');
    expect(await res.json()).toEqual({ success: true, data: { ok: true } });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('bypasses the cache for an authenticated GET and does not populate it for later anonymous requests', async () => {
    // A distinct cacheable path (catalog/products/77) that no other test in
    // this file touches — `caches.default` persists across tests within the
    // file (it is not reset per-test), so reusing e.g. storefront/settings
    // here would collide with the "serves settings from cache" test's
    // already-populated entry and produce a false HIT.
    const fetchSpy = stubFetch((url, init) => {
      expect(url).toBe('https://backend.test/api/v1/public/catalog/products/77');
      const h = new Headers(init.headers as HeadersInit);
      return new Response(
        JSON.stringify({ success: true, data: { auth: h.get('authorization') } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const ctx = createExecutionContext();
    const authed = await worker.fetch(
      new Request('https://shop.test/api/catalog/products/77', { headers: { Authorization: 'Bearer tok' } }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(authed.headers.get('X-SF-Cache')).toBe('BYPASS');
    expect(authed.headers.get('cache-control')).toBe('no-store');

    // The authenticated response must not have populated the shared cache:
    // a later anonymous GET is still a MISS (upstream hit again), not a HIT.
    const anon = await worker.fetch(new Request('https://shop.test/api/catalog/products/77'), env, createExecutionContext());
    expect(anon.headers.get('X-SF-Cache')).toBe('MISS');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

// The personalised catalog is per-customer (group rules + group prices): it
// must be proxied, and must never land in the Worker's edge cache. The
// storefront/ prefix already allows it and no CACHE_RULES entry matches it —
// these pin that so a future cache rule can't silently start sharing it.
describe('personalised catalog proxying', () => {
  it('allows the storefront catalog routes', () => {
    expect(isAllowedApiPath('storefront/catalog')).toBe(true);
    expect(isAllowedApiPath('storefront/catalog/products/42')).toBe(true);
  });

  it('never edge-caches them', () => {
    expect(cacheTtlFor('storefront/catalog')).toBe(0);
    expect(cacheTtlFor('storefront/catalog/products/42')).toBe(0);
  });

  it('still edge-caches the anonymous catalog', () => {
    expect(cacheTtlFor('catalog')).toBe(60);
    expect(cacheTtlFor('catalog/products/42')).toBe(60);
  });
});

describe('warehouse choice (?warehouse=<id>)', () => {
  const ok = (body: unknown) => new Response(JSON.stringify({ success: true, data: body }), { status: 200, headers: { 'content-type': 'application/json' } });

  it('matches the catalogue cache rules on the path alone, whatever the query', () => {
    // cacheTtlFor is given the path without its query (proxyApi passes url.pathname), and the rules are anchored.
    expect(cacheTtlFor('catalog')).toBe(60);
    expect(cacheTtlFor('catalog/products/42')).toBe(60);
    expect(cacheTtlFor('catalog?warehouse=2')).toBe(0);
  });

  it('keys each warehouse separately from the default and from each other', async () => {
    const fetchSpy = stubFetch((url) => ok({ url }));
    const get = async (qs: string) => {
      const ctx = createExecutionContext();
      const res = await worker.fetch(new Request(`https://shop.test/api/catalog${qs}`), env, ctx);
      await waitOnExecutionContext(ctx);
      return res;
    };
    const base = await get('');
    const two = await get('?warehouse=2');
    const three = await get('?warehouse=3');
    expect([base, two, three].map((r) => r.headers.get('X-SF-Cache'))).toEqual(['MISS', 'MISS', 'MISS']);
    expect(fetchSpy.mock.calls.map((c) => String(c[0]))).toEqual([
      'https://backend.test/api/v1/public/catalog',
      'https://backend.test/api/v1/public/catalog?warehouse=2',
      'https://backend.test/api/v1/public/catalog?warehouse=3',
    ]);
    // Each is now served from its own entry, with its own body.
    const [b2, t2, h2] = await Promise.all([get(''), get('?warehouse=2'), get('?warehouse=3')]);
    expect([b2, t2, h2].map((r) => r.headers.get('X-SF-Cache'))).toEqual(['HIT', 'HIT', 'HIT']);
    expect(await t2.json()).toEqual({ success: true, data: { url: 'https://backend.test/api/v1/public/catalog?warehouse=2' } });
    expect(await b2.json()).toEqual({ success: true, data: { url: 'https://backend.test/api/v1/public/catalog' } });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('keys a product read per warehouse too', async () => {
    const fetchSpy = stubFetch((url) => ok({ url }));
    for (const qs of ['', '?warehouse=2', '?warehouse=2']) {
      const ctx = createExecutionContext();
      await worker.fetch(new Request(`https://shop.test/api/catalog/products/7${qs}`), env, ctx);
      await waitOnExecutionContext(ctx);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('caches the warehouse list for anonymous visitors only on a 200, never a 401', async () => {
    expect(cacheTtlFor('storefront/warehouses')).toBe(30);
    let status = 401;
    const fetchSpy = stubFetch(() => (status === 200
      ? ok({ warehouses: [] })
      : new Response('{"success":false,"data":null,"error":"LOGIN_REQUIRED"}', { status: 401, headers: { 'content-type': 'application/json' } })));
    const ask = async (headers: HeadersInit = {}) => {
      const ctx = createExecutionContext();
      const res = await worker.fetch(new Request('https://shop.test/api/storefront/warehouses', { headers }), env, ctx);
      await waitOnExecutionContext(ctx);
      return res;
    };
    const refused = await ask();
    expect(refused.status).toBe(401);
    expect(refused.headers.get('X-SF-Cache')).toBe('BYPASS');
    expect(refused.headers.get('cache-control')).toBe('no-store');
    // The shop turns public: the earlier 401 must not be what the next visitor gets.
    status = 200;
    const first = await ask();
    expect(first.status).toBe(200);
    expect(first.headers.get('X-SF-Cache')).toBe('MISS');
    expect((await ask()).headers.get('X-SF-Cache')).toBe('HIT');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // A signed-in read is never served from, or written to, the anonymous entry.
    const signedIn = await ask({ authorization: 'Bearer tok' });
    expect(signedIn.headers.get('X-SF-Cache')).toBe('BYPASS');
  });
});
