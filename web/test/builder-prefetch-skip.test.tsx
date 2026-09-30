import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';

const state = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('@/lib/telegram-webapp.ts', () => ({ isTelegramWebApp: () => false }));
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
import { closedGate } from '@/app/closed-gate.ts';

const settings = (enabled: boolean) => ({ enabled, features: { layout: 'storefront' } }) as unknown as StorefrontSettings;

function run(enabled = true) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(({ on }: { on: boolean }) => usePrefetchPageSet(settings(on)), { wrapper, initialProps: { on: enabled } });
  return { client, hook };
}

/** Let any effect-started fetch settle before asserting it never happened. */
const settle = () => new Promise((r) => setTimeout(r, 20));

afterEach(() => {
  cleanup();
  state.calls = [];
  closedGate.getState().setClosed(false);
  window.history.replaceState(null, '', '/');
});

describe('usePrefetchPageSet skips when nothing will read the set', () => {
  it('does not fetch while the closed page shows (shop disabled)', async () => {
    run(false);
    await settle();
    expect(state.calls).toEqual([]);
  });
  it('does not fetch while the kill switch has closed the gate mid-session', async () => {
    closedGate.getState().setClosed(true);
    run(true);
    await settle();
    expect(state.calls).toEqual([]);
  });
  it('still fetches on a closed-exempt route (the shared order link renders behind a closed shop)', async () => {
    window.history.replaceState(null, '', '/order/NB-1/key');
    const { client } = run(false);
    await waitFor(() => expect(client.getQueryState(['pages', 'storefront'])?.status).toBe('success'));
    expect(state.calls).toEqual(['storefront']);
  });
  it('fetches once the shop reopens', async () => {
    const { client, hook } = run(false);
    await settle();
    expect(state.calls).toEqual([]);
    hook.rerender({ on: true });
    await waitFor(() => expect(client.getQueryState(['pages', 'storefront'])?.status).toBe('success'));
    expect(state.calls).toEqual(['storefront']);
  });
  it.each(['/__builder', '/__builder/pages/catalog'])('does not fetch on the builder route %s', async (path) => {
    window.history.replaceState(null, '', path);
    run(true);
    await settle();
    expect(state.calls).toEqual([]);
  });
});
