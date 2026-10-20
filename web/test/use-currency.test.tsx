import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SETTINGS_KEY, queryClient } from '@/lib/query-client.ts';
import { resetWarehouseStore, useWarehouseStore } from '@/features/warehouses/store.ts';
import { useCurrency } from '@/features/warehouses/use-currency.ts';
import type { Warehouse } from '@/types/warehouses.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

const MAIN: Warehouse = { id: 1, name: 'Main', country: 'GB', isDefault: true, currency: 'GBP' };
const EU: Warehouse = { id: 2, name: 'EU', country: 'DE', isDefault: false, currency: 'EUR' };
const US: Warehouse = { id: 3, name: 'US', country: 'US', isDefault: false, currency: 'USD' };

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

function setSettings(warehouseSelect: boolean) {
  queryClient.setQueryData(SETTINGS_KEY, { currency: 'GBP', features: { warehouseSelect }, access: { storefront: 'public' } } as unknown as StorefrontSettings);
}

beforeEach(() => {
  localStorage.clear();
  resetWarehouseStore();
  queryClient.clear();
});
afterEach(() => cleanup());

describe('useCurrency', () => {
  it("returns the selected warehouse's currency and follows a switch", () => {
    setSettings(true);
    useWarehouseStore.setState({ warehouseId: 2, ctx: { enabled: true, list: [MAIN, EU, US], failed: false, carried: null } });
    const { result } = renderHook(() => useCurrency(), { wrapper });
    expect(result.current).toBe('EUR');
    act(() => useWarehouseStore.getState().choose(3));
    expect(result.current).toBe('USD');
    act(() => useWarehouseStore.getState().choose(null));
    expect(result.current).toBe('GBP');
  });

  it('falls back to the shop currency with the picker off', () => {
    setSettings(false);
    useWarehouseStore.setState({ warehouseId: 2, ctx: { enabled: false, list: [MAIN, EU], failed: false, carried: null } });
    const { result } = renderHook(() => useCurrency(), { wrapper });
    expect(result.current).toBe('GBP');
  });

  it('falls back to the shop currency when an older backend sends no warehouse currency', () => {
    setSettings(true);
    const old = { id: 2, name: 'EU', country: 'DE', isDefault: false } as Warehouse;
    useWarehouseStore.setState({ warehouseId: 2, ctx: { enabled: true, list: [MAIN, old], failed: false, carried: null } });
    const { result } = renderHook(() => useCurrency(), { wrapper });
    expect(result.current).toBe('GBP');
  });
});
