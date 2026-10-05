import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
import type { StorefrontSettings } from '@/types/settings.ts';

const settings = vi.hoisted(() => ({
  value: {
    currency: 'GBP', welcomeMessage: null, enabled: true, supportLinks: [], notices: [], turnstile: null,
    brand: { name: 'Northbound Supply', title: 'Northbound Supply', tagline: null, links: { whatsapp: null, telegram: null } },
    telegramWebApp: { mode: 'off' }, features: { layout: 'storefront', ordering: true, accounts: true },
  } as unknown,
}));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => settings.value as StorefrontSettings }));
vi.mock('@/api/orders.ts', async (orig) => ({
  ...(await orig<typeof import('@/api/orders.ts')>()),
  fetchOrder: vi.fn(), fetchOrderPayment: vi.fn(), fetchOrderPaymentOptions: vi.fn(() => new Promise(() => {})),
}));

import { BuilderModeProvider } from '@/builder/mode.ts';
import { previewFixturesFor } from '@/builder/editor/preview-states.ts';
import { OrderDetailPage } from '@/features/account/OrderDetailPage.tsx';
import { isDismissed, resetDismissalForTests } from '@/features/unpaid-prompt/useUnpaidOrder.ts';
import { useSessionStore } from '@/stores/session.ts';

function Shell({ id }: { id: string }): ReactNode {
  const picks = { OrderDetail: id };
  const mode = { editing: false, previewAs: null, previewStates: picks, previewFixtures: previewFixturesFor(picks) };
  return (
    <MantineProvider env="test">
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/account/orders/NB0977']}>
          <BuilderModeProvider value={mode}><OrderDetailPage /></BuilderModeProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>
  );
}

beforeEach(() => {
  resetDismissalForTests();
  useSessionStore.setState({ token: 'tok', customer: { id: 7, nickname: 'Ada' } });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useSessionStore.setState({ token: null, customer: null });
  resetDismissalForTests();
});

describe('the order page under the editor preview raises no shopper side effects', () => {
  it('switching the preview from an owing state to a paid one shows no "payment received" and says nothing', async () => {
    const show = vi.spyOn(notifications, 'show').mockReturnValue('x');
    const view = render(<Shell id="awaiting-payment" />);
    await screen.findByRole('region', { name: 'Payment needed' });
    view.rerender(<Shell id="shipped" />);
    await screen.findByRole('region', { name: 'Parcels' });
    await act(async () => { await Promise.resolve(); });
    expect(show).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('previewing an owing order does not mark the unpaid pop-up dismissed', async () => {
    render(<Shell id="awaiting-payment" />);
    await screen.findByRole('region', { name: 'Payment needed' });
    expect(isDismissed(7)).toBe(false);
  });
});
