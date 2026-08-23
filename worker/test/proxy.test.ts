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
});
