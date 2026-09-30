import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPageSet, PAGE_SET_TIMEOUT_MS } from '@/api/pages.ts';
import { useSessionStore } from '@/stores/session.ts';

// The real shared ky client: only fetch is stubbed, so its own Authorization hook runs too.
const SET = { schemaVersion: 1, shell: {}, pages: {} };
const ok = () => new Response(JSON.stringify({ success: true, data: { version: 3, data: SET }, error: null }), { status: 200, headers: { 'content-type': 'application/json' } });

function stubFetch(impl: (req: Request) => Promise<Response>) {
  const fetch = vi.fn(impl);
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  useSessionStore.getState().clear();
});

describe('fetchPageSet', () => {
  it('reads the layout route once, with retry disabled (a 503 must be one request, not two)', async () => {
    const fetch = stubFetch(async () => new Response('{}', { status: 503 }));
    expect(await fetchPageSet('menu')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new URL(fetch.mock.calls[0]![0].url).pathname).toBe('/api/storefront/pages/menu');
  });
  it('returns the set on success', async () => {
    stubFetch(async () => ok());
    expect(await fetchPageSet('menu')).toEqual(SET);
  });
  it('resolves null on any failure', async () => {
    stubFetch(async () => { throw new TypeError('Failed to fetch'); });
    expect(await fetchPageSet('storefront')).toBeNull();
  });
  it('sends no Authorization header, even for a signed-in shopper (public, edge-cacheable)', async () => {
    useSessionStore.getState().setSession('shopper-token', { id: 1 } as never);
    const fetch = stubFetch(async () => ok());
    await fetchPageSet('storefront');
    expect(fetch.mock.calls[0]![0].headers.get('Authorization')).toBeNull();
  });
  it('gives up after a short timeout and resolves null (the page paints its defaults)', async () => {
    vi.useFakeTimers();
    expect(PAGE_SET_TIMEOUT_MS).toBeLessThanOrEqual(4000);
    stubFetch((req) => new Promise((_, reject) => req.signal.addEventListener('abort', () => reject(req.signal.reason))));
    let settled: unknown = 'pending';
    void fetchPageSet('storefront').then((v) => { settled = v; });
    await vi.advanceTimersByTimeAsync(PAGE_SET_TIMEOUT_MS - 100);
    expect(settled).toBe('pending');
    await vi.advanceTimersByTimeAsync(200);
    expect(settled).toBeNull();
  });
});
