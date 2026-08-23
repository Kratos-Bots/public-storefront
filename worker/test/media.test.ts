import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mediaTarget } from '../src/media';
import worker from '../src/index';

// NOTE (deviation from the brief — same tooling gap as worker/test/proxy.test.ts,
// see task-8-report.md "RED phase / tooling gap"): `fetchMock` from
// 'cloudflare:test' does not exist in the installed
// @cloudflare/vitest-pool-workers@0.22.0 (removed in the Vitest 3→4
// migration; Cloudflare's own migration guide says to mock `globalThis.fetch`
// directly). We follow proxy.test.ts's established pattern here instead —
// same stubFetch helper shape, same beforeEach/afterEach restore. Assertions
// are equivalent to what the brief's fetchMock-based tests checked.

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

describe('mediaTarget', () => {
  it('maps product images', () => {
    expect(mediaTarget('/media/products/12/image', '?variant=thumbnail', 'https://b.test/')?.toString())
      .toBe('https://b.test/api/v1/products/12/image?variant=thumbnail');
  });
  it('maps branding', () => {
    expect(mediaTarget('/media/storefront-settings/branding/logo', '?v=3', 'https://b.test/')?.toString())
      .toBe('https://b.test/api/v1/storefront-settings/branding/logo?v=3');
    expect(mediaTarget('/media/settings/branding/favicon', '', 'https://b.test/')?.toString())
      .toBe('https://b.test/api/v1/settings/branding/favicon');
  });
  it('rejects anything else', () => {
    expect(mediaTarget('/media/products/12', '', 'https://b.test/')).toBeNull();
    expect(mediaTarget('/media/users/1/avatar', '', 'https://b.test/')).toBeNull();
    expect(mediaTarget('/media/../api/v1/users', '', 'https://b.test/')).toBeNull();
  });
});

describe('fetch /media/*', () => {
  it('proxies with a 1-day cache header and no cookies', async () => {
    const fetchSpy = stubFetch((url) => {
      expect(url).toBe('https://backend.test/api/v1/products/5/image?variant=web');
      return new Response('PNGDATA', {
        status: 200,
        headers: { 'content-type': 'image/png', 'set-cookie': 'x=1' },
      });
    });
    const res = await worker.fetch(new Request('https://shop.test/media/products/5/image?variant=web'), env, createExecutionContext());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('404s unknown media paths', async () => {
    const fetchSpy = stubFetch(() => {
      throw new Error('unexpected outbound fetch for an unmapped media path');
    });
    const res = await worker.fetch(new Request('https://shop.test/media/whatever'), env, createExecutionContext());
    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('405s non-GET', async () => {
    const fetchSpy = stubFetch(() => {
      throw new Error('unexpected outbound fetch for a non-GET/HEAD request');
    });
    const res = await worker.fetch(
      new Request('https://shop.test/media/products/5/image', { method: 'POST' }),
      env,
      createExecutionContext(),
    );
    expect(res.status).toBe(405);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('serves a cached media response on the second request without hitting upstream', async () => {
    // Distinct product id (99) from every other test in this file — caches.default
    // is not reset between tests within a file (see proxy.test.ts's cache tests),
    // so reusing another test's path could produce a false HIT.
    const fetchSpy = stubFetch((url) => {
      expect(url).toBe('https://backend.test/api/v1/products/99/image?variant=web');
      return new Response('PNGDATA2', { status: 200, headers: { 'content-type': 'image/png' } });
    });
    const ctx = createExecutionContext();
    const first = await worker.fetch(new Request('https://shop.test/media/products/99/image?variant=web'), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(first.status).toBe(200);
    expect(await first.text()).toBe('PNGDATA2');

    const second = await worker.fetch(new Request('https://shop.test/media/products/99/image?variant=web'), env, createExecutionContext());
    expect(second.status).toBe(200);
    expect(await second.text()).toBe('PNGDATA2');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('maps a 404 upstream response to a 404', async () => {
    const fetchSpy = stubFetch((url) => {
      expect(url).toBe('https://backend.test/api/v1/products/404/image');
      return new Response('nope', { status: 404 });
    });
    const res = await worker.fetch(new Request('https://shop.test/media/products/404/image'), env, createExecutionContext());
    expect(res.status).toBe(404);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not cache a 404 upstream response — a following request hits upstream again', async () => {
    // Distinct product id (62) from the other 404 test (404) so this test's
    // assertions about call count aren't polluted by that test's cache state
    // (there is none to pollute here, but keeping ids unique stays consistent
    // with every other test in this file).
    const fetchSpy = stubFetch((url) => {
      expect(url).toBe('https://backend.test/api/v1/products/62/image');
      return new Response('nope', { status: 404 });
    });
    const ctx = createExecutionContext();
    const first = await worker.fetch(new Request('https://shop.test/media/products/62/image'), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(first.status).toBe(404);

    const second = await worker.fetch(new Request('https://shop.test/media/products/62/image'), env, createExecutionContext());
    expect(second.status).toBe(404);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('HEAD returns headers with an empty body, and warms the cache for a following GET', async () => {
    const fetchSpy = stubFetch((url, init) => {
      expect(url).toBe('https://backend.test/api/v1/products/61/image');
      // proxyMedia always forwards GET upstream, even for a HEAD request.
      expect(init.method).toBe('GET');
      return new Response('PNGDATA61', { status: 200, headers: { 'content-type': 'image/png' } });
    });
    const ctx = createExecutionContext();
    const head = await worker.fetch(
      new Request('https://shop.test/media/products/61/image', { method: 'HEAD' }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(head.status).toBe(200);
    expect(head.headers.get('content-type')).toBe('image/png');
    expect(head.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await head.text()).toBe('');

    // The HEAD populated the cache under the same GET-normalized key, so the
    // following GET is served from cache without a second upstream call.
    const get = await worker.fetch(new Request('https://shop.test/media/products/61/image'), env, createExecutionContext());
    expect(get.status).toBe(200);
    expect(await get.text()).toBe('PNGDATA61');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('maps a non-404 upstream error to 502', async () => {
    const fetchSpy = stubFetch((url) => {
      expect(url).toBe('https://backend.test/api/v1/products/500/image');
      return new Response('boom', { status: 500 });
    });
    const res = await worker.fetch(new Request('https://shop.test/media/products/500/image'), env, createExecutionContext());
    expect(res.status).toBe(502);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns 502 when the upstream fetch throws', async () => {
    const fetchSpy = stubFetch(() => {
      throw new Error('network down');
    });
    const res = await worker.fetch(new Request('https://shop.test/media/products/501/image'), env, createExecutionContext());
    expect(res.status).toBe(502);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
