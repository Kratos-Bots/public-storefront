import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => ({ fetchCatalog: vi.fn(), fetchProduct: vi.fn() }));
vi.mock('@/api/catalog.ts', () => api);

import { useCatalog, useProduct } from '@/features/catalog/use-catalog.ts';
import { SETTINGS_KEY } from '@/app/settings.ts';
import { useSessionStore } from '@/stores/session.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

function Probe() {
  useCatalog();
  useProduct(5);
  return null;
}

function mount(access?: Record<string, unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(SETTINGS_KEY, (access ? { access } : {}) as unknown as StorefrontSettings);
  render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
}

const login = { storefront: 'login', registration: true, deniedMessage: '', deniedButtons: [] };

beforeEach(() => {
  api.fetchCatalog.mockResolvedValue({});
  api.fetchProduct.mockResolvedValue({});
  useSessionStore.getState().clear();
});

afterEach(() => {
  cleanup();
  api.fetchCatalog.mockReset();
  api.fetchProduct.mockReset();
});

describe('catalogue hooks in a non-public shop', () => {
  it('never ask for the anonymous catalogue or product', async () => {
    mount(login);
    // Let any (wrongly) enabled query fire before asserting that none did.
    await new Promise((r) => setTimeout(r, 20));
    expect(api.fetchCatalog).not.toHaveBeenCalled();
    expect(api.fetchProduct).not.toHaveBeenCalled();
  });

  it('do ask once a customer is signed in', async () => {
    useSessionStore.getState().setSession('tok', { id: 1, nickname: 'Ada' });
    mount(login);
    await waitFor(() => expect(api.fetchCatalog).toHaveBeenCalledWith(true));
    await waitFor(() => expect(api.fetchProduct).toHaveBeenCalledWith(5, true));
  });

  it('ask in a public shop with nobody signed in', async () => {
    mount({ ...login, storefront: 'public' });
    await waitFor(() => expect(api.fetchCatalog).toHaveBeenCalledWith(false));
    await waitFor(() => expect(api.fetchProduct).toHaveBeenCalledWith(5, false));
  });

  it('ask when the backend sends no access object', async () => {
    mount();
    await waitFor(() => expect(api.fetchCatalog).toHaveBeenCalledWith(false));
    await waitFor(() => expect(api.fetchProduct).toHaveBeenCalledWith(5, false));
  });
});
