import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useContext, type ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import type { StorefrontSettings } from '@/types/settings.ts';

vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [],
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront', ordering: true },
  }) as unknown as StorefrontSettings,
}));

vi.mock('@/app/builder-gate.ts', async (orig) => ({ ...(await orig<typeof import('@/app/builder-gate.ts')>()), isBuilderMode: () => true }));
vi.mock('@/components/Brand.tsx', () => ({ Brand: () => <span data-mark="brand">brand</span> }));
vi.mock('@/components/ContactLinks.tsx', () => ({ ContactLinks: () => <i data-mark="contact" /> }));
vi.mock('@/features/notices/NoticeBanners.tsx', () => ({ NoticeBanners: () => <i data-mark="notices" /> }));
vi.mock('@/features/notices/CutoffBar.tsx', () => ({ CutoffBar: () => <i data-mark="cutoff" /> }));
vi.mock('@/features/auth/LoginModal.tsx', () => ({ LoginModal: () => <i data-mark="login-modal" /> }));
vi.mock('@/features/cart/MobileCartBar.tsx', () => ({ MobileCartBar: () => <i data-mark="cart-bar" />, useMobileCartBar: () => false }));
vi.mock('@/features/webapp/PrimaryActionBar.tsx', () => ({ PrimaryActionBar: () => <i data-mark="primary-bar" />, usePrimaryBarShowing: () => false }));
vi.mock('@/features/webapp/useTelegramChrome.ts', () => ({ useTelegramChrome: () => {}, isFirstHistoryEntry: () => true }));
vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => false }));
vi.mock('@/features/cart/useServerCart.ts', () => ({
  useServerCart: () => ({ mode: 'local', isSyncing: false, issues: [], add: () => {}, setQuantity: () => {}, remove: () => {}, sync: async () => {}, refresh: async () => {} }),
}));

import { defaultDoc } from '@/builder/defaults/index.ts';
import { PageGround } from '@/builder/editor/page-ground.tsx';
import { CartHostContext } from '@/features/cart/cart-host.ts';
import { exactPreviewPath, getCartSurface, useCartSurface } from '@/builder/editor/cart-surface.ts';
import { DEFAULT_PREVIEW_AS, useEditorStore } from '@/builder/editor/store.ts';
import { ExactPreview, ExactRuntime } from '@/builder/editor/ExactPreview.tsx';
import { builderOverrides } from '@/app/builder-gate.ts';
import { useUiStore } from '@/stores/ui.ts';
import type { ComponentData, DocKey, LayoutKind, PuckDoc } from '@/builder/types.ts';

/** Stands in for the CartContents container: a page draws everything, a drawer hands body/footer to the frame. */
function Probe({ footer = true }: { footer?: boolean }) {
  const host = useContext(CartHostContext);
  const body = <i data-testid="main" />;
  const foot = footer ? <i data-testid="summary" /> : undefined;
  if (!host) return <div data-testid="page"><i data-testid="head" />{body}{foot}</div>;
  return <>{host.frame({ body, footer: foot })}</>;
}

function wrap(children: ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider env="test"><MemoryRouter>{children}</MemoryRouter></MantineProvider>
    </QueryClientProvider>
  );
}

const ground = (docKey: DocKey, layout: LayoutKind, footer = true) =>
  wrap(<PageGround docKey={docKey} layout={layout}><Probe footer={footer} /></PageGround>);

beforeEach(() => {
  useEditorStore.setState({ docKey: 'cart', readOnly: false });
});
afterEach(() => {
  cleanup();
  act(() => { useEditorStore.setState({ docKey: 'catalog' }); });
});

describe('cart surface switch', () => {
  it('starts on the page and offers Page | Drawer in a labelled radiogroup', () => {
    render(ground('cart', 'storefront'));
    const group = screen.getByRole('radiogroup', { name: 'Cart surface' });
    expect(group).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Page' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Drawer' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('page')).toBeTruthy();
    expect(document.querySelector('[data-sf-builder-cart-drawer]')).toBeNull();
  });

  it('Drawer wraps the document in a drawer host: main in the column, summary pinned, no head', () => {
    render(ground('cart', 'storefront'));
    fireEvent.click(screen.getByRole('radio', { name: 'Drawer' }));
    expect(getCartSurface()).toBe('drawer');
    expect(screen.queryByTestId('page')).toBeNull();
    expect(screen.queryByTestId('head')).toBeNull();
    const stage = document.querySelector('[data-sf-builder-cart-drawer]')!;
    expect(stage.contains(screen.getByTestId('main'))).toBe(true);
    const pinned = screen.getByTestId('summary').parentElement!;
    expect(pinned.contains(screen.getByTestId('main'))).toBe(false);
    // The header copy is inert and hidden from assistive tech.
    const head = stage.querySelector('[aria-hidden="true"][inert]');
    expect(head).toBeTruthy();
    expect(head!.querySelector('button')).toBeNull();
  });

  it('an empty cart draws no footer', () => {
    render(ground('cart', 'menu', false));
    fireEvent.click(screen.getByRole('radio', { name: 'Drawer' }));
    expect(screen.getByTestId('main')).toBeTruthy();
    expect(screen.queryByTestId('summary')).toBeNull();
  });

  it('Page returns to the page surface', () => {
    render(ground('cart', 'storefront'));
    fireEvent.click(screen.getByRole('radio', { name: 'Drawer' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Page' }));
    expect(screen.getByTestId('page')).toBeTruthy();
  });

  it('resets to the page when the document changes', () => {
    const { result } = { result: { current: null as ReturnType<typeof useCartSurface> | null } };
    function Spy() { result.current = useCartSurface(); return null; }
    render(wrap(<Spy />));
    act(() => result.current![1]('drawer'));
    expect(getCartSurface()).toBe('drawer');
    act(() => { useEditorStore.setState({ docKey: 'catalog' }); });
    expect(getCartSurface()).toBe('page');
  });

  it('is absent on other documents and on the web-app layout', () => {
    render(ground('catalog', 'storefront'));
    expect(screen.queryByRole('radiogroup')).toBeNull();
    cleanup();
    render(ground('cart', 'webapp'));
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('is absent in the read-only view', () => {
    useEditorStore.setState({ readOnly: true });
    render(ground('cart', 'storefront'));
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('the radiogroup is one tab stop that follows the selection, with arrow, Home and End keys', () => {
    render(ground('cart', 'storefront'));
    const page = screen.getByRole('radio', { name: 'Page' });
    const drawer = screen.getByRole('radio', { name: 'Drawer' });
    expect([page.tabIndex, drawer.tabIndex]).toEqual([0, -1]);
    fireEvent.keyDown(page, { key: 'ArrowRight' });
    expect(getCartSurface()).toBe('drawer');
    expect(drawer.getAttribute('aria-checked')).toBe('true');
    expect(drawer).toHaveFocus();
    expect([page.tabIndex, drawer.tabIndex]).toEqual([-1, 0]);
    fireEvent.keyDown(drawer, { key: 'ArrowRight' }); // wraps
    expect(getCartSurface()).toBe('page');
    expect(page).toHaveFocus();
    fireEvent.keyDown(page, { key: 'ArrowLeft' }); // wraps back
    expect(getCartSurface()).toBe('drawer');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Drawer' }), { key: 'Home' });
    expect(getCartSurface()).toBe('page');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Page' }), { key: 'End' });
    expect(getCartSurface()).toBe('drawer');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Drawer' }), { key: 'ArrowUp' });
    expect(getCartSurface()).toBe('page');
  });

  it('the options are at least 44 px square and the page-only tag is scoped to the cart container', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/builder/editor/CartStage.module.css', 'utf8');
    const option = /^\.option \{([^}]*)\}/m.exec(css)![1]!;
    expect(option).toMatch(/min-inline-size:\s*44px/);
    expect(option).toMatch(/min-block-size:\s*44px/);
    // The root zone's blocks are the page-only ones; the rule is not a bare `:head` match.
    expect(css).toMatch(/\.pageOnly :is\(\[data-puck-dropzone='root:default-zone'\]\)/);
  });

  it('tags page-only blocks by CSS, scoped under the drawer stage', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/builder/editor/CartStage.module.css', 'utf8');
    expect(css).toContain('Cart page only');
    expect(css).toMatch(/\.pageOnly[^{]*data-puck-dropzone/);
  });
});

describe('exactPreviewPath', () => {
  it('opens /cart for the cart drawer only', () => {
    expect(exactPreviewPath('cart', 'drawer')).toBe('/cart');
    expect(exactPreviewPath('cart', 'page')).toBeNull();
    expect(exactPreviewPath('catalog', 'drawer')).toBeNull();
    expect(exactPreviewPath('shell', 'drawer')).toBeNull();
  });
});

describe('exact preview of the cart drawer', () => {
  const DRAFT = 'Draft cart heading, unique';
  /** The default cart document with one recognisable block added to the cart's main area. */
  const cartDoc = (): PuckDoc => {
    const d = structuredClone(defaultDoc('cart', 'storefront')!);
    const props = d.content[0]!.props as Record<string, unknown>;
    props.main = [{ type: 'Heading', props: { id: 'draft-h', text: DRAFT } }, ...(props.main as ComponentData[])];
    return d;
  };

  function open(layout: LayoutKind, readOnly: boolean) {
    builderOverrides.setState({ theme: null, layout });
    useEditorStore.setState({ status: 'waiting', layout, readOnly: false, docs: {}, docKey: 'catalog', epoch: 0, previewAs: DEFAULT_PREVIEW_AS, viewport: 768 });
    useEditorStore.getState().load({ layout, pageSet: { schemaVersion: 1, shell: defaultDoc('shell', layout)!, pages: { cart: cartDoc() } }, readOnly });
    useEditorStore.getState().selectDoc('cart');
    const surface = renderHook(() => useCartSurface());
    act(() => surface.result.current[1]('drawer'));
    surface.unmount();
  }

  function mount(el: ReactNode) {
    // As fixture-routes.tsx mounts the editor: under the fixture route with a trailing splat.
    const router = createMemoryRouter([{ path: '/__builder/doc/:docKey/*', element: el }], { initialEntries: ['/__builder/doc/cart'] });
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MantineProvider env="test"><RouterProvider router={router} /></MantineProvider>
      </QueryClientProvider>,
    );
  }

  const runtime = <ExactRuntime failTitle="x" failBody="y" />;

  beforeEach(() => { useUiStore.setState({ cartOpen: false }); });
  afterEach(() => { useUiStore.setState({ cartOpen: false }); });

  it('opens the real drawer on the draft cart document, and closes it on leaving', async () => {
    open('storefront', false);
    const { unmount } = mount(runtime);
    await waitFor(() => expect(useUiStore.getState().cartOpen).toBe(true));
    // The shop's own panel, not a copy: its title and the draft block inside it.
    const heading = await screen.findByText(DRAFT);
    expect(heading.closest('[data-sf-part="drawer"]')).not.toBeNull();
    unmount();
    expect(useUiStore.getState().cartOpen).toBe(false);
  });

  it('ExactPreview forces the desktop width the drawer needs', async () => {
    open('storefront', false);
    mount(<ExactPreview width={768} />);
    await waitFor(() => expect(useEditorStore.getState().viewport).toBe(1280));
  });

  it('ExactPreview leaves the width alone when it is already desktop', async () => {
    open('storefront', false);
    useEditorStore.setState({ viewport: 1280 });
    const set = vi.spyOn(useEditorStore.getState(), 'setViewport');
    mount(<ExactPreview width={1280} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(set).not.toHaveBeenCalled();
  });

  it.each([['the web app', 'webapp', false], ['the read-only view', 'storefront', true]] as const)('opens no drawer in %s', async (_name, layout, readOnly) => {
    open(layout, readOnly);
    const { unmount } = mount(<ExactPreview width={768} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(useUiStore.getState().cartOpen).toBe(false);
    expect(useEditorStore.getState().viewport).toBe(768);
    unmount();
  });
});

describe('drawer stage block styling', () => {
  it('draws no box for the cart container wrapper (the drawer ignores its blockStyle) and says so', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/builder/editor/CartStage.module.css', 'utf8');
    expect(css).toMatch(/\.sheet \[data-sf-style='CartContents'\][^{]*\{[^}]*display:\s*contents\s*!important/);
    // The drawer never draws the head slot, so only the root zone is tagged.
    expect(css).not.toMatch(/:head'\]/);
    render(ground('cart', 'storefront'));
    fireEvent.click(screen.getByRole('radio', { name: 'Drawer' }));
    expect(document.querySelector('[data-sf-builder-cart-drawer]')!.lastElementChild!.textContent).toMatch(/block styling on the cart block applies to the cart page only/i);
  });
});
