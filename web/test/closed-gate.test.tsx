import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';

const api = vi.hoisted(() => ({ fetchSettings: vi.fn() }));
vi.mock('@/api/settings.ts', () => ({ fetchSettings: api.fetchSettings }));

import { CLOSED_POLL_MS, ClosedGate } from '@/app/App.tsx';
import { SETTINGS_KEY } from '@/app/settings.ts';
import { closedGate } from '@/app/closed-gate.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

function settings(enabled: boolean): StorefrontSettings {
  return {
    enabled,
    closedMessage: 'Back shortly.',
    supportLinks: [],
    brand: {
      name: 'Kratos', shortName: 'KRATOS', tagline: '', title: 'Kratos', description: '',
      logoUrl: null, faviconUrl: null, logoHeight: 28,
      links: { whatsapp: null, telegram: null },
    },
  } as unknown as StorefrontSettings;
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(SETTINGS_KEY, settings(true));
  return render(
    <QueryClientProvider client={client}>
      <MantineProvider env="test">
        <ClosedGate>
          <p>Shop</p>
        </ClosedGate>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

function setPath(pathname: string) {
  window.history.pushState({}, '', pathname);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  api.fetchSettings.mockReset();
  closedGate.getState().setClosed(false);
  setPath('/');
});

describe('ClosedGate', () => {
  it('reopens on its own after a mid-session 503, without a reload', async () => {
    vi.useFakeTimers();
    api.fetchSettings.mockResolvedValue(settings(true));
    // What api/client.ts does when any call answers 503 STOREFRONT_DISABLED: the gate
    // closes while the cached settings still say enabled, so nothing else would refetch.
    closedGate.getState().setClosed(true);

    mount();
    expect(screen.getByText('Currently closed')).toBeInTheDocument();
    expect(screen.queryByText('Shop')).toBeNull();
    expect(api.fetchSettings).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLOSED_POLL_MS);
    });

    expect(api.fetchSettings).toHaveBeenCalled();
    expect(closedGate.getState().closed).toBe(false);
    expect(screen.getByText('Shop')).toBeInTheDocument();
  });

  it('stops polling once the shop is open again', async () => {
    vi.useFakeTimers();
    api.fetchSettings.mockResolvedValue(settings(true));
    closedGate.getState().setClosed(true);

    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLOSED_POLL_MS);
    });
    const callsWhenReopened = api.fetchSettings.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLOSED_POLL_MS * 3);
    });
    expect(api.fetchSettings.mock.calls.length).toBe(callsWhenReopened);
  });

  it('keeps polling while the settings still report the shop closed', async () => {
    vi.useFakeTimers();
    api.fetchSettings.mockResolvedValue(settings(false));
    closedGate.getState().setClosed(true);

    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLOSED_POLL_MS);
    });
    expect(closedGate.getState().closed).toBe(true);
    const first = api.fetchSettings.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLOSED_POLL_MS);
    });
    expect(api.fetchSettings.mock.calls.length).toBeGreaterThan(first);
    expect(screen.getByText('Currently closed')).toBeInTheDocument();
  });

  it('still renders children on an exempt path while the shop is closed', () => {
    api.fetchSettings.mockResolvedValue(settings(true));
    closedGate.getState().setClosed(true);
    setPath('/order-placed');

    mount();
    expect(screen.getByText('Shop')).toBeInTheDocument();
    expect(screen.queryByText('Currently closed')).toBeNull();
  });

  it('still gates a non-exempt path while the shop is closed', () => {
    api.fetchSettings.mockResolvedValue(settings(true));
    closedGate.getState().setClosed(true);
    setPath('/checkout');

    mount();
    expect(screen.getByText('Currently closed')).toBeInTheDocument();
    expect(screen.queryByText('Shop')).toBeNull();
  });
});
