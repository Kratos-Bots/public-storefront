import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));
vi.mock('@/app/layout.ts', () => ({ useEffectiveLayout: () => 'storefront' }));
vi.mock('@/app/builder-gate.ts', () => ({ isBuilderMode: vi.fn(() => false) }));
vi.mock('@/app/preview-listener.ts', () => ({ isPreviewMode: vi.fn(() => false) }));
vi.mock('@/templates/hooks.ts', async (orig) => ({
  ...(await orig<typeof import('@/templates/hooks.ts')>()),
  useCoreOptions: () => ({ showMobileBottomNav: true }),
}));

import { api } from '@/api/client.ts';
import { faqAvailableAt } from '@/features/faq/settings.ts';
import { FAQ_KEY, faqKey, useFaq } from '@/features/faq/queries.ts';
import { useFaqAvailable } from '@/features/faq/use-faq-available.ts';
import { BottomNav } from '@/layouts/BottomNav.tsx';
import { useWarehouseStore, resetWarehouseStore } from '@/features/warehouses/store.ts';
import { useSessionStore } from '@/stores/session.ts';
import type { Warehouse } from '@/types/warehouses.ts';

const wh = (id: number, extra: Partial<Warehouse> = {}): Warehouse => ({ id, name: `Site ${id}`, country: null, isDefault: id === 1, ...extra });
const list = (...rows: Warehouse[]) => rows;

describe('faqAvailableAt', () => {
  const shop = (available: boolean | undefined) => ({ faq: available === undefined ? undefined : { available } });

  it('uses the shop value when the warehouse row says null, or has no faq key (an older backend)', () => {
    expect(faqAvailableAt(shop(true), wh(2, { faq: null }))).toBe(true);
    expect(faqAvailableAt(shop(false), wh(2, { faq: null }))).toBe(false);
    expect(faqAvailableAt(shop(true), wh(2))).toBe(true);
    expect(faqAvailableAt(shop(false), wh(2))).toBe(false);
  });
  it('uses the row own value when it has one, whatever the shop says', () => {
    expect(faqAvailableAt(shop(false), wh(2, { faq: { available: true } }))).toBe(true);
    expect(faqAvailableAt(shop(true), wh(2, { faq: { available: false } }))).toBe(false);
  });
  it('uses the shop value with no selected warehouse row (picker off, no selection, list still loading)', () => {
    expect(faqAvailableAt(shop(true), null)).toBe(true);
    expect(faqAvailableAt(shop(true), undefined)).toBe(true);
    expect(faqAvailableAt(shop(false), null)).toBe(false);
  });
  it('reads a malformed row faq as the shop value, and an older shop (no faq) as false', () => {
    expect(faqAvailableAt(shop(true), wh(2, { faq: {} as never }))).toBe(true);
    expect(faqAvailableAt(shop(true), wh(2, { faq: { available: 'no' } as never }))).toBe(true);
    expect(faqAvailableAt(shop(undefined), null)).toBe(false);
    expect(faqAvailableAt(undefined, null)).toBe(false);
  });
});

function envelopeOf(sections: unknown[]) {
  return new Response(JSON.stringify({ success: true, data: { sections }, error: null }), { headers: { 'content-type': 'application/json' } });
}
const wrapper = (client: QueryClient) => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const fresh = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** Put the warehouse picker "on" with this list; `chosen` is the shopper's stored choice. */
function pickWarehouses(rows: Warehouse[], chosen: number | null) {
  useWarehouseStore.setState({ warehouseId: chosen, ctx: { enabled: true, list: rows, failed: false, carried: null } });
}

beforeEach(() => {
  h.settings = { currency: 'GBP', features: { accounts: true, ordering: true }, reviews: { enabled: true, maxLength: 500 }, faq: { available: true } };
  resetWarehouseStore();
  useSessionStore.setState({ token: null, customer: null });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetWarehouseStore();
});

describe('useFaq request and key', () => {
  it('asks for storefront/faq with no query string when nothing is selected (the key stays the plain one)', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation((async () => envelopeOf([])) as never);
    const client = fresh();
    const { result } = renderHook(() => useFaq(true), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('storefront/faq');
    expect(FAQ_KEY).toEqual(['faq']);
    expect(faqKey(null)).toEqual(['faq']);
    expect(client.getQueryCache().find({ queryKey: ['faq'], exact: true })).toBeDefined();
  });

  it('sends ?warehouse=<id> for a selected warehouse and keys the query on it', async () => {
    pickWarehouses(list(wh(1), wh(2)), 2);
    const get = vi.spyOn(api, 'get').mockImplementation((async () => envelopeOf([])) as never);
    const client = fresh();
    const { result } = renderHook(() => useFaq(true), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith('storefront/faq', { searchParams: { warehouse: 2 } });
    expect(faqKey(2)).toEqual(['faq', 2]);
    expect(client.getQueryCache().find({ queryKey: ['faq', 2], exact: true })).toBeDefined();
  });

  it('sends nothing when the stored choice is the default warehouse or the picker is off', async () => {
    pickWarehouses(list(wh(1), wh(2)), 1);
    const get = vi.spyOn(api, 'get').mockImplementation((async () => envelopeOf([])) as never);
    const { result } = renderHook(() => useFaq(true), { wrapper: wrapper(fresh()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenLastCalledWith('storefront/faq');
    cleanup();
    useWarehouseStore.setState({ warehouseId: 2, ctx: { enabled: false, list: null, failed: false, carried: null } });
    const again = renderHook(() => useFaq(true), { wrapper: wrapper(fresh()) });
    await waitFor(() => expect(again.result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenLastCalledWith('storefront/faq');
  });

  it('refetches when the shopper changes warehouse', async () => {
    pickWarehouses(list(wh(1), wh(2), wh(3)), 2);
    const get = vi.spyOn(api, 'get').mockImplementation((async () => envelopeOf([])) as never);
    const { result } = renderHook(() => useFaq(true), { wrapper: wrapper(fresh()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    useWarehouseStore.getState().choose(3);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(get).toHaveBeenLastCalledWith('storefront/faq', { searchParams: { warehouse: 3 } });
  });
});

describe('useFaqAvailable', () => {
  const probe = () => renderHook(() => useFaqAvailable(), { wrapper: wrapper(fresh()) }).result.current;

  it('follows the shop with no selection', () => {
    expect(probe()).toBe(true);
    h.settings = { ...h.settings, faq: { available: false } };
    expect(probe()).toBe(false);
  });
  it('follows the selected warehouse own FAQ, available or not', () => {
    h.settings = { ...h.settings, faq: { available: false } };
    pickWarehouses(list(wh(1), wh(2, { faq: { available: true } })), 2);
    expect(probe()).toBe(true);
    h.settings = { ...h.settings, faq: { available: true } };
    pickWarehouses(list(wh(1), wh(2, { faq: { available: false } })), 2);
    expect(probe()).toBe(false);
  });
  it('follows the shop for a warehouse on the shop FAQ (faq null), for an older backend row, and while the list loads', () => {
    pickWarehouses(list(wh(1), wh(2, { faq: null })), 2);
    expect(probe()).toBe(true);
    pickWarehouses(list(wh(1), wh(2)), 2);
    expect(probe()).toBe(true);
    useWarehouseStore.setState({ warehouseId: 2, ctx: { enabled: true, list: null, failed: false, carried: null } });
    expect(probe()).toBe(true);
  });
  it('ignores a warehouse own FAQ while the picker is off', () => {
    useWarehouseStore.setState({ warehouseId: 2, ctx: { enabled: false, list: list(wh(1), wh(2, { faq: { available: false } })), failed: false, carried: null } });
    expect(probe()).toBe(true);
  });
  it('ignores the default warehouse row (choosing it is choosing nothing)', () => {
    pickWarehouses(list(wh(1, { faq: { available: false } }), wh(2)), null);
    expect(probe()).toBe(true);
  });
});

describe('a stored warehouse the list does not offer', () => {
  it('reads the shop value and asks for the FAQ with no warehouse parameter once the list has loaded', async () => {
    h.settings = { ...h.settings, faq: { available: true } };
    pickWarehouses(list(wh(1), wh(2, { faq: { available: false } })), 5);
    expect(renderHook(() => useFaqAvailable(), { wrapper: wrapper(fresh()) }).result.current).toBe(true);
    const get = vi.spyOn(api, 'get').mockImplementation((async () => envelopeOf([])) as never);
    const { result } = renderHook(() => useFaq(true), { wrapper: wrapper(fresh()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith('storefront/faq');
  });
});

describe('the bottom bar and the selected warehouse', () => {
  const mount = () => render(<MemoryRouter><BottomNav /></MemoryRouter>);
  const labels = () => within(screen.getByRole('navigation', { name: 'Shop menu' })).getAllByRole('link').map((a) => a.textContent);

  // Help is one item for tickets and the FAQ together: no warehouse's FAQ setting adds or removes it.
  it.each([
    ['an own FAQ the shop lacks', { faq: { available: true } }, { faq: { available: false } }],
    ['an own FAQ that is unavailable', { faq: { available: false } }, undefined],
    ['faq null', { faq: null }, undefined],
  ])('keeps the same Help item at a warehouse with %s', (_name, over, shopFaq) => {
    if (shopFaq) h.settings = { ...h.settings, ...shopFaq };
    pickWarehouses(list(wh(1), wh(2, over)), 2);
    mount();
    expect(labels()).toEqual(['Catalog', 'Profile', 'Cart', 'Reviews', 'Help']);
  });
});
