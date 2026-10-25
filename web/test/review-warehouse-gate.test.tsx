import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/api/orders.ts', async (orig) => ({ ...(await orig<typeof import('@/api/orders.ts')>()), fetchUnpaidOrders: vi.fn() }));
vi.mock('@/api/reviews.ts', () => ({ fetchReviewableOrders: vi.fn(), fetchReviews: vi.fn(), submitReview: vi.fn() }));
vi.mock('@/app/builder-gate.ts', () => ({ isBuilderMode: vi.fn(() => false) }));
vi.mock('@/app/preview-listener.ts', () => ({ isPreviewMode: vi.fn(() => false) }));

import { fetchUnpaidOrders } from '@/api/orders.ts';
import { fetchReviewableOrders } from '@/api/reviews.ts';
import { SETTINGS_KEY, queryClient } from '@/lib/query-client.ts';
import { accessGate } from '@/app/access-gate.ts';
import { ReviewPrompt, resetReminderForTests } from '@/features/review-prompt/ReviewPrompt.tsx';
import { UnpaidOrderPrompt } from '@/features/unpaid-prompt/UnpaidOrderPrompt.tsx';
import { resetDismissalForTests } from '@/features/unpaid-prompt/useUnpaidOrder.ts';
import { resetWarehouseStore, useWarehouseStore } from '@/features/warehouses/store.ts';
import { resetVisitMarker } from '@/features/warehouses/visit.ts';
import { WarehouseGate } from '@/features/warehouses/WarehouseGate.tsx';
import { useSessionStore } from '@/stores/session.ts';
import { useUiStore } from '@/stores/ui.ts';
import type { StorefrontSettings } from '@/types/settings.ts';

const unpaidMock = vi.mocked(fetchUnpaidOrders);
const reviewableMock = vi.mocked(fetchReviewableOrders);

const settings = {
  enabled: true, supportLinks: [], currency: 'GBP',
  brand: { name: 'Kratos', shortName: 'KRATOS', tagline: '', title: 'Kratos', description: '', logoUrl: null, faviconUrl: null, logoHeight: 28, links: { whatsapp: null, telegram: null } },
  features: { warehouseSelect: true, warehousePrompt: true },
  access: { storefront: 'public' },
  reviews: { enabled: true, maxLength: 500 },
} as unknown as StorefrontSettings;

const LIST = [{ id: 1, name: 'Main', country: 'GB', isDefault: true }, { id: 2, name: 'Test EU', country: 'DE', isDefault: false }];
const order = (reference: string) => ({ reference, eligibleSince: '2026-10-01T00:00:00Z', remindUntil: new Date(Date.now() + 5 * 86_400_000).toISOString() });
const unpaidRow = { reference: 'OWED01', createdAt: '2026-10-03T10:00:00Z', totalAmount: 10, outstandingBalance: 10, payBy: null, canCancel: true, cancelBlockedBy: null };

function mount() {
  queryClient.setQueryData(SETTINGS_KEY, settings);
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider env="test">
        <MemoryRouter initialEntries={['/']}>
          <WarehouseGate>
            <p>catalogue</p>
            <UnpaidOrderPrompt />
            <ReviewPrompt />
          </WarehouseGate>
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
}
const settle = () => new Promise((r) => setTimeout(r, 40));

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  resetVisitMarker();
  resetWarehouseStore();
  resetDismissalForTests();
  resetReminderForTests();
  queryClient.clear();
  useUiStore.setState({ loginOpen: false, cartOpen: false });
  accessGate.getState().reset();
  useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Ada' } });
  useWarehouseStore.setState({ warehouseId: null, ctx: { enabled: true, list: LIST, failed: false, groups: null, carried: null } });
  unpaidMock.mockReset().mockResolvedValue([] as never);
  reviewableMock.mockReset().mockResolvedValue({ orders: [order('K4M2QP')] });
});
afterEach(cleanup);

describe('the full-page warehouse chooser', () => {
  it('keeps both the reminder and the unpaid pop-up away (they are not even mounted), and the reminder shows once a warehouse is chosen', async () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Where should we ship from?' })).toBeTruthy();
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(unpaidMock).not.toHaveBeenCalled();
    expect(reviewableMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Shop from Main' }));
    await screen.findByRole('dialog', { name: 'How was your order?' });
  });

  it('and with an unpaid order too, only the unpaid pop-up follows the choice', async () => {
    unpaidMock.mockResolvedValue([unpaidRow] as never);
    mount();
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Shop from Main' }));
    await screen.findByRole('dialog', { name: 'You have an unpaid order' });
    await settle();
    expect(screen.queryByRole('dialog', { name: 'How was your order?' })).toBeNull();
  });
});
