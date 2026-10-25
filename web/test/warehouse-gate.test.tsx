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

function settings(features: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): StorefrontSettings {
  return {
    enabled: true,
    brand: {
      name: 'Kratos', shortName: 'KRATOS', tagline: '', title: 'Kratos', description: '',
      logoUrl: null, faviconUrl: null, logoHeight: 28, links: { whatsapp: null, telegram: null },
    },
    features: { warehouseSelect: true, warehousePrompt: true, ...features },
    access: { storefront: 'public' },
    supportLinks: [],
    ...extra,
  } as unknown as StorefrontSettings;
}

function setStore(over: Partial<ReturnType<typeof useWarehouseStore.getState>['ctx']> = {}, stored: number | null = null) {
  useWarehouseStore.setState({ warehouseId: stored, ctx: { enabled: true, list: LIST, failed: false, groups: null, carried: null, ...over } });
}

function mount(at = '/', features?: Record<string, unknown>, extra?: Record<string, unknown>) {
  queryClient.setQueryData(SETTINGS_KEY, settings(features, extra));
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

describe('WarehouseGate Need help link', () => {
  const link = () => screen.queryByRole('link', { name: 'Need help?' });

  it.each([
    ['support tickets are on', { support: { enabled: true } }],
    ['the shop has an FAQ', { faq: { available: true } }],
    ['the shop has a support link', { supportLinks: [{ label: 'Help centre', url: 'https://help.example.invalid/' }] }],
    ['the shop has a WhatsApp chat', { brand: { ...settings().brand, links: { whatsapp: 'https://wa.me/447700900000', telegram: null } } }],
    ['the shop has a Telegram chat', { brand: { ...settings().brand, links: { whatsapp: null, telegram: 'https://t.me/shop_example' } } }],
  ])('links to /help below the list when %s', (_name, extra) => {
    setStore();
    mount('/', undefined, extra);
    expect(link()).not.toBeNull();
    expect(link()!.getAttribute('href')).toBe('/help');
  });

  it('is not there when Help has nothing to offer', () => {
    setStore();
    mount('/', undefined, { support: { enabled: false } });
    expect(link()).toBeNull();
  });

  it('is not a warehouse choice: following it does not pick one', () => {
    setStore();
    mount('/', undefined, { support: { enabled: true } });
    fireEvent.click(link()!);
    expect(useWarehouseStore.getState().warehouseId).toBeNull();
    expect(sessionStorage.getItem(MARKER)).toBeNull();
  });
});

describe('WarehouseGate groups', () => {
  const CHINA: Warehouse = { id: 10, name: 'China', country: 'CN', isDefault: false };
  const UK1: Warehouse = { id: 11, name: 'UK1', country: 'GB', isDefault: false, groupId: 7 };
  const UK2: Warehouse = { id: 12, name: 'UK2', country: 'GB', isDefault: false, groupId: 7 };
  const RAWS: Warehouse = { id: 13, name: 'Raws', country: null, isDefault: false };
  const EU1: Warehouse = { id: 14, name: 'EU1', country: 'DE', isDefault: false };
  const GROUPS = [{ id: 7, name: 'UK Warehouses', description: 'Ships from the UK in 1 to 2 days.' }];
  const grouped = (stored: number | null = null) => setStore({ list: [CHINA, UK2, UK1, RAWS, EU1], groups: GROUPS }, stored);
  const group = () => screen.getByRole('button', { name: 'See warehouses in UK Warehouses' });

  it('shows the group as one card on the top screen, with its count, and none of its members', () => {
    grouped();
    mount();
    expect(group().textContent).toContain('UK Warehouses');
    expect(group().textContent).toContain('2 warehouses');
    expect(screen.getByRole('button', { name: 'Shop from China' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Shop from Raws' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Shop from EU1' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Shop from UK1' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Shop from UK2' })).toBeNull();
  });

  it('opens a group to its own screen without choosing, and Back returns', () => {
    grouped();
    mount();
    fireEvent.click(group());
    expect(screen.getByRole('heading', { name: 'UK Warehouses' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'UK Warehouses' }));
    expect(screen.getByText('Ships from the UK in 1 to 2 days.')).toBeTruthy();
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names.filter((n) => n?.startsWith('Shop from'))).toEqual(['Shop from UK2', 'Shop from UK1']);
    expect(screen.queryByRole('button', { name: 'Shop from China' })).toBeNull();
    expect(sessionStorage.getItem(MARKER)).toBeNull();
    expect(useWarehouseStore.getState().warehouseId).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(heading()).not.toBeNull();
    expect(group()).toBeTruthy();
    expect(document.activeElement).toBe(heading());
    expect(sessionStorage.getItem(MARKER)).toBeNull();
  });

  it('picking a member stores it and marks the visit', () => {
    grouped();
    mount();
    fireEvent.click(group());
    fireEvent.click(screen.getByRole('button', { name: 'Shop from UK1' }));
    expect(useWarehouseStore.getState().warehouseId).toBe(11);
    expect(sessionStorage.getItem(MARKER)).toBe('1');
    expect(screen.getByText('catalogue')).toBeTruthy();
  });

  it('tags the group card when the last choice was one of its warehouses', () => {
    grouped(11);
    mount();
    expect(group().textContent).toContain('Your last choice');
    expect(screen.getByRole('button', { name: 'Shop from China' }).textContent).not.toContain('Your last choice');
  });

  it('falls back to the top screen when the open group collapses to one warehouse', () => {
    grouped();
    mount();
    fireEvent.click(group());
    act(() => setStore({ list: [CHINA, UK1, RAWS, EU1], groups: GROUPS }));
    expect(heading()).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Shop from UK1' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('leaves out the lede when the group has no description', () => {
    setStore({ list: [CHINA, UK2, UK1], groups: [{ id: 7, name: 'UK Warehouses', description: null }] });
    const { container } = mount();
    fireEvent.click(group());
    expect(container.querySelector('p')).toBeNull();
  });
});

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

  it('shows a warehouse description under its name, only on the cards that have one', () => {
    setStore({ list: [MAIN, { ...EU, description: 'Ships from Berlin in 2 to 4 working days.' }] });
    mount();
    const eu = screen.getByRole('button', { name: 'Shop from Test EU' });
    expect(eu.textContent).toContain('Ships from Berlin in 2 to 4 working days.');
    expect(screen.getByRole('button', { name: 'Shop from Main' }).textContent).toBe('Main · GB');
    // The sentence is the card's description for assistive tech; the accessible name stays the action.
    const about = document.getElementById(eu.getAttribute('aria-describedby')!)!;
    expect(about.textContent).toBe('Ships from Berlin in 2 to 4 working days.');
  });

  it.each([null, undefined, '', '   '])('draws nothing for a description of %j', (description) => {
    setStore({ list: [MAIN, { ...EU, description }] });
    mount();
    const eu = screen.getByRole('button', { name: 'Shop from Test EU' });
    expect(eu.textContent).toBe('Test EU · DE');
    expect(eu.getAttribute('aria-describedby')).toBeNull();
  });

  it('keeps the paused note beside a description, and describes the card by both', () => {
    setStore({ list: [MAIN, { ...EU, description: 'Ships from Berlin.', orderingEnabled: false, orderingMessage: 'Back Monday' }] });
    mount();
    const eu = screen.getByRole('button', { name: 'Shop from Test EU' });
    expect(eu.textContent).toContain('Ships from Berlin.');
    expect(eu.textContent).toContain('Back Monday');
    expect(eu.getAttribute('aria-describedby')!.split(' ')).toHaveLength(2);
  });

  it('labels a paused warehouse with its badge and message and keeps it selectable', () => {
    setStore({ list: [MAIN, { ...EU, orderingEnabled: false, orderingMessage: 'Back Monday' }] });
    mount();
    const eu = screen.getByRole('button', { name: 'Shop from Test EU' }) as HTMLButtonElement;
    expect(eu.textContent).toContain('Not taking orders');
    expect(eu.textContent).toContain('Back Monday');
    // The generic sentence belongs to the in-shop notice, not the card: a message replaces nothing, so it is never doubled.
    expect(eu.textContent).not.toContain('is not taking orders right now');
    expect(eu.disabled).toBe(false);
    fireEvent.click(eu);
    expect(screen.getByText('catalogue')).toBeTruthy();
  });

  it('shows only the badge on a paused warehouse with no message of its own', () => {
    setStore({ list: [MAIN, { ...EU, orderingEnabled: false }] });
    mount();
    const text = screen.getByRole('button', { name: 'Shop from Test EU' }).textContent;
    expect(text).toContain('Not taking orders');
    expect(text).not.toContain('is not taking orders right now');
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
    act(() => useWarehouseStore.setState({ ctx: { enabled: true, list: null, failed: true, groups: null, carried: null } }));
    expect(screen.getByText('catalogue')).toBeTruthy();
  });

  it('does nothing with features.warehousePrompt off', () => {
    setStore();
    mount('/', { warehousePrompt: false });
    expect(screen.getByText('catalogue')).toBeTruthy();
    expect(heading()).toBeNull();
  });
});
