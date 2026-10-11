import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const h = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  option: true,
  layout: 'storefront',
  telegram: false,
}));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => h.settings }));
vi.mock('@/app/layout.ts', () => ({ useEffectiveLayout: () => h.layout }));
vi.mock('@/app/builder-gate.ts', () => ({ isBuilderMode: vi.fn(() => false) }));
vi.mock('@/app/preview-listener.ts', () => ({ isPreviewMode: vi.fn(() => false) }));
vi.mock('@/lib/telegram-webapp.ts', async (orig) => ({ ...(await orig<typeof import('@/lib/telegram-webapp.ts')>()), isTelegramWebApp: () => h.telegram }));
vi.mock('@/templates/hooks.ts', async (orig) => ({
  ...(await orig<typeof import('@/templates/hooks.ts')>()),
  useCoreOptions: () => ({ showMobileBottomNav: h.option }),
}));

import { isBuilderMode } from '@/app/builder-gate.ts';
import { isPreviewMode } from '@/app/preview-listener.ts';
import { BottomNav } from '@/layouts/BottomNav.tsx';
import { useSessionStore } from '@/stores/session.ts';
import { useCartStore, type LocalLine } from '@/stores/cart.ts';

const line = (quantity: number): LocalLine => ({ productId: 12, displayName: 'Widget Blue', sku: 'WID-BLU', unitPrice: 40, basePrice: 40, pricingTiers: [], quantity, isPreorder: false, excludedFromFreeShipping: false, imageProductId: null });

function mount(path = '/', props: { inset?: 'page' | 'webapp'; coverUnderDialog?: boolean } = {}) {
  return render(<MemoryRouter initialEntries={[path]}><BottomNav {...props} /></MemoryRouter>);
}
const nav = () => screen.queryByRole('navigation', { name: 'Shop menu' });
const labels = () => within(nav()!).getAllByRole('link').map((a) => a.textContent);

beforeEach(() => {
  h.settings = { currency: 'GBP', features: { accounts: true, ordering: true }, reviews: { enabled: true, maxLength: 500 } };
  h.option = true;
  h.layout = 'storefront';
  h.telegram = false;
  vi.mocked(isBuilderMode).mockReturnValue(false);
  vi.mocked(isPreviewMode).mockReturnValue(false);
  useSessionStore.setState({ token: null, customer: null });
  useCartStore.setState({ lines: [], mode: 'local' });
});
afterEach(() => {
  cleanup();
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }) as MediaQueryList;
});

describe('BottomNav items', () => {
  it('shows Shop, Profile, Cart, Reviews and Support in that order, each a link with a label', () => {
    mount();
    expect(labels()).toEqual(['Catalog', 'Profile', 'Cart', 'Reviews', 'Support']);
    expect(within(nav()!).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/', '/login', '/cart', '/reviews', '/support']);
  });
  it('sends Profile to the profile page once signed in, and to sign-in before', () => {
    useSessionStore.setState({ token: 'sess-1', customer: { id: 5, nickname: 'ada' } });
    mount();
    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe('/account/profile');
  });
  it('sends Profile to the account inside the Telegram web app layout, where there is no sign-in page', () => {
    h.layout = 'webapp';
    h.telegram = true;
    mount();
    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe('/account/profile');
  });
  it('drops Profile when accounts are off, Cart when ordering is off, Reviews when reviews are off', () => {
    h.settings = { currency: 'GBP', features: { accounts: false, ordering: false } };
    mount();
    expect(labels()).toEqual(['Catalog', 'Support']);
  });
  it('shows the cart count as a badge that follows the cart, and names it for screen readers', () => {
    useCartStore.setState({ lines: [line(2), { ...line(3), productId: 13 }], mode: 'local' });
    mount();
    const cart = screen.getByRole('link', { name: 'Cart, 5 items' });
    expect(within(cart).getByText('5')).toBeInTheDocument();
  });
  it('has no badge on an empty cart', () => {
    mount();
    expect(within(screen.getByRole('link', { name: 'Cart' })).queryByText('0')).toBeNull();
  });
});

describe('BottomNav active item', () => {
  it.each([
    ['/', 'Catalog'], ['/c/serums', 'Catalog'], ['/p/12', 'Catalog'], ['/cart', 'Cart'], ['/account/profile', 'Profile'], ['/account/orders', 'Profile'],
    ['/reviews', 'Reviews'], ['/support', 'Support'],
  ])('marks the item for %s as the current page: %s', (path, label) => {
    mount(path);
    const current = within(nav()!).getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current.map((a) => a.textContent)).toEqual([label]);
  });
  it('marks nothing on a page that is none of the five', () => {
    mount('/pages/about');
    expect(within(nav()!).getAllByRole('link').filter((a) => a.hasAttribute('aria-current'))).toHaveLength(0);
  });
});

describe('BottomNav visibility', () => {
  it.each(['/', '/c/serums', '/p/12', '/cart', '/account/orders/K4M2QP', '/account/profile', '/reviews', '/support', '/pages/about', '/order/K4M2QP', '/tracking/abc', '/verify/abc'])(
    'shows on %s', (path) => {
      mount(path);
      expect(nav()).not.toBeNull();
    });
  it.each(['/checkout', '/checkout/', '/payment/success', '/payment/cancel', '/order-placed', '/login', '/auth/telegram/callback', '/reset-password', '/verify-email', '/__builder'])(
    'is absent on %s', (path) => {
      mount(path);
      expect(nav()).toBeNull();
    });
  it('is absent when the shop switched it off', () => {
    h.option = false;
    mount();
    expect(nav()).toBeNull();
  });
  it('is absent at desktop width', () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes('62em'), media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
    mount();
    expect(nav()).toBeNull();
  });
  it('is absent in the page builder and in a theme preview', () => {
    vi.mocked(isBuilderMode).mockReturnValue(true);
    mount();
    expect(nav()).toBeNull();
    cleanup();
    vi.mocked(isBuilderMode).mockReturnValue(false);
    vi.mocked(isPreviewMode).mockReturnValue(true);
    mount();
    expect(nav()).toBeNull();
  });
});

describe('BottomNav foot', () => {
  it('publishes its height as --sf-nav-h while it is on the page and removes it when it leaves', () => {
    const root = document.documentElement;
    const view = mount();
    expect(root.style.getPropertyValue('--sf-nav-h')).not.toBe('');
    view.unmount();
    expect(root.style.getPropertyValue('--sf-nav-h')).toBe('');
  });
  it('takes the Telegram inset only inside Telegram, whatever the layout', () => {
    h.telegram = true;
    mount('/', { inset: 'webapp' });
    expect(nav()!.className).toMatch(/telegram/);
    expect(nav()!.className).not.toMatch(/webapp/);
  });
  it('takes the browser inset plus the Telegram one for the Mini App browser stand-in', () => {
    mount('/', { inset: 'webapp' });
    expect(nav()!.className).toMatch(/webapp/);
  });
});
