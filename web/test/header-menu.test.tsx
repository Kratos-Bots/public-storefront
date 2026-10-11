import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';

const h = vi.hoisted(() => ({
  settings: {} as StorefrontSettings,
  bar: false,
  menu: true,
  native: false,
  account: 'all',
  cart: 'all',
}));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));
vi.mock('@/app/builder-gate.ts', () => ({ isBuilderMode: vi.fn(() => false) }));
vi.mock('@/app/preview-listener.ts', () => ({ isPreviewMode: vi.fn(() => false) }));
vi.mock('@/components/Brand.tsx', () => ({ Brand: () => <span>brand</span> }));
vi.mock('@/features/notices/NoticeBanners.tsx', () => ({ NoticeBanners: () => null }));
vi.mock('@/features/warehouses/WarehouseBar.tsx', () => ({ WarehouseBar: () => null }));
vi.mock('@/features/webapp/useTelegramChrome.ts', () => ({ isFirstHistoryEntry: () => true }));
vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => h.native }));
vi.mock('@/templates/runtime.tsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/templates/runtime.tsx')>()),
  Slot: () => null,
}));
vi.mock('@/templates/hooks.ts', async (orig) => {
  const real = await orig<typeof import('@/templates/hooks.ts')>();
  return { ...real, useCoreOptions: () => ({ ...real.useCoreOptions(), showMobileBottomNav: h.bar, showHeaderMenu: h.menu, headerAccountIcon: h.account as 'all', headerCartIcon: h.cart as 'all' }) };
});

import { isBuilderMode } from '@/app/builder-gate.ts';
import { isPreviewMode } from '@/app/preview-listener.ts';
import { StorefrontHeader } from '@/layouts/StorefrontShell.tsx';
import { MenuHeader } from '@/layouts/MenuShell.tsx';
import { WebAppHeader } from '@/layouts/WebAppShell.tsx';
import { MENU_LINKS } from '@/layouts/menu-links.ts';
import { useSessionStore } from '@/stores/session.ts';

function setViewport(phone: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width: 62em') ? !phone : false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

function mount(element: ReactNode, o: { path?: string; reviews?: boolean; accounts?: boolean; ordering?: boolean; faq?: boolean | 'older' } = {}) {
  h.settings = {
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [],
    reviews: o.reviews === false ? undefined : { enabled: true, maxLength: 500 },
    ...(o.faq === undefined || o.faq === 'older' ? {} : { faq: { available: o.faq } }),
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront', ordering: o.ordering !== false, guestCheckout: false, accounts: o.accounts !== false, verify: false, tracking: false, wholesale: false, upsell: false },
  } as unknown as StorefrontSettings;
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [o.path ?? '/'] });
  const view = render(<MantineProvider env="test"><RouterProvider router={router} /></MantineProvider>);
  return { ...view, router };
}
const burger = () => screen.queryByRole('button', { name: 'Open menu' });
const dialog = () => screen.queryByRole('dialog');
const labels = () => within(dialog()!).getAllByRole('link').map((a) => a.textContent);
const hrefs = () => within(dialog()!).getAllByRole('link').map((a) => a.getAttribute('href'));

beforeEach(() => {
  h.bar = false;
  h.menu = true;
  h.native = false;
  h.account = 'all';
  h.cart = 'all';
  setViewport(true);
  vi.mocked(isBuilderMode).mockReturnValue(false);
  vi.mocked(isPreviewMode).mockReturnValue(false);
  useSessionStore.setState({ token: null, customer: null });
});
afterEach(() => {
  cleanup();
  document.body.removeAttribute('style');
});

describe.each([['storefront', <StorefrontHeader key="s" />], ['menu', <MenuHeader key="m" />], ['webapp', <WebAppHeader key="w" />]] as const)(
  'the %s header menu button', (_layout, header) => {
    it('is the last control of the header, a labelled button of at least 44px that has not opened anything yet', () => {
      mount(header);
      const b = burger()!;
      expect(b).toHaveAttribute('aria-haspopup', 'dialog');
      expect(b).toHaveAttribute('aria-expanded', 'false');
      const controls = [...b.closest('header')!.querySelectorAll('a, button, input')];
      expect(controls[controls.length - 1]).toBe(b);
      expect(dialog()).toBeNull();
    });
    it('is absent at 62em and wider, with the option off, in the page builder and in a theme preview', () => {
      setViewport(false);
      mount(header);
      expect(burger()).toBeNull();
      cleanup();
      setViewport(true);
      h.menu = false;
      mount(header);
      expect(burger()).toBeNull();
      cleanup();
      h.menu = true;
      vi.mocked(isBuilderMode).mockReturnValue(true);
      mount(header);
      expect(burger()).toBeNull();
      cleanup();
      vi.mocked(isBuilderMode).mockReturnValue(false);
      vi.mocked(isPreviewMode).mockReturnValue(true);
      mount(header);
      expect(burger()).toBeNull();
    });
    it('shows with the bottom bar on or off', () => {
      h.bar = true;
      mount(header);
      expect(burger()).not.toBeNull();
    });
  },
);

describe('the menu panel', () => {
  it('is a modal dialog named "Menu" that opens from the button and lists the pages in order', () => {
    mount(<StorefrontHeader />);
    fireEvent.click(burger()!);
    const d = dialog()!;
    expect(d).toHaveAttribute('aria-modal', 'true');
    expect(d).toHaveAccessibleName('Menu');
    expect(burger()).toHaveAttribute('aria-expanded', 'true');
    expect(labels()).toEqual(['Catalog', 'Reviews', 'Support', 'Sign in']);
    expect(hrefs()).toEqual(['/', '/reviews', '/support', '/login']);
  });
  it('has no cart entry', () => {
    mount(<StorefrontHeader />);
    fireEvent.click(burger()!);
    expect(MENU_LINKS.map((l) => l.key)).not.toContain('cart');
    expect(hrefs()).not.toContain('/cart');
  });
  it('says "Your account" and goes to /account once signed in', () => {
    useSessionStore.setState({ token: 'sess-1', customer: { id: 5, nickname: 'ada' } });
    mount(<StorefrontHeader />);
    fireEvent.click(burger()!);
    expect(labels()).toEqual(['Catalog', 'Reviews', 'Support', 'Your account']);
    expect(hrefs()).toEqual(['/', '/reviews', '/support', '/account']);
  });
  it('puts FAQ just before Support when the shop has an FAQ, and omits it when it has none or the backend is older', () => {
    mount(<StorefrontHeader />, { faq: true });
    fireEvent.click(burger()!);
    expect(labels()).toEqual(['Catalog', 'Reviews', 'FAQ', 'Support', 'Sign in']);
    expect(hrefs()).toEqual(['/', '/reviews', '/faq', '/support', '/login']);
    cleanup();
    mount(<StorefrontHeader />, { faq: false });
    fireEvent.click(burger()!);
    expect(labels()).toEqual(['Catalog', 'Reviews', 'Support', 'Sign in']);
    cleanup();
    mount(<StorefrontHeader />, { faq: 'older' });
    fireEvent.click(burger()!);
    expect(labels()).toEqual(['Catalog', 'Reviews', 'Support', 'Sign in']);
  });
  it('marks FAQ as the current page on /faq', () => {
    mount(<StorefrontHeader />, { path: '/faq', faq: true });
    fireEvent.click(burger()!);
    const current = within(dialog()!).getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current.map((a) => a.textContent)).toEqual(['FAQ']);
  });
  it('drops Reviews when the shop has reviews off, and the account entry when accounts are off', () => {
    mount(<StorefrontHeader />, { reviews: false, accounts: false });
    fireEvent.click(burger()!);
    expect(labels()).toEqual(['Catalog', 'Support']);
  });
  it('sends a signed-out visitor to the same place as the header account button, in each layout', () => {
    mount(<MenuHeader />);
    const headerHref = screen.getByRole('link', { name: 'Sign in' }).getAttribute('href');
    fireEvent.click(burger()!);
    expect(within(dialog()!).getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe(headerHref);
    cleanup();
    h.native = true;
    mount(<WebAppHeader />);
    const nativeHref = screen.getByRole('link', { name: 'Sign in' }).getAttribute('href');
    fireEvent.click(burger()!);
    expect(within(dialog()!).getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe(nativeHref);
    expect(nativeHref).toBe('/account');
  });
  it.each([
    ['/', 'Catalog'], ['/c/12', 'Catalog'], ['/p/101', 'Catalog'], ['/reviews', 'Reviews'], ['/support', 'Support'],
  ])('marks %s as the current page: %s', (path, name) => {
    mount(<StorefrontHeader />, { path });
    fireEvent.click(burger()!);
    const current = within(dialog()!).getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current.map((a) => a.textContent)).toEqual([name]);
  });
  it('marks the account entry on any account page', () => {
    useSessionStore.setState({ token: 'sess-1', customer: { id: 5, nickname: 'ada' } });
    mount(<StorefrontHeader />, { path: '/account/loyalty' });
    fireEvent.click(burger()!);
    expect(within(dialog()!).getByRole('link', { name: 'Your account' })).toHaveAttribute('aria-current', 'page');
  });

  it('moves focus into the panel when it opens', async () => {
    mount(<StorefrontHeader />);
    fireEvent.click(burger()!);
    await waitFor(() => expect(dialog()!.contains(document.activeElement)).toBe(true));
  });
  it('closes on Escape and gives focus back to the button', async () => {
    mount(<StorefrontHeader />);
    const b = burger()!;
    b.focus();
    fireEvent.click(b);
    await waitFor(() => expect(dialog()!.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(dialog()).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(b));
    expect(b).toHaveAttribute('aria-expanded', 'false');
  });
  it('closes on the close button and on a tap on the scrim', async () => {
    mount(<StorefrontHeader />);
    fireEvent.click(burger()!);
    fireEvent.click(within(dialog()!).getByRole('button', { name: 'Close menu' }));
    await waitFor(() => expect(dialog()).toBeNull());
    fireEvent.click(burger()!);
    const scrim = document.querySelector('.mantine-Drawer-overlay')!;
    expect(scrim).not.toBeNull();
    fireEvent.click(scrim);
    await waitFor(() => expect(dialog()).toBeNull());
  });
  it('locks page scroll while open and releases it on close', async () => {
    mount(<StorefrontHeader />);
    fireEvent.click(burger()!);
    await waitFor(() => expect(getComputedStyle(document.body).overflow).toBe('hidden'));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(getComputedStyle(document.body).overflow).not.toBe('hidden'));
  });
  it('closes when a link is chosen, and the page changes', async () => {
    const { router } = mount(<StorefrontHeader />);
    fireEvent.click(burger()!);
    fireEvent.click(within(dialog()!).getByRole('link', { name: 'Support' }));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(router.state.location.pathname).toBe('/support');
  });
  it('closes when the page changes some other way (the back button)', async () => {
    const { router } = mount(<StorefrontHeader />);
    fireEvent.click(burger()!);
    await router.navigate('/reviews');
    await waitFor(() => expect(dialog()).toBeNull());
  });
  it('closes when the page you are already on is chosen', async () => {
    mount(<StorefrontHeader />, { path: '/support' });
    fireEvent.click(burger()!);
    fireEvent.click(within(dialog()!).getByRole('link', { name: 'Support' }));
    await waitFor(() => expect(dialog()).toBeNull());
  });
  it('carries Telegram\'s safe-area padding class inside Telegram only', () => {
    h.native = true;
    mount(<StorefrontHeader />);
    fireEvent.click(burger()!);
    expect(dialog()!.className).toMatch(/telegram/);
    cleanup();
    h.native = false;
    mount(<StorefrontHeader />);
    fireEvent.click(burger()!);
    expect(dialog()!.className).not.toMatch(/telegram/);
  });
});

describe('the crowded-search mark on the menu button', () => {
  const crowded = () => /crowded/.test(burger()!.className);
  it('is set when the bar is off and the header still draws Account and Cart', () => {
    mount(<MenuHeader />);
    expect(crowded()).toBe(true);
  });
  it('is not set while the bar is on screen (the header draws neither)', () => {
    h.bar = true;
    mount(<MenuHeader />);
    expect(crowded()).toBe(false);
  });
  it('is not set when accounts and ordering are both off', () => {
    mount(<MenuHeader />, { accounts: false, ordering: false });
    expect(crowded()).toBe(false);
  });
  it('is not set when both icon options hide the button on phones (none, desktop)', () => {
    h.account = 'none';
    h.cart = 'desktop';
    mount(<MenuHeader />);
    expect(crowded()).toBe(false);
  });
  it('stays set while either button is still drawn', () => {
    h.account = 'none';
    mount(<MenuHeader />);
    expect(crowded()).toBe(true);
    cleanup();
    h.account = 'all';
    mount(<MenuHeader />, { ordering: false });
    expect(crowded()).toBe(true);
    cleanup();
    h.account = 'desktop';
    mount(<MenuHeader />, { ordering: false });
    expect(crowded()).toBe(false);
  });
});

describe('the header Reviews star with the menu', () => {
  const star = () => screen.queryByRole('link', { name: 'Reviews' });
  it('is hidden below 62em while the menu is on, bar or no bar', () => {
    mount(<StorefrontHeader />);
    expect(star()!.className).toMatch(/sf-hide-mobile/);
    cleanup();
    h.bar = true;
    mount(<StorefrontHeader />);
    expect(star()!.className).toMatch(/sf-hide-mobile/);
  });
  it('is back below 62em only when both the bar and the menu are off', () => {
    h.menu = false;
    mount(<StorefrontHeader />);
    expect(star()!.className).not.toMatch(/sf-hide-mobile/);
    cleanup();
    h.bar = true;
    mount(<StorefrontHeader />);
    expect(star()!.className).toMatch(/sf-hide-mobile/);
  });
});
