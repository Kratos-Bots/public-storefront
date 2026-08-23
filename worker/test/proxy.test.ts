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
  it.each(['storefront/settings', 'storefront/cart', 'storefront/tracking', 'catalog', 'catalog/products/4', 'orders/ABC/key', 'orders/ABC/key/payment-options', 'verify/x/y'])('allows %s', (p) => {
    expect(isAllowedApiPath(p)).toBe(true);
  });
  it.each(['', 'products', 'users', 'bot-settings', 'storefront-settings', 'catalogue', 'auth/login', 'wholesale/catalog', '../products'])('blocks %s', (p) => {
    expect(isAllowedApiPath(p)).toBe(false);
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
