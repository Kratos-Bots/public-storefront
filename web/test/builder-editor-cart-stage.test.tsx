import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useContext, type ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { StorefrontSettings } from '@/types/settings.ts';

vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [],
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront' },
  }) as unknown as StorefrontSettings,
}));

import { PageGround } from '@/builder/editor/page-ground.tsx';
import { CartHostContext } from '@/features/cart/cart-host.ts';
import { exactPreviewPath, getCartSurface, useCartSurface } from '@/builder/editor/cart-surface.ts';
import { useEditorStore } from '@/builder/editor/store.ts';
import type { DocKey, LayoutKind } from '@/builder/types.ts';

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
