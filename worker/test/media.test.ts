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
  it('maps storefront-page media keys', () => {
    const key = 'a'.repeat(32) + '.webp';
    expect(mediaTarget(`/media/storefront-pages/media/${key}`, '', 'https://b.test/')?.toString())
      .toBe(`https://b.test/api/v1/storefront-pages/media/${key}`);
  });
  it('rejects malformed storefront-page media keys', () => {
    for (const bad of ['A'.repeat(32) + '.png', 'a'.repeat(31) + '.png', 'a'.repeat(32) + '.svg', 'a'.repeat(32) + '.jpeg', '../x.png']) {
      expect(mediaTarget(`/media/storefront-pages/media/${bad}`, '', 'https://b.test/'), bad).toBeNull();
    }
  });
});

describe('mediaTarget · COA files', () => {
  const key = 'ab12'.repeat(8);
  it('maps a COA to the backend file route', () => {
    expect(mediaTarget(`/media/coas/17/${key}`, '', 'https://b.test/')?.toString())
      .toBe(`https://b.test/api/v1/public/catalog/coas/17/${key}/file`);
  });
  it('never forwards a query string upstream', () => {
    expect(mediaTarget(`/media/coas/17/${key}`, '?token=x&download=1', 'https://b.test/')?.toString())
      .toBe(`https://b.test/api/v1/public/catalog/coas/17/${key}/file`);
  });
  it('rejects malformed ids and keys', () => {
    for (const bad of [`/media/coas/x/${key}`, `/media/coas/17/${key.toUpperCase()}`, `/media/coas/17/${key.slice(1)}`, `/media/coas/17/${key}0`,
      `/media/coas/17/${key}/file`, '/media/coas/17', `/media/coas/17/${'g'.repeat(32)}`, `/media/coas/../${key}`]) {
      expect(mediaTarget(bad, '', 'https://b.test/'), bad).toBeNull();
    }
  });
});

describe('fetch /media/coas/*', () => {
  const key = 'cd34'.repeat(8);
  const pdf = () => new Response('%PDF-fake', {
    status: 200,
    headers: { 'content-type': 'application/pdf', 'content-disposition': 'inline; filename="coa-31.pdf"', 'cache-control': 'private, max-age=300', 'set-cookie': 'x=1' },
  });

  it('passes the backend headers through and never lets the edge cache keep the file', async () => {
    const fetchSpy = stubFetch((url) => {
      expect(url).toBe(`https://backend.test/api/v1/public/catalog/coas/31/${key}/file`);
      return pdf();
    });
    const ctx = createExecutionContext();
    const first = await worker.fetch(new Request(`https://shop.test/media/coas/31/${key}`), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe('application/pdf');
    expect(first.headers.get('content-disposition')).toBe('inline; filename="coa-31.pdf"');
    expect(first.headers.get('cache-control')).toBe('private, max-age=300');
    expect(first.headers.get('x-content-type-options')).toBe('nosniff');
    expect(first.headers.get('set-cookie')).toBeNull();
    expect(await first.text()).toBe('%PDF-fake');

    // Not stored at the edge, so a second request goes upstream again.
    const second = await worker.fetch(new Request(`https://shop.test/media/coas/31/${key}`), env, createExecutionContext());
    expect(second.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(await caches.default.match(new Request(`https://backend.test/api/v1/public/catalog/coas/31/${key}/file`))).toBeUndefined();
  });

  it('sandboxes the response and drops the query string', async () => {
    const fetchSpy = stubFetch(() => pdf());
    const res = await worker.fetch(new Request(`https://shop.test/media/coas/31/${key}?x=1`), env, createExecutionContext());
    expect(res.headers.get('content-security-policy')).toBe('sandbox');
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(`https://backend.test/api/v1/public/catalog/coas/31/${key}/file`);
    await res.body?.cancel();
  });

  it.each([['application/pdf'], ['application/pdf; charset=binary'], ['IMAGE/JPEG'], ['image/png'], ['image/webp']])('serves %s', async (type) => {
    stubFetch(() => new Response('x', { status: 200, headers: { 'content-type': type } }));
    const res = await worker.fetch(new Request(`https://shop.test/media/coas/31/${key}`), env, createExecutionContext());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(type);
    await res.body?.cancel();
  });

  it.each([['text/html'], ['text/html; charset=utf-8'], ['image/svg+xml'], ['application/octet-stream'], ['image/gif'], [null]])('answers 502 for upstream type %s and cancels the body', async (type) => {
    let cancelled = false;
    const body = new ReadableStream({ cancel() { cancelled = true; } });
    stubFetch(() => new Response(body, { status: 200, headers: type ? { 'content-type': type } : {} }));
    const res = await worker.fetch(new Request(`https://shop.test/media/coas/31/${key}`), env, createExecutionContext());
    expect(res.status).toBe(502);
    expect(cancelled).toBe(true);
  });

  it('answers HEAD from a GET with an empty body', async () => {
    stubFetch((_url, init) => {
      expect(init.method).toBe('GET');
      return pdf();
    });
    const head = await worker.fetch(new Request(`https://shop.test/media/coas/31/${key}`, { method: 'HEAD' }), env, createExecutionContext());
    expect(head.status).toBe(200);
    expect(head.headers.get('cache-control')).toBe('private, max-age=300');
    expect(await head.text()).toBe('');
  });

  it('405s a POST without calling the backend', async () => {
    const fetchSpy = stubFetch(() => { throw new Error('unexpected'); });
    const res = await worker.fetch(new Request(`https://shop.test/media/coas/31/${key}`, { method: 'POST' }), env, createExecutionContext());
    expect(res.status).toBe(405);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps upstream 404 to 404 and other failures to 502', async () => {
    stubFetch(() => new Response('no', { status: 404 }));
    expect((await worker.fetch(new Request(`https://shop.test/media/coas/32/${key}`), env, createExecutionContext())).status).toBe(404);
    stubFetch(() => new Response('boom', { status: 500 }));
    expect((await worker.fetch(new Request(`https://shop.test/media/coas/32/${key}`), env, createExecutionContext())).status).toBe(502);
    stubFetch(() => { throw new Error('down'); });
    expect((await worker.fetch(new Request(`https://shop.test/media/coas/32/${key}`), env, createExecutionContext())).status).toBe(502);
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
