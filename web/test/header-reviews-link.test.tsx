import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';

const h = vi.hoisted(() => ({ settings: {} as StorefrontSettings, bottomNav: true }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));
vi.mock('@/app/builder-gate.ts', () => ({ isBuilderMode: vi.fn(() => false) }));
vi.mock('@/app/preview-listener.ts', () => ({ isPreviewMode: vi.fn(() => false) }));
vi.mock('@/components/Brand.tsx', () => ({ Brand: () => <span>brand</span> }));
vi.mock('@/features/notices/NoticeBanners.tsx', () => ({ NoticeBanners: () => null }));
vi.mock('@/features/warehouses/WarehouseBar.tsx', () => ({ WarehouseBar: () => null }));
vi.mock('@/features/webapp/useTelegramChrome.ts', () => ({ isFirstHistoryEntry: () => true }));
vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => false }));
vi.mock('@/templates/runtime.tsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/templates/runtime.tsx')>()),
  Slot: () => null,
}));
vi.mock('@/templates/hooks.ts', async (orig) => {
  const real = await orig<typeof import('@/templates/hooks.ts')>();
  return { ...real, useCoreOptions: () => ({ ...real.useCoreOptions(), showMobileBottomNav: h.bottomNav }) };
});

import { isBuilderMode } from '@/app/builder-gate.ts';
import { isPreviewMode } from '@/app/preview-listener.ts';
import { StorefrontHeader } from '@/layouts/StorefrontShell.tsx';
import { MenuHeader } from '@/layouts/MenuShell.tsx';
import { WebAppHeader } from '@/layouts/WebAppShell.tsx';

function mount(element: ReactNode, reviews: { enabled: boolean; maxLength: number } | null = { enabled: true, maxLength: 500 }) {
  h.settings = {
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [], reviews: reviews ?? undefined,
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
  } as unknown as StorefrontSettings;
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: ['/'] });
  return render(<MantineProvider env="test"><RouterProvider router={router} /></MantineProvider>);
}
const link = () => screen.queryByRole('link', { name: 'Reviews' });

beforeEach(() => {
  h.bottomNav = true;
  vi.mocked(isBuilderMode).mockReturnValue(false);
  vi.mocked(isPreviewMode).mockReturnValue(false);
});
afterEach(cleanup);

describe('the header Reviews link', () => {
  it.each([['storefront', <StorefrontHeader key="s" />], ['menu', <MenuHeader key="m" />], ['webapp', <WebAppHeader key="w" />]] as const)(
    'is in the %s header, pointing at the reviews page', (_layout, header) => {
      mount(header);
      expect(link()?.getAttribute('href')).toBe('/reviews');
      expect(link()!.closest('header')).not.toBeNull();
    });
  it('is hidden below 62em while the bottom bar carries Reviews, and shown at every width once the bar is off', () => {
    mount(<StorefrontHeader />);
    expect(link()!.className).toMatch(/sf-hide-mobile/);
    cleanup();
    h.bottomNav = false;
    mount(<StorefrontHeader />);
    expect(link()!.className).not.toMatch(/sf-hide-mobile/);
  });
  it.each([[{ enabled: false, maxLength: 0 }], [null]])('is absent when reviews are off (%j)', (reviews) => {
    mount(<StorefrontHeader />, reviews);
    expect(link()).toBeNull();
  });
  it('is absent in the page builder and in a theme preview', () => {
    vi.mocked(isBuilderMode).mockReturnValue(true);
    mount(<StorefrontHeader />);
    expect(link()).toBeNull();
    cleanup();
    vi.mocked(isBuilderMode).mockReturnValue(false);
    vi.mocked(isPreviewMode).mockReturnValue(true);
    mount(<StorefrontHeader />);
    expect(link()).toBeNull();
  });
  it('comes after the header\'s own navigation and before the search and the actions', () => {
    mount(<StorefrontHeader nav={<a href="/pages/our-story">Our story</a>} />);
    const links = screen.getAllByRole('link').map((a) => a.textContent);
    expect(links.indexOf('Our story')).toBe(links.indexOf('brand') + 1);
    expect(links.indexOf('Reviews')).toBe(links.indexOf('Our story') + 1);
  });
});
