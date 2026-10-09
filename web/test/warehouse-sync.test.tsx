import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/api/warehouses.ts', () => ({ fetchWarehouses: vi.fn() }));
vi.mock('@/api/catalog.ts', () => ({ fetchCatalog: vi.fn(), fetchProduct: vi.fn() }));
vi.mock('@/api/cart.ts', () => ({ fetchCart: vi.fn(), putCart: vi.fn(), clearCart: vi.fn() }));

import { fetchWarehouses } from '@/api/warehouses.ts';
import { fetchCatalog } from '@/api/catalog.ts';
import { fetchCart } from '@/api/cart.ts';
import { SETTINGS_KEY, queryClient } from '@/lib/query-client.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useCartStore } from '@/stores/cart.ts';
import { catalogKey, useCatalog } from '@/features/catalog/use-catalog.ts';
import { resetCartSync } from '@/features/cart/useServerCart.ts';
import { resetWarehouseStore, useWarehouseStore } from '@/features/warehouses/store.ts';
import { WarehouseSync } from '@/features/warehouses/WarehouseSync.tsx';
import type { Warehouse } from '@/types/warehouses.ts';
import type { StorefrontSettings } from '@/types/settings.ts';
import type { Catalog } from '@/types/catalog.ts';

const LIST: Warehouse[] = [
  { id: 1, name: 'Main', country: 'GB', isDefault: true },
  { id: 2, name: 'Test EU', country: 'DE', isDefault: false },
  { id: 3, name: 'Test US', country: null, isDefault: false },
];
const settings = (on: boolean) => ({ features: { warehouseSelect: on }, access: { storefront: 'public' } }) as unknown as StorefrontSettings;
const catalogOf = (ids: number[]) => ({ products: ids.map((id) => ({ id })), categories: [] }) as unknown as Catalog;

function Page() {
  useCatalog();
  return null;
}
const mount = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <WarehouseSync />
      <Page />
    </QueryClientProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  resetWarehouseStore();
  useSessionStore.getState().clear();
  queryClient.clear();
  vi.mocked(fetchCatalog).mockReset();
  vi.mocked(fetchCart).mockReset();
  vi.mocked(fetchWarehouses).mockReset();
  vi.mocked(fetchCatalog).mockImplementation(async (_p, w) => catalogOf(w ? [4, 3] : [1, 2, 3, 4]));
  vi.mocked(fetchWarehouses).mockResolvedValue({ warehouses: LIST });
  vi.mocked(fetchCart).mockResolvedValue({ items: [], subtotal: 0, itemCount: 0 });
});
afterEach(() => {
  cleanup();
  resetCartSync();
  useCartStore.setState({ lines: [], mode: 'local' });
});

describe('WarehouseSync', () => {
  it('feature off: never asks for the list, and the catalogue is fetched once without a warehouse', async () => {
    queryClient.setQueryData(SETTINGS_KEY, settings(false));
    useWarehouseStore.setState({ warehouseId: 2 });
    mount();
    await waitFor(() => expect(fetchCatalog).toHaveBeenCalledTimes(1));
    expect(fetchCatalog).toHaveBeenCalledWith(false);
    expect(fetchWarehouses).not.toHaveBeenCalled();
  });

  it('fetches the list when the flag is on and pushes it into the store', async () => {
    queryClient.setQueryData(SETTINGS_KEY, settings(true));
    mount();
    await waitFor(() => expect(useWarehouseStore.getState().ctx.list).toEqual(LIST));
    expect(useWarehouseStore.getState().ctx.enabled).toBe(true);
  });

  it('a returning shopper: one catalogue request, already for their warehouse, and the carried set is published', async () => {
    queryClient.setQueryData(SETTINGS_KEY, settings(true));
    useWarehouseStore.setState({ warehouseId: 2 });
    mount();
    await waitFor(() => expect(useWarehouseStore.getState().ctx.carried).toEqual(new Set([4, 3])));
    expect(fetchCatalog).toHaveBeenCalledTimes(1);
    expect(fetchCatalog).toHaveBeenCalledWith(false, 2);
  });

  it('clears a stored id the list no longer offers', async () => {
    queryClient.setQueryData(SETTINGS_KEY, settings(true));
    useWarehouseStore.setState({ warehouseId: 9 });
    mount();
    await waitFor(() => expect(useWarehouseStore.getState().warehouseId).toBeNull());
  });

  it('a failed list keeps the choice stored but sends nothing', async () => {
    queryClient.setQueryData(SETTINGS_KEY, settings(true));
    vi.mocked(fetchWarehouses).mockRejectedValue(new Error('down'));
    useWarehouseStore.setState({ warehouseId: 2 });
    mount();
    await waitFor(() => expect(useWarehouseStore.getState().ctx.failed).toBe(true), { timeout: 4000 });
    expect(useWarehouseStore.getState().warehouseId).toBe(2);
    await waitFor(() => expect(fetchCatalog).toHaveBeenLastCalledWith(false));
  });

  it('choosing a warehouse refetches the catalogue for it, and back to the default refetches that', async () => {
    queryClient.setQueryData(SETTINGS_KEY, settings(true));
    mount();
    await waitFor(() => expect(useWarehouseStore.getState().ctx.list).toEqual(LIST));
    await waitFor(() => expect(fetchCatalog).toHaveBeenCalledWith(false));
    act(() => useWarehouseStore.getState().choose(2));
    await waitFor(() => expect(fetchCatalog).toHaveBeenCalledWith(false, 2));
    expect(queryClient.getQueryData(catalogKey(null, 2))).toEqual(catalogOf([4, 3]));
    act(() => useWarehouseStore.getState().choose(null));
    expect(queryClient.getQueryData(catalogKey(null))).toEqual(catalogOf([1, 2, 3, 4]));
  });

  it('re-reads a signed-in cart when the warehouse changes, and never edits its lines', async () => {
    queryClient.setQueryData(SETTINGS_KEY, settings(true));
    useSessionStore.getState().setSession('tok', { id: 1, nickname: 'A' });
    useCartStore.setState({
      lines: [{ productId: 9, displayName: 'N', sku: 's', unitPrice: 1, basePrice: 1, pricingTiers: [], quantity: 1, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null }],
      mode: 'server',
    });
    mount();
    await waitFor(() => expect(useWarehouseStore.getState().ctx.list).toEqual(LIST));
    vi.mocked(fetchCart).mockClear();
    // The warehouse cannot supply it: the server still returns the line, flagged.
    vi.mocked(fetchCart).mockResolvedValue({
      items: [{ productId: 9, name: 'N', quantity: 1, unitPrice: 1, lineTotal: 1, imageUrl: null, isPreorder: false, outOfStock: false, priceChanged: false, inactive: true, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null }],
      subtotal: 1, itemCount: 1,
    });
    act(() => useWarehouseStore.getState().choose(2));
    await waitFor(() => expect(fetchCart).toHaveBeenCalledTimes(1));
    expect(useCartStore.getState().lines.map((l) => l.productId)).toEqual([9]);
  });
});
