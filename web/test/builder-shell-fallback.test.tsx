import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { PageSet } from '@/builder/types.ts';

vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({
    currency: 'GBP', enabled: true, supportLinks: [], notices: [],
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: '', links: { whatsapp: null, telegram: null } },
    features: { layout: 'storefront', ordering: true, guestCheckout: false, accounts: true, verify: false, tracking: false, wholesale: false, upsell: false },
  }),
}));
vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => false }));
vi.mock('@/components/Brand.tsx', () => ({ Brand: () => <span>brand</span> }));
vi.mock('@/features/notices/NoticeBanners.tsx', () => ({ NoticeBanners: () => null }));
vi.mock('@/features/notices/CutoffBar.tsx', () => ({ CutoffBar: () => null }));
vi.mock('@/features/auth/LoginModal.tsx', () => ({ LoginModal: () => <i data-mark="login-modal" /> }));
vi.mock('@/features/cart/CartDrawer.tsx', () => ({ CartDrawer: () => <i data-mark="cart-drawer" />, useCartDrawerReady: () => true }));
vi.mock('@/features/cart/MobileCartBar.tsx', () => ({ MobileCartBar: () => <i data-mark="cart-bar" />, useMobileCartBar: () => false }));
// A route-bound shell block that breaks on demand, so a *valid* published shell can crash at render
// time and take the whole shell to its default (spec §5.6).
vi.mock('@/builder/blocks/ContactStrip.tsx', async () => {
  const { z } = await import('zod');
  const { defineBlock } = await import('@/builder/define.ts');
  return {
    block: defineBlock<{ id: string }>({
      style: false,
      name: 'ContactStrip', label: 'Contact strip', category: 'shell', layouts: 'all', routeBound: true, slots: [],
      schema: z.object({}), defaultProps: {},
      render: ({ id }) => {
        if (id === 'boom') throw new Error('boom');
        return null;
      },
    }),
  };
});

import { PageSetOverrideProvider, PuckShell } from '@/builder/runtime.tsx';
import { defaultDoc } from '@/builder/defaults/index.ts';

const root = { props: { title: '', description: '', chrome: 'shell' as const } };

function mount(pageSet: PageSet) {
  const router = createMemoryRouter([{ path: '/', element: <PuckShell />, children: [{ index: true, handle: { routeKey: 'catalog' }, element: <p>page</p> }] }]);
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <PageSetOverrideProvider pageSet={pageSet}>
        <MantineProvider env="test"><RouterProvider router={router} /></MantineProvider>
      </PageSetOverrideProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('PuckShell falling back to the default shell', () => {
  it('mounts the system cart bar when the crashed shell had placed its own', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(defaultDoc('shell', 'storefront')!.content.some((c) => c.type === 'MobileCartBar')).toBe(false);
    const { container } = mount({
      schemaVersion: 1,
      shell: { root, content: [
        { type: 'MobileCartBar', props: { id: 'bar' } },
        { type: 'ContactStrip', props: { id: 'boom' } },
        { type: 'PageOutlet', props: { id: 'out' } },
      ] },
      pages: {},
    });
    expect(screen.getByText('page')).toBeInTheDocument();
    expect(container.querySelector('header')).not.toBeNull();
    expect(container.querySelectorAll('[data-mark="cart-bar"]')).toHaveLength(1);
  });
  it('still mounts it exactly once when the published shell renders fine', () => {
    const { container } = mount({
      schemaVersion: 1,
      shell: { root, content: [{ type: 'MobileCartBar', props: { id: 'bar' } }, { type: 'ContactStrip', props: { id: 'ok' } }, { type: 'PageOutlet', props: { id: 'out' } }] },
      pages: {},
    });
    expect(container.querySelector('header')).toBeNull();
    expect(container.querySelectorAll('[data-mark="cart-bar"]')).toHaveLength(1);
  });
});
