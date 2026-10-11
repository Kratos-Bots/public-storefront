import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import type { ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';

const h = vi.hoisted(() => ({
  settings: {} as StorefrontSettings,
  bar: true,
  account: 'all' as string,
  cart: 'all' as string,
}));
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
  return {
    ...real,
    useCoreOptions: () => ({
      ...real.useCoreOptions(), showMobileBottomNav: h.bar,
      headerAccountIcon: h.account as 'all', headerCartIcon: h.cart as 'all',
    }),
  };
});

import { isBuilderMode } from '@/app/builder-gate.ts';
import { isPreviewMode } from '@/app/preview-listener.ts';
import { useBottomNavShown } from '@/layouts/bottom-nav-rules.ts';
import { StorefrontHeader } from '@/layouts/StorefrontShell.tsx';
import { MenuHeader } from '@/layouts/MenuShell.tsx';
import { WebAppHeader } from '@/layouts/WebAppShell.tsx';

/** `phone` = the viewport is narrower than 62em, so `(min-width: 62em)` does not match. */
function setViewport(phone: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width: 62em') ? !phone : false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

function settings() {
  h.settings = {
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [], reviews: { enabled: true, maxLength: 500 },
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
  } as unknown as StorefrontSettings;
}
function mount(element: ReactNode, path = '/') {
  settings();
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [path] });
  return render(<MantineProvider env="test"><RouterProvider router={router} /></MantineProvider>);
}
const account = () => screen.queryByRole('link', { name: 'Sign in' });
const cart = () => screen.queryByRole('link', { name: /^Cart,/ });

beforeEach(() => {
  h.bar = true;
  h.account = 'all';
  h.cart = 'all';
  setViewport(true);
  vi.mocked(isBuilderMode).mockReturnValue(false);
  vi.mocked(isPreviewMode).mockReturnValue(false);
});
afterEach(cleanup);

function shown(path = '/') {
  return renderHook(() => useBottomNavShown(), { wrapper: ({ children }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter> }).result.current;
}

describe('useBottomNavShown', () => {
  it('is true on a phone with the option on, on a page the bar belongs on', () => {
    expect(shown('/')).toBe(true);
    expect(shown('/account/orders')).toBe(true);
  });
  it('is false at 62em and wider', () => {
    setViewport(false);
    expect(shown('/')).toBe(false);
  });
  it('is false with the option off', () => {
    h.bar = false;
    expect(shown('/')).toBe(false);
  });
  it.each(['/checkout', '/login', '/order-placed/ref-1'])('is false on %s', (path) => {
    expect(shown(path)).toBe(false);
  });
  it('is false in the page builder and in a theme preview', () => {
    vi.mocked(isBuilderMode).mockReturnValue(true);
    expect(shown()).toBe(false);
    vi.mocked(isBuilderMode).mockReturnValue(false);
    vi.mocked(isPreviewMode).mockReturnValue(true);
    expect(shown()).toBe(false);
  });
});

describe.each([['storefront', <StorefrontHeader key="s" />], ['menu', <MenuHeader key="m" />], ['webapp', <WebAppHeader key="w" />]] as const)(
  'the %s header', (_layout, header) => {
    it('has no Account or Cart button where the bar is on screen, whatever the header icon options say', () => {
      mount(header);
      expect(account()).toBeNull();
      expect(cart()).toBeNull();
      cleanup();
      h.account = 'mobile';
      h.cart = 'mobile';
      mount(header);
      expect(account()).toBeNull();
      expect(cart()).toBeNull();
    });
    it('keeps both on a desktop viewport', () => {
      setViewport(false);
      mount(header);
      expect(account()).not.toBeNull();
      expect(cart()).not.toBeNull();
    });
    it('keeps both when the bar option is off', () => {
      h.bar = false;
      mount(header);
      expect(account()).not.toBeNull();
      expect(cart()).not.toBeNull();
    });
    it.each(['/checkout', '/login'])('keeps both on %s, where the bar never shows', (path) => {
      mount(header, path);
      expect(account()).not.toBeNull();
      expect(cart()).not.toBeNull();
    });
    it('keeps both in the page builder and in a theme preview', () => {
      vi.mocked(isBuilderMode).mockReturnValue(true);
      mount(header);
      expect(account()).not.toBeNull();
      expect(cart()).not.toBeNull();
      cleanup();
      vi.mocked(isBuilderMode).mockReturnValue(false);
      vi.mocked(isPreviewMode).mockReturnValue(true);
      mount(header);
      expect(account()).not.toBeNull();
      expect(cart()).not.toBeNull();
    });
  },
);
