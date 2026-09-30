import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ComponentType } from 'react';
import type { StorefrontSettings, Theme } from '@/types/settings.ts';
import type { PageSet } from '@/builder/types.ts';

const state = vi.hoisted(() => ({ settings: {} as StorefrontSettings }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => state.settings }));
vi.mock('@/components/Brand.tsx', () => ({ Brand: () => <span>brand</span> }));
vi.mock('@/components/ContactLinks.tsx', () => ({ ContactLinks: () => <i data-mark="contact" /> }));
vi.mock('@/features/notices/NoticeBanners.tsx', () => ({ NoticeBanners: ({ pinned }: { pinned?: boolean }) => <i data-mark={pinned ? 'notices-pinned' : 'notices'} /> }));
vi.mock('@/features/notices/CutoffBar.tsx', () => ({ CutoffBar: () => <i data-mark="cutoff" /> }));
vi.mock('@/features/auth/LoginModal.tsx', () => ({ LoginModal: () => <i data-mark="login-modal" /> }));
vi.mock('@/features/cart/CartDrawer.tsx', () => ({ CartDrawer: () => <i data-mark="cart-drawer" /> }));
vi.mock('@/features/cart/MobileCartBar.tsx', () => ({ MobileCartBar: () => <i data-mark="cart-bar" />, useMobileCartBar: () => false }));
vi.mock('@/features/webapp/PrimaryActionBar.tsx', () => ({ PrimaryActionBar: () => <i data-mark="primary-bar" />, usePrimaryBarShowing: () => false }));
vi.mock('@/features/webapp/useTelegramChrome.ts', () => ({ useTelegramChrome: () => {}, isFirstHistoryEntry: () => true }));
vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => false }));
// Only the no-override skeleton test reaches the network; it must stay pending.
vi.mock('@/api/pages.ts', () => ({ fetchPageSet: () => new Promise(() => {}), fetchPublished: () => new Promise(() => {}) }));

import { StorefrontShell } from '@/layouts/StorefrontShell.tsx';
import { MenuShell } from '@/layouts/MenuShell.tsx';
import { WebAppShell } from '@/layouts/WebAppShell.tsx';
import { PageSetOverrideProvider, PuckShell } from '@/builder/runtime.tsx';
import { defaultDoc } from '@/builder/defaults/index.ts';
import { useShellSearch } from '@/layouts/shell-context.ts';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { TemplateProvider } from '@/templates/runtime.tsx';
import { resolveTheme } from '@/templates/resolve.ts';
import { lookupManifest } from '@/templates/registry.ts';
import type { TemplateModule } from '@/templates/slots.ts';

const THEME: Theme = {
  scheme: 'dark',
  colors: { primary: '#ffffff', bg: '#0f3965', surface: '#15457a', text: '#f4f7fc', muted: '#a9c0e0', success: '#5fcc9b', warn: '#e3b97a', danger: '#e08278' },
  fonts: { heading: null, body: null, mono: null }, radius: 'none', density: 'comfortable', customCss: '',
};
const MODULE: TemplateModule = { slots: {} };

function settings(layout: 'storefront' | 'menu' | 'webapp') {
  state.settings = {
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [],
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: 'Small batches', links: { whatsapp: 'https://wa.me/440000000000', telegram: null } },
    features: { layout, ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
    theme: THEME,
  } as unknown as StorefrontSettings;
}

function mount(Shell: ComponentType, pageSet: PageSet | null, path = '/', childKey: string = 'catalog') {
  const client = new QueryClient();
  const router = createMemoryRouter([{
    path: '/', element: <Shell />,
    children: [
      { index: true, handle: { routeKey: childKey }, element: <p>page</p> },
      { path: 'pages/:slug', handle: { routeKey: 'page' }, element: <p>custom</p> },
    ],
  }], { initialEntries: [path] });
  const resolved = resolveTheme({ ...THEME, options: {} }, lookupManifest);
  return render(
    <QueryClientProvider client={client}>
      <PageSetOverrideProvider pageSet={pageSet}>
        <MantineProvider env="test">
          <TemplateProvider resolved={resolved} fallback={null} load={() => Promise.resolve(MODULE)} peek={() => MODULE}>
            <RouterProvider router={router} />
          </TemplateProvider>
        </MantineProvider>
      </PageSetOverrideProvider>
    </QueryClientProvider>,
  );
}

const normalize = (html: string) => html.replace(/(mantine-)[a-z0-9]{5,}/gi, '$1ID').replace(/«r[0-9a-z]+»|:r[0-9a-z]+:|_r_[0-9a-z]+_/g, 'RID');

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe.each<[string, 'storefront' | 'menu' | 'webapp', ComponentType]>([
  ['storefront', 'storefront', StorefrontShell],
  ['menu', 'menu', MenuShell],
  ['webapp', 'webapp', WebAppShell],
])('PuckShell default · %s', (_n, layout, Legacy) => {
  it('renders exactly the v0.6.0 shell DOM', () => {
    settings(layout);
    const legacy = normalize(mount(Legacy, null).container.innerHTML);
    cleanup();
    const puck = normalize(mount(PuckShell, null).container.innerHTML);
    expect(puck).toBe(legacy);
    expect(puck).toContain('<p>page</p>');
  });
  it('has a default shell document with exactly one PageOutlet', () => {
    const doc = defaultDoc('shell', layout)!;
    expect(doc.content.filter((c) => c.type === 'PageOutlet')).toHaveLength(1);
  });
});

const root = (chrome: 'shell' | 'none' = 'shell') => ({ props: { title: '', description: '', chrome } });

describe('PuckShell with a published set', () => {
  it('renders a page whose root says chrome: none without the shell', () => {
    settings('storefront');
    const set: PageSet = { schemaVersion: 1, shell: defaultDoc('shell', 'storefront')!, pages: { 'page:plain': { root: root('none'), content: [] } } };
    const { container } = mount(PuckShell, set, '/pages/plain');
    expect(screen.getByText('custom')).toBeInTheDocument();
    expect(container.querySelectorAll('header')).toHaveLength(1);
    expect(container.querySelector('[data-mark="cart-drawer"]')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Search products' })).toBeNull();
  });
  it('mounts the phone cart bar only once, wherever the document puts it', () => {
    settings('storefront');
    const set: PageSet = {
      schemaVersion: 1,
      shell: { root: root(), content: [{ type: 'MobileCartBar', props: { id: 'bar' } }, { type: 'PageOutlet', props: { id: 'out' } }] },
      pages: {},
    };
    const { container } = mount(PuckShell, set);
    expect(container.querySelectorAll('[data-mark="cart-bar"]')).toHaveLength(1);
    expect(container.querySelector('header')).toBeNull();
  });
  it('falls back to the default shell when the published one has no PageOutlet', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    settings('menu');
    const set: PageSet = { schemaVersion: 1, shell: { root: root(), content: [{ type: 'CutoffBar', props: { id: 'c' } }] }, pages: {} };
    mount(PuckShell, set);
    expect(screen.getByText('page')).toBeInTheDocument();
    expect(document.querySelector('[data-mark="contact"]')).not.toBeNull();
  });
  it('honours header props: no search, no top bar, account icon hidden', () => {
    settings('storefront');
    const set: PageSet = {
      schemaVersion: 1,
      shell: { root: root(), content: [
        { type: 'Header', props: { id: 'h', variant: 'auto', topBar: false, search: false, sticky: true, accountIcon: 'hide', cartIcon: 'inherit', nav: [] } },
        { type: 'PageOutlet', props: { id: 'out' } },
      ] },
      pages: {},
    };
    mount(PuckShell, set);
    expect(screen.queryByRole('textbox', { name: 'Search products' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.getByRole('link', { name: /^Cart,/ })).toBeInTheDocument();
  });
  it('falls back to the default shell when the published one has two Headers', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    settings('storefront');
    const header = (id: string) => ({ type: 'Header', props: { id, variant: 'auto', topBar: true, search: false, sticky: true, accountIcon: 'inherit', cartIcon: 'inherit', nav: [] } });
    const set: PageSet = { schemaVersion: 1, shell: { root: root(), content: [header('a'), header('b'), { type: 'PageOutlet', props: { id: 'out' } }] }, pages: {} };
    const { container } = mount(PuckShell, set);
    expect(container.querySelectorAll('header')).toHaveLength(1);
    // The default Header has search on — the published one (search off) was refused.
    expect(screen.getByRole('textbox', { name: 'Search products' })).toBeInTheDocument();
  });
});

function SearchEcho() {
  const { search } = useShellSearch();
  const items = ['Oak shelf', 'Pine crate', 'Oak stool'].filter((n) => n.toLowerCase().includes(search.toLowerCase()));
  return <ul>{items.map((n) => <li key={n}>{n}</li>)}</ul>;
}

describe('PuckShell shell state', () => {
  it.each(['storefront', 'menu', 'webapp'] as const)('%s: the header search filters the routed page', (layout) => {
    settings(layout);
    const client = new QueryClient();
    const router = createMemoryRouter([{ path: '/', element: <PuckShell />, children: [{ index: true, handle: { routeKey: 'catalog' }, element: <SearchEcho /> }] }]);
    const resolved = resolveTheme({ ...THEME, options: {} }, lookupManifest);
    render(
      <QueryClientProvider client={client}>
        <PageSetOverrideProvider pageSet={null}>
          <MantineProvider env="test">
            <TemplateProvider resolved={resolved} fallback={null} load={() => Promise.resolve(MODULE)} peek={() => MODULE}>
              <RouterProvider router={router} />
            </TemplateProvider>
          </MantineProvider>
        </PageSetOverrideProvider>
      </QueryClientProvider>,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search products' }), { target: { value: 'oak' } });
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Oak shelf', 'Oak stool']);
  });
});

describe('Header sticky: false', () => {
  const unstuckHeader: PageSet = {
    schemaVersion: 1,
    shell: { root: root(), content: [
      { type: 'Header', props: { id: 'h', variant: 'auto', topBar: true, search: true, sticky: false, accountIcon: 'inherit', cartIcon: 'inherit', nav: [] } },
      { type: 'PageOutlet', props: { id: 'out' } },
    ] },
    pages: {},
  };
  it.each([
    ['storefront', 'StorefrontShell.module.css'],
    ['menu', 'MenuShell.module.css'],
    ['webapp', 'WebAppShell.module.css'],
  ] as const)('%s: the unstuck header is a direct child of the shell root, whose CSS zeroes the sticky offsets', (layout, cssFile) => {
    settings(layout);
    const { container } = mount(PuckShell, unstuckHeader);
    const header = container.querySelector('header')!;
    const shellRoot = container.querySelector('[class*="_shell_"]');
    expect(header.parentElement).toBe(shellRoot);
    expect(header.className).toMatch(/unstuck/);
    // jsdom does not cascade CSS modules, so pin the rule itself: page elements that stick at
    // `--sf-bar-h + --sf-pin-h` must come to rest at the top once the header scrolls away.
    const css = readFileSync(resolve(__dirname, '../src/layouts', cssFile), 'utf8');
    const rule = css.match(/\.shell:has\(\.unstuck\)\s*\{([^}]*)\}/);
    expect(rule, `${cssFile} has a .shell:has(.unstuck) rule`).not.toBeNull();
    expect(rule![1]).toMatch(/--sf-bar-h:\s*0px/);
    expect(rule![1]).toMatch(/--sf-pin-h:\s*0px/);
  });
});

describe('PuckShell safety nets', () => {
  it('waits on the published set with the full-page skeleton and no header', () => {
    settings('storefront');
    const router = createMemoryRouter([{ path: '/', element: <PuckShell />, children: [{ index: true, handle: { routeKey: 'catalog' }, element: <p>page</p> }] }]);
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MantineProvider env="test"><RouterProvider router={router} /></MantineProvider>
      </QueryClientProvider>,
    );
    const skeleton = screen.getByRole('status', { name: 'Loading' });
    // The full skeleton carries the header bar; the inline one (inside a page) does not.
    expect(skeleton.className).not.toMatch(/inline/);
    expect(skeleton.querySelector('[class*="_bar_"]')).not.toBeNull();
    expect(container.querySelector('header')).toBeNull();
    expect(screen.queryByText('page')).toBeNull();
  });
  it('waits on the published set inside the chromeless frame for the shared order link: brand header now, inline skeleton below', () => {
    settings('storefront');
    const router = createMemoryRouter([{ path: '/', element: <PuckShell />, children: [{ path: 'order/:ref/:accessKey', handle: { routeKey: 'order-status' }, element: <PageSkeleton inline /> }] }], { initialEntries: ['/order/NB-1/key'] });
    const resolved = resolveTheme({ ...THEME, options: {} }, lookupManifest);
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MantineProvider env="test">
          <TemplateProvider resolved={resolved} fallback={null} load={() => Promise.resolve(MODULE)} peek={() => MODULE}>
            <RouterProvider router={router} />
          </TemplateProvider>
        </MantineProvider>
      </QueryClientProvider>,
    );
    const header = container.querySelector('header[data-sf-part="header"]');
    expect(header).not.toBeNull();
    expect(header!.textContent).toBe('brand');
    const skeleton = screen.getByRole('status', { name: 'Loading' });
    expect(skeleton.className).toMatch(/inline/);
    expect(skeleton.querySelector('[class*="_bar_"]')).toBeNull();
    for (const mark of ['cart-drawer', 'login-modal', 'cart-bar', 'primary-bar']) {
      expect(container.querySelector(`[data-mark="${mark}"]`), mark).toBeNull();
    }
  });
  it.each(['storefront', 'menu', 'webapp'] as const)('%s: a chrome: none page mounts no cart drawer, login modal, cart bar or Telegram bar', (layout) => {
    settings(layout);
    const set: PageSet = { schemaVersion: 1, shell: defaultDoc('shell', layout)!, pages: { 'page:plain': { root: root('none'), content: [] } } };
    const { container } = mount(PuckShell, set, '/pages/plain');
    expect(screen.getByText('custom')).toBeInTheDocument();
    for (const mark of ['cart-drawer', 'login-modal', 'cart-bar', 'primary-bar']) {
      expect(container.querySelector(`[data-mark="${mark}"]`), mark).toBeNull();
    }
  });
  it.each([
    'StorefrontShell.module.css',
    'MenuShell.module.css',
    'WebAppShell.module.css',
  ])('%s: an unstuck Header zeroes the sticky offsets even when nested in a container', (cssFile) => {
    const css = readFileSync(resolve(__dirname, '../src/layouts', cssFile), 'utf8');
    expect(css).not.toMatch(/\.shell:has\(>\s*\.unstuck\)/);
    expect(css).toMatch(/\.shell:has\(\.unstuck\)\s*\{[^}]*--sf-bar-h:\s*0px[^}]*--sf-pin-h:\s*0px/);
  });
});
