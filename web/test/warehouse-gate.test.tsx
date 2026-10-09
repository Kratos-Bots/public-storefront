import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';

import { SETTINGS_KEY, queryClient } from '@/lib/query-client.ts';
import { resetWarehouseStore, useWarehouseStore } from '@/features/warehouses/store.ts';
import { resetVisitMarker } from '@/features/warehouses/visit.ts';
import { WarehouseGate } from '@/features/warehouses/WarehouseGate.tsx';
import type { Warehouse } from '@/types/warehouses.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

const MAIN: Warehouse = { id: 1, name: 'Main', country: 'GB', isDefault: true };
const EU: Warehouse = { id: 2, name: 'Test EU', country: 'DE', isDefault: false };
const LIST = [MAIN, EU];
const MARKER = 'sf-warehouse-visit-v1';

function settings(features: Record<string, unknown> = {}): StorefrontSettings {
  return {
    enabled: true,
    brand: {
      name: 'Kratos', shortName: 'KRATOS', tagline: '', title: 'Kratos', description: '',
      logoUrl: null, faviconUrl: null, logoHeight: 28, links: { whatsapp: null, telegram: null },
    },
    features: { warehouseSelect: true, warehousePrompt: true, ...features },
    access: { storefront: 'public' },
  } as unknown as StorefrontSettings;
}

function setStore(over: Partial<ReturnType<typeof useWarehouseStore.getState>['ctx']> = {}, stored: number | null = null) {
  useWarehouseStore.setState({ warehouseId: stored, ctx: { enabled: true, list: LIST, failed: false, carried: null, ...over } });
}

function mount(at = '/', features?: Record<string, unknown>) {
  queryClient.setQueryData(SETTINGS_KEY, settings(features));
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider env="test">
        <MemoryRouter initialEntries={[at]}>
          <WarehouseGate><p>catalogue</p></WarehouseGate>
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

const heading = () => screen.queryByRole('heading', { name: 'Where should we ship from?' });

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  resetVisitMarker();
  resetWarehouseStore();
  queryClient.clear();
});
afterEach(() => cleanup());

describe('WarehouseGate', () => {
  it('asks first: a heading and one button per warehouse, and no catalogue behind it', () => {
    setStore();
    const { container } = mount();
    expect(heading()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Shop from Main' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Shop from Test EU' })).toBeTruthy();
    expect(screen.queryByText('catalogue')).toBeNull();
    expect(container.querySelector('[data-warehouse-prompt]')).not.toBeNull();
    expect(document.activeElement).toBe(heading());
  });

  it('choosing the non-default warehouse stores it, marks the visit and shows the catalogue', () => {
    setStore();
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Shop from Test EU' }));
    expect(useWarehouseStore.getState().warehouseId).toBe(2);
    expect(sessionStorage.getItem(MARKER)).toBe('1');
    expect(screen.getByText('catalogue')).toBeTruthy();
    expect(heading()).toBeNull();
  });

  it('choosing the default warehouse stores null, marks the visit and shows the catalogue', () => {
    setStore({}, 2);
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Shop from Main' }));
    expect(useWarehouseStore.getState().warehouseId).toBeNull();
    expect(sessionStorage.getItem(MARKER)).toBe('1');
    expect(screen.getByText('catalogue')).toBeTruthy();
  });

  it('asks again on a new visit without pre-selecting, and tags the previous non-default choice', () => {
    setStore({}, 2);
    mount();
    expect(heading()).not.toBeNull();
    for (const b of screen.getAllByRole('button')) expect(b.getAttribute('aria-pressed')).not.toBe('true');
    const eu = screen.getByRole('button', { name: 'Shop from Test EU' });
    expect(eu.textContent).toContain('Your last choice');
    expect(screen.getByRole('button', { name: 'Shop from Main' }).textContent).not.toContain('Your last choice');
  });

  it('labels a paused warehouse with its badge and message and keeps it selectable', () => {
    setStore({ list: [MAIN, { ...EU, orderingEnabled: false, orderingMessage: 'Back Monday' }] });
    mount();
    const eu = screen.getByRole('button', { name: 'Shop from Test EU' }) as HTMLButtonElement;
    expect(eu.textContent).toContain('Not taking orders');
    expect(eu.textContent).toContain('Back Monday');
    expect(eu.disabled).toBe(false);
    fireEvent.click(eu);
    expect(screen.getByText('catalogue')).toBeTruthy();
  });

  it('falls back to the shop-wide notice for a paused warehouse with no message of its own', () => {
    setStore({ list: [MAIN, { ...EU, orderingEnabled: false }] });
    mount();
    expect(screen.getByRole('button', { name: 'Shop from Test EU' }).textContent).toContain('Test EU is not taking orders right now.');
  });

  it('never interrupts a route outside the catalogue', () => {
    setStore();
    mount('/account/orders/ORD-1');
    expect(screen.getByText('catalogue')).toBeTruthy();
    expect(heading()).toBeNull();
  });

  it('waits while the list loads (neither catalogue nor chooser) and fails open when it failed', () => {
    setStore({ list: null });
    mount();
    expect(screen.queryByText('catalogue')).toBeNull();
    expect(heading()).toBeNull();
    act(() => useWarehouseStore.setState({ ctx: { enabled: true, list: null, failed: true, carried: null } }));
    expect(screen.getByText('catalogue')).toBeTruthy();
  });

  it('does nothing with features.warehousePrompt off', () => {
    setStore();
    mount('/', { warehousePrompt: false });
    expect(screen.getByText('catalogue')).toBeTruthy();
    expect(heading()).toBeNull();
  });
});
