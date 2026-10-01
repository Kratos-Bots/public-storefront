import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/components/Brand.tsx', () => ({ Brand: () => <span>brand</span> }));
vi.mock('@/components/ContactLinks.tsx', () => ({ ContactLinks: () => <i data-testid="contact" /> }));
vi.mock('@/features/notices/NoticeBanners.tsx', () => ({ NoticeBanners: () => null }));
vi.mock('@/features/notices/CutoffBar.tsx', () => ({ CutoffBar: () => null }));
vi.mock('@/features/auth/LoginModal.tsx', () => ({ LoginModal: () => null }));
vi.mock('@/features/cart/CartDrawer.tsx', () => ({ CartDrawer: () => null, useCartDrawerReady: () => true }));
vi.mock('@/features/cart/MobileCartBar.tsx', () => ({ MobileCartBar: () => <i data-testid="cart-bar" />, useMobileCartBar: () => false }));
vi.mock('@/features/webapp/PrimaryActionBar.tsx', () => ({ PrimaryActionBar: () => <i data-testid="primary-bar" />, usePrimaryBarShowing: () => false }));
vi.mock('@/features/webapp/useTelegramChrome.ts', () => ({ useTelegramChrome: () => {}, isFirstHistoryEntry: () => true }));
vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => false }));
vi.mock('@/templates/runtime.tsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/templates/runtime.tsx')>()),
  Slot: ({ name }: { name: string }) => <i data-slot={name} />,
}));

import { StorefrontFrame, StorefrontHeader, StorefrontMain } from '@/layouts/StorefrontShell.tsx';
import { MenuContactStrip } from '@/layouts/MenuShell.tsx';
import { WebAppFrame } from '@/layouts/WebAppShell.tsx';
import { ShellStateContext, useShellSearch } from '@/layouts/shell-context.ts';

function mount(element: ReactNode, path = '/') {
  state.settings = {
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [],
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
  } as unknown as StorefrontSettings;
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [path] });
  return render(<MantineProvider env="test"><RouterProvider router={router} /></MantineProvider>);
}

afterEach(cleanup);

describe('StorefrontHeader', () => {
  it('renders the TopBar slot, the search field and a sticky header by default', () => {
    const { container } = mount(<StorefrontHeader />);
    expect(container.querySelector('[data-slot="TopBar"]')).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Search products' })).toBeInTheDocument();
    expect(container.querySelector('header')!.className).not.toMatch(/unstuck/);
  });
  it('drops the top bar and search, unsticks, and places nav after the home link', () => {
    const { container } = mount(<StorefrontHeader topBar={false} search={false} sticky={false} nav={<a href="/pages/our-story">Our story</a>} />);
    expect(container.querySelector('[data-slot="TopBar"]')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Search products' })).toBeNull();
    expect(container.querySelector('header')!.className).toMatch(/unstuck/);
    const links = screen.getAllByRole('link').map((a) => a.textContent);
    expect(links.indexOf('Our story')).toBe(links.indexOf('brand') + 1);
  });
});

describe('StorefrontMain', () => {
  it('hands the shell search state to the routed page', () => {
    function Page() { return <p>{useShellSearch().search}</p>; }
    const router = createMemoryRouter([{ path: '/', element: <StorefrontMain />, children: [{ index: true, element: <Page /> }] }]);
    render(
      <MantineProvider env="test">
        <ShellStateContext.Provider value={{ search: 'balm', setSearch: () => {} }}>
          <RouterProvider router={router} />
        </ShellStateContext.Provider>
      </MantineProvider>,
    );
    expect(screen.getByText('balm')).toBeInTheDocument();
    expect(document.querySelector('main[data-sf-part="main"]')).not.toBeNull();
  });
});

describe('useShellSearch outside a shell outlet', () => {
  it('reads the shell state provider when there is no outlet context', () => {
    function Block() { return <p>{`[${useShellSearch().search}]`}</p>; }
    render(
      <ShellStateContext.Provider value={{ search: 'tincture', setSearch: () => {} }}>
        <Block />
      </ShellStateContext.Provider>,
    );
    expect(screen.getByText('[tincture]')).toBeInTheDocument();
  });
  it('falls back to an inert empty search with neither an outlet nor a provider', () => {
    let seen: ReturnType<typeof useShellSearch> | undefined;
    function Block() { seen = useShellSearch(); return <p>{`[${seen.search}]`}</p>; }
    mount(<Block />);
    expect(screen.getByText('[]')).toBeInTheDocument();
    expect(seen!.search).toBe('');
    expect(() => seen!.setSearch('anything')).not.toThrow();
  });
});

describe('frames', () => {
  it('mounts the phone cart bar unless the document placed its own', () => {
    mount(<StorefrontFrame><p>doc</p></StorefrontFrame>);
    expect(screen.getByTestId('cart-bar')).toBeInTheDocument();
    cleanup();
    mount(<StorefrontFrame cartBar={false}><p>doc</p></StorefrontFrame>);
    expect(screen.queryByTestId('cart-bar')).toBeNull();
    expect(document.querySelector('[data-slot="Overlay"]')).not.toBeNull();
  });
  it('the web app frame keeps its layout marker and primary action', () => {
    const { container } = mount(<WebAppFrame><p>doc</p></WebAppFrame>);
    expect(container.querySelector('[data-sf-layout="webapp"]')).not.toBeNull();
    expect(screen.getByTestId('primary-bar')).toBeInTheDocument();
  });
});

describe('MenuContactStrip', () => {
  it('shows on the catalogue only, unless told otherwise', () => {
    mount(<MenuContactStrip />, '/cart');
    expect(screen.queryByTestId('contact')).toBeNull();
    cleanup();
    mount(<MenuContactStrip catalogOnly={false} />, '/cart');
    expect(screen.getByTestId('contact')).toBeInTheDocument();
    cleanup();
    mount(<MenuContactStrip />, '/c/concentrates');
    expect(screen.getByTestId('contact')).toBeInTheDocument();
  });
});
