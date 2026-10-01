import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { StorefrontSettings } from '@/types/settings.ts';

vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ currency: 'GBP', features: { layout: 'storefront', guestCheckout: true } }) as unknown as StorefrontSettings,
}));
vi.mock('@/templates/runtime.tsx', async (orig) => ({ ...(await orig<typeof import('@/templates/runtime.tsx')>()), Slot: () => null }));

import { CartDrawer, useCartDrawerReady } from '@/features/cart/CartDrawer.tsx';

afterEach(cleanup);

/**
 * The shells mount the sign-in modal only after the drawer's panel has loaded, so the document's
 * portal roots keep v0.7.0's order (drawer first, modal second) however the dynamic import races
 * the first render (the e2e dom-parity goldens pin the order itself).
 */
describe('useCartDrawerReady', () => {
  it('is false on the first render, true once the panel has loaded, and the drawer mounts before whatever waits on it', async () => {
    const seen: boolean[] = [];
    const Probe = () => {
      const ready = useCartDrawerReady();
      seen.push(ready);
      return ready ? <i data-testid="after-drawer" /> : null;
    };
    const { getByTestId } = render(
      <QueryClientProvider client={new QueryClient()}><MantineProvider env="test"><MemoryRouter>
        <CartDrawer />
        <Probe />
      </MemoryRouter></MantineProvider></QueryClientProvider>,
    );
    expect(seen[0]).toBe(false);
    for (let i = 0; i < 100 && !seen.includes(true); i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    expect(seen.at(-1)).toBe(true);
    // The drawer's (closed) portal root precedes the node that was waiting for it.
    const root = document.querySelector('.mantine-Drawer-root');
    expect(root).not.toBeNull();
    expect(root!.compareDocumentPosition(getByTestId('after-drawer')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('portal order by construction', () => {
  it('the drawer takes the first place among the body-level overlays however late its panel loads', async () => {
    const { Drawer } = await import('@mantine/core');
    render(
      <QueryClientProvider client={new QueryClient()}><MantineProvider>
        <MemoryRouter>
          <CartDrawer />
          <Drawer opened={false} keepMounted onClose={() => {}} title="other overlay" />
        </MemoryRouter>
      </MantineProvider></QueryClientProvider>,
    );
    for (let i = 0; i < 150 && document.querySelectorAll('.mantine-Drawer-root').length < 2; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    const shared = document.querySelector('[data-mantine-shared-portal-node]')!;
    const children = [...shared.children];

    expect(children.length).toBe(2);
    // The other overlay committed first (the panel is a dynamic import); the drawer is still ahead of it.
    expect(children[0]!.textContent).not.toContain('other overlay');
    expect(children[1]!.textContent).toContain('other overlay');
  });
});
