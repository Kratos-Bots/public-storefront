import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalog, fetchProduct } from '@/api/catalog.ts';
import { useSessionStore } from '@/stores/session.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ok = (data: unknown) => json(200, { success: true, data, error: null });
const fail = (status: number, error: string) => json(status, { success: false, data: null, error });

/** Queue one response per fetch call, in order; each is built fresh (a Response body reads once). */
function mockFetchSequence(...responses: Array<() => Response>) {
  const spy = vi.spyOn(globalThis, 'fetch');
  for (const r of responses) spy.mockImplementationOnce(async () => r());
  return spy;
}
const pathsOf = (spy: { mock: { calls: unknown[][] } }): string[] =>
  spy.mock.calls.map((c) => new URL((c[0] as Request).url).pathname);

const CATALOG = { products: [{ id: 7 }], categories: [] };
const PRODUCT = { id: 7, name: 'Seven' };

describe('personalised catalog falls back to the public one on an old backend', () => {
  beforeEach(() => useSessionStore.getState().setSession('tok', { id: 1, nickname: null }));
  afterEach(() => {
    vi.restoreAllMocks();
    useSessionStore.getState().clear();
  });

  it('retries the public catalog once when the personalised route 404s', async () => {
    const spy = mockFetchSequence(() => fail(404, 'Route not found'), () => ok(CATALOG));
    await expect(fetchCatalog(true)).resolves.toEqual(CATALOG);
    expect(pathsOf(spy)).toEqual(['/api/storefront/catalog', '/api/catalog']);
  });

  it('does not fall back on 401 — the session is cleared instead', async () => {
    const spy = mockFetchSequence(() => fail(401, 'Unauthorized'), () => ok(CATALOG));
    await expect(fetchCatalog(true)).rejects.toMatchObject({ status: 401 });
    expect(pathsOf(spy)).toEqual(['/api/storefront/catalog']);
    expect(useSessionStore.getState().token).toBeNull();
  });

  it('does not fall back on a 5xx', async () => {
    // ky retries a GET 500 once on its own; neither attempt may hit the public route.
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => fail(500, 'boom'));
    await expect(fetchCatalog(true)).rejects.toMatchObject({ status: 500 });
    expect(pathsOf(spy).every((p) => p === '/api/storefront/catalog')).toBe(true);
  });

  it('uses the public catalog directly for an anonymous shopper', async () => {
    useSessionStore.getState().clear();
    const spy = mockFetchSequence(() => ok(CATALOG));
    await expect(fetchCatalog(false)).resolves.toEqual(CATALOG);
    expect(pathsOf(spy)).toEqual(['/api/catalog']);
  });

  it('falls back for a product when the personalised route is missing', async () => {
    const spy = mockFetchSequence(() => fail(404, 'Route not found'), () => ok(PRODUCT));
    await expect(fetchProduct(7, true)).resolves.toEqual(PRODUCT);
    expect(pathsOf(spy)).toEqual(['/api/storefront/catalog/products/7', '/api/catalog/products/7']);
  });

  it("keeps a product hidden by the shopper's group hidden (entity 404, no fallback)", async () => {
    const spy = mockFetchSequence(() => fail(404, 'Product not found'), () => ok(PRODUCT));
    await expect(fetchProduct(7, true)).rejects.toMatchObject({ status: 404 });
    expect(pathsOf(spy)).toEqual(['/api/storefront/catalog/products/7']);
  });

  it('does not fall back for a product on 401', async () => {
    const spy = mockFetchSequence(() => fail(401, 'Unauthorized'), () => ok(PRODUCT));
    await expect(fetchProduct(7, true)).rejects.toMatchObject({ status: 401 });
    expect(pathsOf(spy)).toEqual(['/api/storefront/catalog/products/7']);
  });
});
