import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { escapeAttr } from '../src/app-shell';

const MANIFEST_URL = 'https://backend.test/api/v1/public/storefront/app-manifest';
let originalFetch: typeof fetch;

beforeEach(async () => {
  originalFetch = globalThis.fetch;
  // The identity is edge-cached for 300 s; start every test cold.
  await caches.default.delete(new Request(MANIFEST_URL, { method: 'GET' }));
  await caches.default.delete(new Request('https://backend.test/api/v1/public/storefront/app-icon/apple-180.png', { method: 'GET' }));
});
afterEach(() => { globalThis.fetch = originalFetch; });

function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  const spy = vi.fn(async (input: RequestInfo | URL) => handler(String(input)));
  globalThis.fetch = spy as unknown as typeof fetch;
  return spy;
}

const identity = (name: string) => new Response(JSON.stringify({ success: true, data: { name, short_name: 'S', theme_color: '#111111', background_color: '#000000', icons: [{ src: '/app-icon/192.png', sizes: '192x192', type: 'image/png' }] } }), { status: 200 });

async function run(request: Request, assets?: (req: Request) => Response | Promise<Response>) {
  const ctx = createExecutionContext();
  const testEnv = assets ? { ...env, ASSETS: { fetch: async (r: Request) => assets(r) } as unknown as Fetcher } : env;
  const res = await worker.fetch(request as Request<unknown, IncomingRequestCfProperties>, testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe('manifest', () => {
  it('manifest merges backend fields and forces standalone/scope', async () => {
    stubFetch(() => identity('Acme'));
    const res = await run(new Request('https://shop.test/manifest.webmanifest'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/manifest+json');
    expect(await res.json()).toEqual({
      name: 'Acme', short_name: 'S', theme_color: '#111111', background_color: '#000000',
      icons: [{ src: '/app-icon/192.png', sizes: '192x192', type: 'image/png' }],
      id: '/', start_url: '/', scope: '/', display: 'standalone',
    });
  });

  it('manifest falls back when backend 500s', async () => {
    stubFetch(() => new Response('boom', { status: 500 }));
    const res = await run(new Request('https://shop.test/manifest.webmanifest'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'Shop', short_name: 'Shop', display: 'standalone', start_url: '/', icons: [] });
  });

  it('manifest uses the cache for a second request', async () => {
    const spy = stubFetch(() => identity('Acme'));
    await run(new Request('https://shop.test/manifest.webmanifest'));
    await run(new Request('https://shop.test/manifest.webmanifest'));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('html rewriting', () => {
  const html = '<!doctype html><html><head><title>Shop</title></head><body><div id="root"></div></body></html>';

  it('html gets apple-mobile-web-app-title escaped', async () => {
    stubFetch(() => identity('A&B "Shop"'));
    const res = await run(new Request('https://shop.test/some/spa/route'), () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
    const body = await res.text();
    expect(body).toContain('<meta name="apple-mobile-web-app-title" content="A&amp;B &quot;Shop&quot;">');
    expect(body).toContain('<title>Shop</title>');
    expect(body).toContain('<div id="root"></div>');
  });

  it('html is still served with the fallback name when the backend is down', async () => {
    stubFetch(() => { throw new Error('down'); });
    const res = await run(new Request('https://shop.test/'), () => new Response(html, { headers: { 'content-type': 'text/html' } }));
    expect(await res.text()).toContain('content="Shop"');
  });

  it('non-html passes untouched', async () => {
    stubFetch(() => identity('Acme'));
    const bytes = new Uint8Array([1, 2, 3, 250, 0, 7]);
    const asset = new Response(bytes, { headers: { 'content-type': 'application/javascript', 'cache-control': 'public, max-age=31536000, immutable' } });
    const res = await run(new Request('https://shop.test/assets/app.js'), () => asset);
    expect(res).toBe(asset);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it('escapeAttr escapes the attribute-breaking characters', () => {
    expect(escapeAttr('a&b"c<d>e')).toBe('a&amp;b&quot;c&lt;d&gt;e');
  });
});

describe('icons', () => {
  it('/apple-touch-icon.png proxies apple-180', async () => {
    const spy = stubFetch(() => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } }));
    const res = await run(new Request('https://shop.test/apple-touch-icon.png'));
    expect(spy.mock.calls[0]![0]).toBe('https://backend.test/api/v1/public/storefront/app-icon/apple-180.png');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  it('/app-icon/<variant>.png proxies the variant and rejects unknown ones', async () => {
    const spy = stubFetch(() => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }));
    const ok = await run(new Request('https://shop.test/app-icon/maskable-512.png'));
    expect(ok.status).toBe(200);
    expect(spy.mock.calls[0]![0]).toBe('https://backend.test/api/v1/public/storefront/app-icon/maskable-512.png');
    const bad = await run(new Request('https://shop.test/app-icon/evil.png'));
    expect(bad.status).toBe(404);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('routing', () => {
  it('/api still proxied, unknown asset path still served by ASSETS', async () => {
    const spy = stubFetch((url) => url.includes('/api/v1/public/storefront/settings')
      ? new Response(JSON.stringify({ success: true, data: { ok: 1 } }), { headers: { 'content-type': 'application/json' } })
      : identity('Acme'));
    const api = await run(new Request('https://shop.test/api/storefront/settings'));
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({ success: true, data: { ok: 1 } });
    expect(spy.mock.calls[0]![0]).toBe('https://backend.test/api/v1/public/storefront/settings');

    const asset = new Response('hello', { headers: { 'content-type': 'text/plain' } });
    const res = await run(new Request('https://shop.test/robots.txt'), () => asset);
    expect(res).toBe(asset);
  });
});
