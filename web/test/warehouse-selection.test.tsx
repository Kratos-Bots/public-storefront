import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';


import { fetchCatalog, fetchProduct } from '@/api/catalog.ts';
import { fetchCart, putCart } from '@/api/cart.ts';
import { guestQuote, placeGuestOrder, placeOrder, quote } from '@/api/checkout.ts';
import { ApiError } from '@/lib/errors.ts';
import { SETTINGS_KEY, queryClient } from '@/lib/query-client.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useCartStore, type LocalLine } from '@/stores/cart.ts';
import { catalogKey, productKey } from '@/features/catalog/use-catalog.ts';
import { upsellsFor } from '@/features/catalog/filter.ts';
import { resetCartSync, useServerCart } from '@/features/cart/useServerCart.ts';
import { ReviewStep } from '@/features/checkout/steps/ReviewStep.tsx';
import { classifyQuoteError } from '@/features/checkout/CheckoutPage.tsx';
import { DEFAULT_FORM } from '@/features/checkout/form-state.ts';
import {
  currentWarehouseId, resetWarehouseStore, resolveWarehouse, selectedWarehouseId, useWarehouseStore,
} from '@/features/warehouses/store.ts';
import { useSelectedWarehouse } from '@/features/warehouses/use-warehouse.ts';
import { WarehouseStrip, warehousePickerHidden } from '@/features/warehouses/WarehouseStrip.tsx';
import { useNotCarried } from '@/features/warehouses/NotCarried.tsx';
import type { Warehouse } from '@/types/warehouses.ts';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Catalog, Product } from '@/types/catalog.ts';

const MAIN: Warehouse = { id: 1, name: 'Main', country: 'GB', isDefault: true };
const EU: Warehouse = { id: 2, name: 'Test EU', country: 'DE', isDefault: false };
const US: Warehouse = { id: 3, name: 'Test US', country: null, isDefault: false };
const LIST = [MAIN, EU, US];

function setCtx(over: Partial<ReturnType<typeof useWarehouseStore.getState>['ctx']> = {}, stored: number | null = null) {
  useWarehouseStore.setState({ warehouseId: stored, ctx: { enabled: true, list: LIST, failed: false, carried: null, ...over } });
}

beforeEach(() => {
  localStorage.clear();
  resetWarehouseStore();
  useSessionStore.getState().clear();
  queryClient.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetCartSync();
  useCartStore.setState({ lines: [], mode: 'local' });
});

describe('resolveWarehouse (the one rule)', () => {
  it('is null when the feature is off, nothing is stored, or the list failed', () => {
    expect(resolveWarehouse(2, false, LIST, false)).toBeNull();
    expect(resolveWarehouse(null, true, LIST, false)).toBeNull();
    expect(resolveWarehouse(2, true, LIST, true)).toBeNull();
  });
  it('is null with fewer than two warehouses', () => {
    expect(resolveWarehouse(2, true, [EU], false)).toBeNull();
    expect(resolveWarehouse(2, true, [], false)).toBeNull();
  });
  it('is null for a stored id the list does not offer, and for the default warehouse itself', () => {
    expect(resolveWarehouse(9, true, LIST, false)).toBeNull();
    expect(resolveWarehouse(1, true, LIST, false)).toBeNull();
  });
  it('is the stored id for a non-default warehouse in the list', () => {
    expect(resolveWarehouse(2, true, LIST, false)).toBe(2);
  });
  it('uses the stored id optimistically while the list is still loading (the flag is on)', () => {
    expect(resolveWarehouse(2, true, null, false)).toBe(2);
    expect(resolveWarehouse(2, false, null, false)).toBeNull();
  });
});

describe('the store and the derived hook', () => {
  it('persists only the id, under sf-warehouse-v1', () => {
    setCtx({}, null);
    useWarehouseStore.getState().choose(2);
    expect(JSON.parse(localStorage.getItem('sf-warehouse-v1')!).state).toEqual({ warehouseId: 2 });
  });

  it('never writes localStorage until there is a choice to keep (a shop without the feature gains no key)', () => {
    useWarehouseStore.getState().setContext({ enabled: false, list: null });
    useWarehouseStore.getState().setContext({ enabled: true, list: LIST });
    expect(localStorage.getItem('sf-warehouse-v1')).toBeNull();
    useWarehouseStore.getState().choose(2);
    expect(JSON.parse(localStorage.getItem('sf-warehouse-v1')!).state).toEqual({ warehouseId: 2 });
    useWarehouseStore.getState().choose(null);
    expect(JSON.parse(localStorage.getItem('sf-warehouse-v1')!).state).toEqual({ warehouseId: null });
  });

  it('feature off: nothing is selected even with a stored id, and the picker list is empty', () => {
    setCtx({ enabled: false }, 2);
    const { result } = renderHook(() => useSelectedWarehouse());
    expect(result.current.selectedId).toBeNull();
    expect(result.current.warehouses).toEqual([]);
    expect(currentWarehouseId()).toBeNull();
  });

  it('one warehouse is no choice: selectedId null, nothing listed', () => {
    setCtx({ list: [MAIN] }, 2);
    const { result } = renderHook(() => useSelectedWarehouse());
    expect(result.current.selectedId).toBeNull();
    expect(result.current.warehouses).toEqual([]);
  });

  it('a failed list ignores the choice', () => {
    setCtx({ failed: true }, 2);
    expect(selectedWarehouseId(useWarehouseStore.getState())).toBeNull();
  });

  it('selecting the default stores null; selecting another stores its id', () => {
    setCtx({}, null);
    const { result } = renderHook(() => useSelectedWarehouse());
    act(() => result.current.select(2));
    expect(useWarehouseStore.getState().warehouseId).toBe(2);
    expect(result.current.selectedId).toBe(2);
    expect(result.current.current?.name).toBe('Test EU');
    act(() => result.current.select(1));
    expect(useWarehouseStore.getState().warehouseId).toBeNull();
    expect(result.current.selectedId).toBeNull();
    expect(result.current.current?.name).toBe('Main');
  });

  it('reads the flag off the cached settings before the sync has pushed anything', () => {
    queryClient.setQueryData(SETTINGS_KEY, { features: { warehouseSelect: true }, access: { storefront: 'public' } } as unknown as StorefrontSettings);
    useWarehouseStore.setState({ warehouseId: 2 });
    expect(currentWarehouseId()).toBe(2);
    queryClient.setQueryData(SETTINGS_KEY, { features: { warehouseSelect: false } } as unknown as StorefrontSettings);
    expect(currentWarehouseId()).toBeNull();
    // A private shop with nobody signed in does not ask for the list, so there is no feature to speak of.
    queryClient.setQueryData(SETTINGS_KEY, { features: { warehouseSelect: true }, access: { storefront: 'login' } } as unknown as StorefrontSettings);
    expect(currentWarehouseId()).toBeNull();
  });
});

// ── the ten request touchpoints ──────────────────────────────────────────────

interface Sent { url: string; method: string; body: Record<string, unknown> | null }
function captureFetch(): Sent[] {
  const sent: Sent[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const req = input as Request;
    sent.push({ url: req.url, method: req.method, body: req.body ? ((await req.clone().json()) as Record<string, unknown>) : null });
    return new Response(JSON.stringify({ success: true, data: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return sent;
}

const ORIGIN = window.location.origin;
const TOUCHPOINTS: Array<{ name: string; path: string; method: string; call: () => Promise<unknown>; body?: Record<string, unknown> }> = [
  { name: 'catalog (public)', path: '/api/catalog', method: 'GET', call: () => fetchCatalog(false, currentWarehouseId()) },
  { name: 'catalog (personalised)', path: '/api/storefront/catalog', method: 'GET', call: () => fetchCatalog(true, currentWarehouseId()) },
  { name: 'product (public)', path: '/api/catalog/products/5', method: 'GET', call: () => fetchProduct(5, false, currentWarehouseId()) },
  { name: 'product (personalised)', path: '/api/storefront/catalog/products/5', method: 'GET', call: () => fetchProduct(5, true, currentWarehouseId()) },
  { name: 'cart GET', path: '/api/storefront/cart', method: 'GET', call: () => fetchCart() },
  { name: 'cart PUT', path: '/api/storefront/cart', method: 'PUT', body: { items: [{ productId: 5, quantity: 1 }] }, call: () => putCart([{ productId: 5, quantity: 1 }]) },
];
const BODY_TOUCHPOINTS: Array<{ name: string; path: string; call: () => Promise<unknown> }> = [
  { name: 'quote', path: '/api/storefront/checkout/quote', call: () => quote({ country: 'GB' }) },
  { name: 'checkout', path: '/api/storefront/checkout', call: () => placeOrder({ shippingAddress: {} as never, shippingOptionId: 1 }) },
  { name: 'guest quote', path: '/api/storefront/checkout/guest/quote', call: () => guestQuote({ turnstileToken: 't', items: [], country: 'GB' }) },
  { name: 'guest checkout', path: '/api/storefront/checkout/guest', call: () => placeGuestOrder({ turnstileToken: 't', items: [], shippingAddress: {} as never, shippingOptionId: 1 }) },
];

describe('request builders: nothing chosen is byte-identical to before', () => {
  for (const tp of TOUCHPOINTS) {
    it(`${tp.name}: no query string`, async () => {
      setCtx({}, null);
      const sent = captureFetch();
      await tp.call();
      expect(sent).toHaveLength(1);
      expect(sent[0]!.url).toBe(`${ORIGIN}${tp.path}`);
      expect(sent[0]!.method).toBe(tp.method);
      expect(sent[0]!.body).toEqual(tp.body ?? null);
    });
    it(`${tp.name}: ?warehouse=2 when Test EU is chosen`, async () => {
      setCtx({}, 2);
      const sent = captureFetch();
      await tp.call();
      expect(sent[0]!.url).toBe(`${ORIGIN}${tp.path}?warehouse=2`);
      expect(sent[0]!.body).toEqual(tp.body ?? null);
    });
  }
  for (const tp of BODY_TOUCHPOINTS) {
    it(`${tp.name}: no warehouseId field when nothing is chosen (feature off too)`, async () => {
      setCtx({ enabled: false }, 2);
      const sent = captureFetch();
      await tp.call();
      expect(sent[0]!.url).toBe(`${ORIGIN}${tp.path}`);
      expect(Object.keys(sent[0]!.body!)).not.toContain('warehouseId');
    });
    it(`${tp.name}: warehouseId in the body when Test EU is chosen`, async () => {
      setCtx({}, 2);
      const sent = captureFetch();
      await tp.call();
      expect(sent[0]!.url).toBe(`${ORIGIN}${tp.path}`);
      expect(sent[0]!.body!.warehouseId).toBe(2);
    });
  }
  it('the default warehouse chosen sends nothing either', async () => {
    setCtx({}, 1);
    const sent = captureFetch();
    await fetchCart();
    await quote({ country: 'GB' });
    expect(sent[0]!.url).toBe(`${ORIGIN}/api/storefront/cart`);
    expect(Object.keys(sent[1]!.body!)).not.toContain('warehouseId');
  });
  it('the personalised catalogue 404 fallback keeps the warehouse', async () => {
    setCtx({}, 2);
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = (input as Request).url;
      urls.push(url);
      return url.includes('/storefront/')
        ? new Response(JSON.stringify({ success: false, data: null, error: 'Route not found' }), { status: 404, headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify({ success: true, data: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await fetchCatalog(true, 2);
    expect(urls.map((u) => u.replace(ORIGIN, ''))).toEqual(['/api/storefront/catalog?warehouse=2', '/api/catalog?warehouse=2']);
  });
});

describe('query keys', () => {
  it('vary by warehouse and are the old keys when none is chosen', () => {
    expect(catalogKey(null)).toEqual(['catalog', null]);
    expect(catalogKey(7, null)).toEqual(['catalog', 7]);
    expect(catalogKey(7, 2)).toEqual(['catalog', 7, 2]);
    expect(catalogKey(7, 2)).not.toEqual(catalogKey(7, 3));
    expect(productKey(5, 7)).toEqual(['product', 5, 7]);
    expect(productKey(5, 7, 2)).toEqual(['product', 5, 7, 2]);
  });
});

// ── the picker ───────────────────────────────────────────────────────────────

function wrap(ui: React.ReactNode, at = '/') {
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider env="test"><MemoryRouter initialEntries={[at]}>{ui}</MemoryRouter></MantineProvider>
    </QueryClientProvider>,
  );
}

describe('WarehouseStrip', () => {
  it('renders nothing with the feature off, with one warehouse, or while the list is loading', () => {
    const shown = () => wrap(<WarehouseStrip />).container.querySelector('[data-warehouse-picker]');
    setCtx({ enabled: false });
    expect(shown()).toBeNull();
    cleanup();
    setCtx({ list: [MAIN] });
    expect(shown()).toBeNull();
    cleanup();
    setCtx({ list: null });
    expect(shown()).toBeNull();
  });

  it('lists every warehouse, with the country when there is one, labelled for assistive tech', () => {
    setCtx();
    wrap(<WarehouseStrip />);
    const select = screen.getByLabelText('Shipping from') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['Main · GB', 'Test EU · DE', 'Test US']);
    expect(select.value).toBe('1');
  });

  it('choosing a warehouse stores it; choosing the default stores nothing', () => {
    setCtx();
    wrap(<WarehouseStrip />);
    const select = screen.getByLabelText('Shipping from') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '2' } });
    expect(useWarehouseStore.getState().warehouseId).toBe(2);
    expect(select.value).toBe('2');
    fireEvent.change(select, { target: { value: '1' } });
    expect(useWarehouseStore.getState().warehouseId).toBeNull();
  });

  it('is hidden on the checkout, order-placed and payment routes only', () => {
    for (const path of ['/checkout', '/order-placed', '/payment/success', '/payment/cancel']) expect(warehousePickerHidden(path), path).toBe(true);
    for (const path of ['/', '/c/peptides', '/p/4', '/cart', '/account/orders', '/checkout-help']) expect(warehousePickerHidden(path), path).toBe(false);
    setCtx();
    expect(wrap(<WarehouseStrip />, '/checkout').container.querySelector('[data-warehouse-picker]')).toBeNull();
    cleanup();
    setCtx();
    expect(wrap(<WarehouseStrip />, '/c/peptides').container.querySelector('select')).not.toBeNull();
  });
});

describe('checkout review', () => {
  const review = () =>
    wrap(<ReviewStep form={DEFAULT_FORM} quote={undefined} method={undefined} combo={null} order={['contact', 'address', 'shipping', 'payment', 'review']} onEdit={() => {}} />);
  it('says where the order ships from only when a non-default warehouse is chosen', () => {
    setCtx({}, 2);
    review();
    expect(screen.getByText('Shipping from Test EU')).toBeTruthy();
    cleanup();
    setCtx({}, null);
    review();
    expect(screen.queryByText(/Shipping from/)).toBeNull();
  });
});

describe('what a warehouse that does not carry something means', () => {
  const product = (id: number, upsellProductIds: number[] = []) => ({ id, upsellProductIds }) as unknown as Product;

  it('upsells pointing at products missing from the loaded catalogue are dropped, as a deleted product is', () => {
    const catalog = { products: [product(1), product(3)], categories: [] } as unknown as Catalog;
    expect(upsellsFor(product(1, [2, 3, 4]), catalog).map((p) => p.id)).toEqual([3]);
    expect(upsellsFor(product(1, [2]), catalog)).toEqual([]);
  });

  const line = (productId: number): LocalLine => ({
    productId, displayName: `Item ${productId}`, sku: `S${productId}`, unitPrice: 10, basePrice: 10, pricingTiers: [], quantity: 2,
    isPreorder: false, excludedFromFreeShipping: false, imageProductId: null,
  });

  it('a guest basket line the chosen warehouse does not carry is flagged inactive (which blocks checkout), and kept', () => {
    useCartStore.setState({ lines: [line(4), line(9)], mode: 'local' });
    setCtx({ carried: new Set([4]) }, 2);
    const { result } = renderHook(() => useServerCart());
    expect(result.current.issues.map((i) => [i.productId, i.inactive])).toEqual([[9, true]]);
    expect(useCartStore.getState().lines.map((l) => l.productId)).toEqual([4, 9]);
  });

  it('nothing is flagged without a chosen warehouse, before its catalogue is in, or with the feature off', () => {
    useCartStore.setState({ lines: [line(4), line(9)], mode: 'local' });
    for (const [ctx, stored] of [[{ carried: new Set([4]) }, null], [{ carried: null }, 2], [{ enabled: false, carried: new Set([4]) }, 2]] as const) {
      setCtx(ctx, stored);
      const { result, unmount } = renderHook(() => useServerCart());
      expect(result.current.issues).toEqual([]);
      unmount();
    }
  });

  it('a 404 for a product offers the way back only with a non-default warehouse chosen', () => {
    setCtx({}, 2);
    const { result } = renderHook(() => useNotCarried(new ApiError(404, 'Product not found')));
    expect(result.current?.message).toBe("This product isn't available from Test EU.");
    expect(result.current?.switchLabel).toBe('Ship from Main instead');
    act(() => result.current!.switchBack());
    expect(useWarehouseStore.getState().warehouseId).toBeNull();
    // ...and now the default is chosen, so there is nothing to offer.
    const again = renderHook(() => useNotCarried(new ApiError(404, 'Product not found')));
    expect(again.result.current).toBeNull();
  });

  it('other failures, and the default warehouse, get the ordinary not-found view', () => {
    setCtx({}, 2);
    expect(renderHook(() => useNotCarried(new ApiError(500, 'boom'))).result.current).toBeNull();
    expect(renderHook(() => useNotCarried(undefined)).result.current).toBeNull();
  });

  it('a "Product(s) … no longer available" 422 is a page-level message, not tied to a step', () => {
    const form = { ...DEFAULT_FORM, shippingOptionId: 3 };
    expect(classifyQuoteError(new ApiError(422, 'Product(s) 9 are no longer available — remove them from your cart to continue'), form)).toBeNull();
    expect(classifyQuoteError(new ApiError(422, 'Shipping option unavailable'), form)).toBe('shipping');
  });
});

