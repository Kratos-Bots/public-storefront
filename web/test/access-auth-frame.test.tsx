import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';

// Nothing published: every page is its built-in default, as on a fresh shop.
const api = vi.hoisted(() => ({ fetchCatalog: vi.fn(), fetchProduct: vi.fn() }));
vi.mock('@/api/pages.ts', () => ({ fetchPageSet: async () => null, fetchPublished: async () => ({ pageSet: null, text: null }) }));
vi.mock('@/api/catalog.ts', () => api);

import { routes } from '@/app/routes.tsx';
import { SETTINGS_KEY } from '@/app/settings.ts';
import { accessGate } from '@/app/access-gate.ts';
import { useSessionStore } from '@/stores/session.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

const SETTINGS = {
  currency: 'GBP', enabled: true, supportLinks: [], notices: [], features: { accounts: true },
  brand: {
    name: 'Example Shop', shortName: 'EXAMPLE', tagline: '', title: 'Example Shop', description: '',
    logoUrl: null, faviconUrl: null, logoHeight: 28, links: { whatsapp: null, telegram: null },
  },
  login: { whatsapp: { available: true, number: '447700900000' }, telegram: { available: false, botUsername: null } },
  access: { storefront: 'login', registration: true, deniedMessage: '', deniedButtons: [] },
} as unknown as StorefrontSettings;

function mount(at: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(SETTINGS_KEY, SETTINGS);
  const router = createMemoryRouter(routes, { initialEntries: [at] });
  render(
    <QueryClientProvider client={client}>
      <MantineProvider env="test">
        <RouterProvider router={router} />
      </MantineProvider>
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  useSessionStore.getState().clear();
  accessGate.getState().reset();
});

afterEach(() => {
  cleanup();
  api.fetchCatalog.mockReset();
});

describe('the real routes in a sign-in-only shop, signed out', () => {
  it('render the sign-in options on /login without the shop frame or the catalogue', async () => {
    mount('/login');
    expect(await screen.findByRole('heading', { name: 'Sign in to Example Shop' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with WhatsApp/ })).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(api.fetchCatalog).not.toHaveBeenCalled();
  });

  it('render the reset-password form', async () => {
    mount('/reset-password');
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByText("This page isn't here")).toBeNull();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(api.fetchCatalog).not.toHaveBeenCalled();
  });

  it('send the home page to /login', () => {
    const router = mount('/');
    expect(router.state.location.pathname).toBe('/login');
  });
});
