import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

vi.mock('@/api/orders.ts', async (orig) => ({ ...(await orig<typeof import('@/api/orders.ts')>()), fetchUnpaidOrders: vi.fn() }));
vi.mock('@/app/builder-gate.ts', () => ({ isBuilderMode: vi.fn(() => false) }));
vi.mock('@/app/preview-listener.ts', () => ({ isPreviewMode: vi.fn(() => false) }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ currency: 'GBP' }) }));
vi.mock('@/features/unpaid-prompt/UnpaidOrderDialog.tsx', () => { throw new Error('Failed to fetch dynamically imported module'); });

import { fetchUnpaidOrders } from '@/api/orders.ts';
import { UnpaidOrderPrompt } from '@/features/unpaid-prompt/UnpaidOrderPrompt.tsx';
import { resetDismissalForTests } from '@/features/unpaid-prompt/useUnpaidOrder.ts';
import { useSessionStore } from '@/stores/session.ts';

beforeEach(() => {
  resetDismissalForTests();
  sessionStorage.clear();
  useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Ada' } });
});
afterEach(cleanup);

describe('UnpaidOrderPrompt when its dialog chunk cannot load', () => {
  it('renders nothing, throws nothing and logs nothing', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetchUnpaidOrders).mockResolvedValue([{ reference: 'K4M2QP', accessKey: 'k', createdAt: '', totalAmount: 5, outstandingBalance: 5, payBy: null, canCancel: true, cancelBlockedBy: null }] as never);
    render(
      <MantineProvider env="test">
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter><UnpaidOrderPrompt /><span>page</span></MemoryRouter>
        </QueryClientProvider>
      </MantineProvider>,
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.getByText('page')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
