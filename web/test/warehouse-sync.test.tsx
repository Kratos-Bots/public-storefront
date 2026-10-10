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

  it('re-reads the cart once the server cart is adopted with a warehouse already chosen (the boot read may predate the choice)', async () => {
    queryClient.setQueryData(SETTINGS_KEY, settings(true));
    useSessionStore.getState().setSession('tok', { id: 1, nickname: 'A' });
    useWarehouseStore.setState({ warehouseId: 2 });
    mount();
    await waitFor(() => expect(useWarehouseStore.getState().ctx.list).toEqual(LIST));
    expect(fetchCart).not.toHaveBeenCalled();
    act(() => useCartStore.setState({ mode: 'server' }));
    await waitFor(() => expect(fetchCart).toHaveBeenCalledTimes(1));
  });

  it('adopting the server cart with no warehouse chosen reads nothing extra', async () => {
    queryClient.setQueryData(SETTINGS_KEY, settings(true));
    mount();
    await waitFor(() => expect(useWarehouseStore.getState().ctx.list).toEqual(LIST));
    act(() => useCartStore.setState({ mode: 'server' }));
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchCart).not.toHaveBeenCalled();
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

  describe('guest basket prices', () => {
    const priced = (price: number, tier: number) => ({ id: 4, price, pricingTiers: [{ id: 10, minQuantity: 10, price: tier }] });
    const guestLine = { productId: 4, displayName: 'N', sku: 's', unitPrice: 130, basePrice: 150, pricingTiers: [{ id: 10, minQuantity: 10, price: 130 }], quantity: 10, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null };
    beforeEach(() => {
      vi.mocked(fetchCatalog).mockImplementation(async (_p, w) => ({ products: [w ? priced(200, 180) : priced(150, 130)], categories: [] }) as unknown as Catalog);
    });

    it('follows the chosen warehouse, and back to the default', async () => {
      queryClient.setQueryData(SETTINGS_KEY, settings(true));
      useCartStore.setState({ lines: [guestLine], mode: 'local' });
      mount();
      await waitFor(() => expect(useWarehouseStore.getState().ctx.list).toEqual(LIST));
      act(() => useWarehouseStore.getState().choose(2));
      await waitFor(() => expect(useCartStore.getState().lines[0]).toMatchObject({ basePrice: 200, unitPrice: 180, quantity: 10 }));
      act(() => useWarehouseStore.getState().choose(null));
      await waitFor(() => expect(useCartStore.getState().lines[0]).toMatchObject({ basePrice: 150, unitPrice: 130 }));
    });

    it('corrects a basket persisted under another warehouse on first load', async () => {
      queryClient.setQueryData(SETTINGS_KEY, settings(true));
      useWarehouseStore.setState({ warehouseId: 2 });
      useCartStore.setState({ lines: [guestLine], mode: 'local' });
      mount();
      await waitFor(() => expect(useCartStore.getState().lines[0]).toMatchObject({ basePrice: 200, unitPrice: 180 }));
    });

    const serverItem = (unitPrice: number) => ({ productId: 4, name: 'N', quantity: 10, unitPrice, lineTotal: unitPrice * 10, imageUrl: null, isPreorder: false, outOfStock: false, priceChanged: false, inactive: false, belowMin: false, aboveMax: false, minOrderQuantity: null, maxOrderQuantity: null });

    it('re-bases a signed-in cart from the catalogue but never touches the server\'s unit price', async () => {
      queryClient.setQueryData(SETTINGS_KEY, settings(true));
      useSessionStore.getState().setSession('tok', { id: 1, nickname: 'A' });
      useWarehouseStore.setState({ warehouseId: 2 });
      useCartStore.setState({ lines: [guestLine], mode: 'server' });
      vi.mocked(fetchCart).mockResolvedValue({ items: [serverItem(130)], subtotal: 1300, itemCount: 10 });
      mount();
      await waitFor(() => expect(fetchCatalog).toHaveBeenCalledWith(true, 2));
      await waitFor(() => expect(useCartStore.getState().lines[0]).toMatchObject({ basePrice: 200, unitPrice: 130, quantity: 10 }));
      expect(useCartStore.getState().lines[0]!.pricingTiers).toEqual([{ id: 10, minQuantity: 10, price: 180 }]);
    });

    it('a server refresh that brings the lines back does not restore the previous warehouse\'s metadata', async () => {
      queryClient.setQueryData(SETTINGS_KEY, settings(true));
      useSessionStore.getState().setSession('tok', { id: 1, nickname: 'A' });
      useWarehouseStore.setState({ warehouseId: 2 });
      useCartStore.setState({ lines: [guestLine], mode: 'server' });
      vi.mocked(fetchCart).mockResolvedValue({ items: [serverItem(180)], subtotal: 1800, itemCount: 10 });
      mount();
      await waitFor(() => expect(useCartStore.getState().lines[0]).toMatchObject({ basePrice: 200 }));
      // The server's answer lands after the catalogue's: a line this browser never held falls back to basePrice = unitPrice.
      act(() => useCartStore.getState().replaceFromServer({ items: [serverItem(180)], subtotal: 1800, itemCount: 10 }));
      await waitFor(() => expect(useCartStore.getState().lines[0]).toMatchObject({ basePrice: 200, unitPrice: 180 }));
      act(() => useCartStore.setState({ lines: [] }));
      act(() => useCartStore.getState().replaceFromServer({ items: [serverItem(180)], subtotal: 1800, itemCount: 10 }));
      await waitFor(() => expect(useCartStore.getState().lines[0]).toMatchObject({ basePrice: 200, unitPrice: 180 }));
      expect(useCartStore.getState().lines[0]!.pricingTiers).toEqual([{ id: 10, minQuantity: 10, price: 180 }]);
    });

    it('feature off: a signed-in shopper\'s basket triggers no catalogue read and keeps its lines', async () => {
      queryClient.setQueryData(SETTINGS_KEY, settings(false));
      useSessionStore.getState().setSession('tok', { id: 1, nickname: 'A' });
      useCartStore.setState({ lines: [guestLine], mode: 'server' });
      render(<QueryClientProvider client={queryClient}><WarehouseSync /></QueryClientProvider>);
      await new Promise((r) => setTimeout(r, 30));
      expect(fetchCatalog).not.toHaveBeenCalled();
      expect(fetchWarehouses).not.toHaveBeenCalled();
      expect(useCartStore.getState().lines[0]).toMatchObject({ basePrice: 150, unitPrice: 130 });
    });

    it('feature off: no catalogue read on account of the basket, lines untouched', async () => {
      queryClient.setQueryData(SETTINGS_KEY, settings(false));
      useCartStore.setState({ lines: [guestLine], mode: 'local' });
      render(<QueryClientProvider client={queryClient}><WarehouseSync /></QueryClientProvider>);
      await new Promise((r) => setTimeout(r, 30));
      expect(fetchCatalog).not.toHaveBeenCalled();
      expect(useCartStore.getState().lines[0]).toMatchObject({ basePrice: 150, unitPrice: 130 });
    });
  });
});
