import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, useLocation, type RouteObject } from 'react-router';
import { isValidElement, Suspense, type ReactElement, type ReactNode } from 'react';
import type { PageSet } from '@/builder/types.ts';

const state = vi.hoisted(() => ({
  layout: 'storefront' as 'storefront' | 'menu' | 'webapp',
  telegram: false,
  fetchPageSet: null as null | ((layout: string) => Promise<unknown>),
}));
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({
    currency: 'GBP', enabled: true, supportLinks: [], notices: [],
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: '', links: { whatsapp: null, telegram: null } },
    features: { layout: state.layout, ordering: true, guestCheckout: false, accounts: true, verify: true, tracking: true, wholesale: false, upsell: false },
  }),
}));
vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => state.telegram }));
vi.mock('@/api/pages.ts', () => ({ fetchPageSet: (layout: string) => state.fetchPageSet!(layout), fetchPublished: async (layout: string) => ({ pageSet: (await state.fetchPageSet!(layout)) ?? null, text: null }) }));
vi.mock('@/components/Brand.tsx', () => ({ Brand: () => <span>brand</span> }));
vi.mock('@/features/auth/LoginModal.tsx', () => ({ LoginModal: () => <i data-mark="login-modal" /> }));
vi.mock('@/features/cart/CartDrawer.tsx', () => ({ CartDrawer: () => <i data-mark="cart-drawer" />, useCartDrawerReady: () => true }));
vi.mock('@/features/cart/MobileCartBar.tsx', () => ({ MobileCartBar: () => <i data-mark="cart-bar" />, useMobileCartBar: () => false }));
vi.mock('@/features/webapp/PrimaryActionBar.tsx', () => ({ PrimaryActionBar: () => <i data-mark="primary-bar" />, usePrimaryBarShowing: () => false }));
vi.mock('@/features/webapp/useTelegramChrome.ts', () => ({ useTelegramChrome: () => {}, isFirstHistoryEntry: () => true }));
vi.mock('@/features/cart/CartPage.tsx', () => ({ CartPage: () => <p>cart page</p> }));
vi.mock('@/features/cart/CartSummary.tsx', () => ({ CartSummary: () => <p>cart summary</p> }));
vi.mock('@/features/catalog/ProductDetailPage.tsx', () => ({ ProductDetailPage: () => <p>product page</p> }));
vi.mock('@/features/order-status/OrderStatusPage.tsx', () => ({ OrderStatusPage: () => <p>order status</p> }));

import { CartRoute, CustomPageRoute, ProductRoute, routes } from '@/app/routes.tsx';
import { Guard, type GuardSpec } from '@/app/guards.tsx';
import { PageSetOverrideProvider } from '@/builder/runtime.tsx';
import { FIXED_ROUTE_KEYS } from '@/builder/types.ts';
import { useUiStore } from '@/stores/ui.ts';

const SET: PageSet = {
  schemaVersion: 1,
  shell: { root: { props: { title: '', description: '', chrome: 'shell' } }, content: [] },
  pages: { 'page:our-story': { root: { props: { title: 'Our story · Northbound Supply', description: '', chrome: 'shell' } }, content: [] } },
};

function Where() {
  const { pathname, search } = useLocation();
  return <p>home {pathname}{search}</p>;
}

function mount(path: string, child: RouteObject = { path: '/pages/:slug', handle: { routeKey: 'page' }, element: <CustomPageRoute /> }, pageSet: PageSet = SET) {
  const router = createMemoryRouter([{ path: '/', element: <Where /> }, child], { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PageSetOverrideProvider pageSet={pageSet}>
        <Suspense fallback={null}><RouterProvider router={router} /></Suspense>
      </PageSetOverrideProvider>
    </QueryClientProvider>,
  );
}

const reset = { layout: 'storefront' as const, telegram: false, fetchPageSet: null };
afterEach(() => {
  cleanup();
  document.title = '';
  Object.assign(state, reset);
  useUiStore.setState({ cartOpen: false });
  window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } })) as typeof window.matchMedia;
});

describe('CustomPageRoute', () => {
  it('renders a published custom page with its title', async () => {
    mount('/pages/our-story');
    await waitFor(() => expect(document.title).toBe('Our story · Northbound Supply'));
    expect(screen.queryByText(/^home/)).toBeNull();
  });
  it.each(['/pages/Our-Story', '/pages/missing', '/pages/a_b'])('%s goes home', async (path) => {
    mount(path);
    expect(await screen.findByText('home /')).toBeInTheDocument();
  });
});

describe('ProductRoute', () => {
  const child: RouteObject = { path: '/p/:id', handle: { routeKey: 'product' }, element: <ProductRoute /> };
  it('storefront: renders the product page', async () => {
    mount('/p/42', child);
    expect(await screen.findByText('product page')).toBeInTheDocument();
  });
  it.each(['menu', 'webapp'] as const)('%s: opens the product as a sheet over the list (/?p=)', async (layout) => {
    state.layout = layout;
    mount('/p/a b', child);
    expect(await screen.findByText('home /?p=a%20b')).toBeInTheDocument();
  });
  it('inside Telegram the web app wins over the store\'s storefront choice', async () => {
    state.telegram = true;
    mount('/p/42', child);
    expect(await screen.findByText('home /?p=42')).toBeInTheDocument();
  });
});

describe('CartRoute', () => {
  const child: RouteObject = { path: '/cart', handle: { routeKey: 'cart' }, element: <CartRoute /> };
  const desktop = () => {
    window.matchMedia = ((query: string) => ({ matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } })) as typeof window.matchMedia;
  };
  it('phone: renders the cart page', async () => {
    mount('/cart', child);
    expect(await screen.findByText('cart page')).toBeInTheDocument();
    expect(useUiStore.getState().cartOpen).toBe(false);
  });
  it('desktop: hands off to the drawer and goes home', async () => {
    desktop();
    mount('/cart', child);
    expect(await screen.findByText('home /')).toBeInTheDocument();
    expect(useUiStore.getState().cartOpen).toBe(true);
  });
  it('web app: the cart stays a page at any width', async () => {
    desktop();
    state.layout = 'webapp';
    mount('/cart', child);
    expect(await screen.findByText('cart page')).toBeInTheDocument();
    expect(useUiStore.getState().cartOpen).toBe(false);
  });
});

interface Flat { path: string; route: RouteObject }
function flatten(list: RouteObject[], prefix = '', out: Flat[] = []): Flat[] {
  for (const r of list) {
    const path = r.index ? prefix || '/' : r.path?.startsWith('/') ? r.path : `${prefix === '/' ? '' : prefix}/${r.path ?? ''}`;
    out.push({ path, route: r });
    if (r.children) flatten(r.children, path, out);
  }
  return out;
}
const guardOf = (route: RouteObject): GuardSpec | null => {
  const el = route.element;
  return isValidElement(el) && el.type === Guard ? (el as ReactElement<{ spec: GuardSpec }>).props.spec : null;
};

describe('route table', () => {
  function handles(list: RouteObject[], out: string[] = []): string[] {
    for (const r of list) {
      const key = (r.handle as { routeKey?: string } | undefined)?.routeKey;
      if (key) out.push(key);
      if (r.children) handles(r.children, out);
    }
    return out;
  }
  it('tags every fixed route and the custom-page route', () => {
    const tagged = new Set(handles(routes));
    for (const key of FIXED_ROUTE_KEYS) expect(tagged.has(key), key).toBe(true);
    expect(tagged.has('page')).toBe(true);
  });
  it('renders the shared order link under the shell route (PuckShell swaps in the chromeless frame)', () => {
    const shell = routes.find((r) => r.path === '/')!;
    expect(shell.children!.some((r) => r.path === 'order/:ref/:accessKey')).toBe(true);
    expect(routes.some((r) => r.path === '/order/:ref/:accessKey')).toBe(false);
  });
  it('keeps every v0.6.0 path and param name', () => {
    const paths = flatten(routes).map((f) => f.path);
    for (const p of ['/', '/c/:categorySlug', '/p/:id', '/cart', '/checkout', '/login', '/account', '/account/orders', '/account/orders/:ref',
      '/account/loyalty', '/account/referrals', '/account/profile', '/order/:ref/:accessKey', '/payment/success', '/payment/cancel',
      '/order-placed', '/verify', '/tracking', '/tracking/:reference', '/pages/:slug', '/*']) {
      expect(paths, p).toContain(p);
    }
  });
  it('keeps every Guard at route level, exactly as v0.6.0', () => {
    const guards = Object.fromEntries(flatten(routes).map((f) => [f.path, guardOf(f.route)]).filter(([, g]) => g !== null));
    expect(guards).toEqual({
      '/cart': { feature: 'ordering' },
      '/checkout': { feature: 'ordering', sessionOrGuest: true },
      '/login': { feature: 'accounts' },
      '/account': { session: true },
      '/verify': { feature: 'verify' },
      '/tracking': { feature: 'tracking' },
      '/tracking/:reference': { feature: 'tracking' },
    });
  });
});

describe('the real route table', () => {
  function mountRoutes(path: string, pageSet?: PageSet | null): { client: QueryClient } {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter(routes, { initialEntries: [path] });
    const tree: ReactNode = <RouterProvider router={router} />;
    render(
      <QueryClientProvider client={client}>
        <MantineProvider env="test">
          {pageSet === undefined ? tree : <PageSetOverrideProvider pageSet={pageSet}>{tree}</PageSetOverrideProvider>}
        </MantineProvider>
      </QueryClientProvider>,
    );
    return { client };
  }

  it('/order/:ref/:accessKey renders chromeless: no cart drawer, login modal, cart bar or Telegram chrome', async () => {
    const container = document.body;
    mountRoutes('/order/NB-1001/key123', null);
    expect(await screen.findByText('order status')).toBeInTheDocument();
    expect(container.querySelectorAll('header')).toHaveLength(1);
    for (const mark of ['cart-drawer', 'login-modal', 'cart-bar', 'primary-bar']) {
      expect(container.querySelector(`[data-mark="${mark}"]`), mark).toBeNull();
    }
  });

  it('shell and page read the same page set: Telegram\'s web app, whatever the store chose', async () => {
    state.telegram = true;
    let resolve!: (set: PageSet) => void;
    const calls: string[] = [];
    state.fetchPageSet = (layout) => {
      calls.push(layout);
      return new Promise<PageSet>((r) => { resolve = r; });
    };
    const plain: PageSet = { ...SET, pages: { 'page:plain': { root: { props: { title: '', description: '', chrome: 'none' } }, content: [] } } };
    const { client } = mountRoutes('/pages/plain');
    await waitFor(() => expect(calls).toEqual(['webapp']));
    await act(async () => resolve(plain));
    await waitFor(() => expect(document.querySelectorAll('header')).toHaveLength(1));
    expect(calls).toEqual(['webapp']);
    expect(client.getQueryCache().getAll().map((q) => q.queryKey)).toEqual([['pages', 'webapp']]);
  });
});
