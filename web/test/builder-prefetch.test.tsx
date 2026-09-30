import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';

const state = vi.hoisted(() => ({ telegram: false, calls: [] as string[] }));
vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => state.telegram }));
vi.mock('@/api/pages.ts', () => ({
  fetchPageSet: (layout: string) => {
    state.calls.push(layout);
    return Promise.resolve(null);
  },
  fetchPublished: (layout: string) => {
    state.calls.push(layout);
    return Promise.resolve({ pageSet: null, text: null });
  },
}));

import { usePrefetchPageSet } from '@/app/App.tsx';

const settings = (layout: 'storefront' | 'menu' | 'webapp') => ({ features: { layout } }) as unknown as StorefrontSettings;

function run(layout: 'storefront' | 'menu' | 'webapp') {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  renderHook(() => usePrefetchPageSet(settings(layout)), { wrapper });
  return client;
}

afterEach(() => { cleanup(); state.telegram = false; state.calls = []; });

describe('usePrefetchPageSet', () => {
  it('starts the page-set fetch for the store\'s layout as soon as settings are in, under the key PuckShell reads', async () => {
    const client = run('menu');
    await waitFor(() => expect(client.getQueryState(['pages', 'menu'])?.status).toBe('success'));
    expect(state.calls).toEqual(['menu']);
  });
  it('inside Telegram it fetches the web app\'s set, whatever the store chose', async () => {
    state.telegram = true;
    const client = run('storefront');
    await waitFor(() => expect(client.getQueryState(['pages', 'webapp'])?.status).toBe('success'));
    expect(state.calls).toEqual(['webapp']);
  });
});
