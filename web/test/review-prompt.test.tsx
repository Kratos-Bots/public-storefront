import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router';

vi.mock('@/api/orders.ts', async (orig) => ({ ...(await orig<typeof import('@/api/orders.ts')>()), fetchUnpaidOrders: vi.fn() }));
vi.mock('@/api/reviews.ts', () => ({ fetchReviewableOrders: vi.fn(), fetchReviews: vi.fn(), submitReview: vi.fn() }));
vi.mock('@/app/builder-gate.ts', () => ({ isBuilderMode: vi.fn(() => false) }));
const shop = vi.hoisted(() => ({ reviews: { enabled: true, maxLength: 500 } as undefined | { enabled: boolean; maxLength: number } }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ supportLinks: [], currency: 'GBP', reviews: shop.reviews }) }));
vi.mock('@/app/preview-listener.ts', () => ({ isPreviewMode: vi.fn(() => false) }));

import { fetchUnpaidOrders } from '@/api/orders.ts';
import { fetchReviewableOrders } from '@/api/reviews.ts';
import { accessGate } from '@/app/access-gate.ts';
import { ReviewPrompt, resetReminderForTests } from '@/features/review-prompt/ReviewPrompt.tsx';
import { STORAGE_KEY } from '@/features/review-prompt/rules.ts';
import { UnpaidOrderPrompt } from '@/features/unpaid-prompt/UnpaidOrderPrompt.tsx';
import { resetDismissalForTests } from '@/features/unpaid-prompt/useUnpaidOrder.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useUiStore } from '@/stores/ui.ts';

const unpaidMock = vi.mocked(fetchUnpaidOrders);
const reviewableMock = vi.mocked(fetchReviewableOrders);

const HOUR = 3_600_000;
const reviewable = (reference: string) => ({
  reference, eligibleSince: new Date(Date.now() - 2 * 24 * HOUR).toISOString(), remindUntil: new Date(Date.now() + 5 * 24 * HOUR).toISOString(),
});
const unpaid = (reference: string) => ({
  reference, createdAt: '2026-10-03T10:00:00Z', totalAmount: 46.03, outstandingBalance: 46.03, payBy: null, canCancel: true, cancelBlockedBy: null,
});

const signIn = (id = 1) => useSessionStore.setState({ token: 'tok', customer: { id, nickname: 'Ada' } });
function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname + l.search}</span>;
}

const mount = (path = '/', client = new QueryClient()) =>
  render(
    <MantineProvider env="test">
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <UnpaidOrderPrompt />
          <ReviewPrompt />
          <Where />
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );

const reviewDialog = () => screen.queryByRole('dialog', { name: 'How was your order?' });
const unpaidDialog = () => screen.queryByRole('dialog', { name: 'You have an unpaid order' });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, Record<string, string>>;

beforeEach(() => {
  resetDismissalForTests();
  resetReminderForTests();
  localStorage.clear();
  useUiStore.setState({ loginOpen: false, cartOpen: false });
  unpaidMock.mockReset();
  unpaidMock.mockResolvedValue([] as never);
  reviewableMock.mockReset();
  reviewableMock.mockResolvedValue({ orders: [reviewable('K4M2QP')] });
  shop.reviews = { enabled: true, maxLength: 500 };
  accessGate.getState().reset();
  signIn();
});
afterEach(cleanup);

describe('ReviewPrompt', () => {
  it('shows the reminder naming the order, records the time, and closes with Not now', async () => {
    mount('/');
    await screen.findByRole('dialog', { name: 'How was your order?' });
    expect(screen.getByText(/Order K4M2QP has arrived/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Leave a review' })).toBeTruthy();
    expect(stored()['1']!.K4M2QP).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(reviewDialog()).toBeNull());
  });

  it('Leave a review opens the order page at its form and closes the dialog', async () => {
    mount('/');
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Leave a review' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/account/orders/K4M2QP?review=1'));
    expect(reviewDialog()).toBeNull();
  });

  it('the close button and Escape both mean Not now', async () => {
    mount('/');
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(reviewDialog()).toBeNull());
    cleanup();
    resetReminderForTests();
    localStorage.clear();
    mount('/');
    await screen.findByRole('dialog');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(reviewDialog()).toBeNull());
  });

  it('after a reload (stored less than 24 hours ago) it does not show; 25 hours ago it does', async () => {
    mount('/');
    await screen.findByRole('dialog');
    cleanup();
    resetReminderForTests(); // a reload
    mount('/');
    await settle();
    expect(reviewDialog()).toBeNull();
    cleanup();
    resetReminderForTests();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 1: { K4M2QP: new Date(Date.now() - 25 * HOUR).toISOString() } }));
    mount('/');
    await screen.findByRole('dialog', { name: 'How was your order?' });
  });

  it('shows once per page load: a second order does not follow the first being dismissed', async () => {
    reviewableMock.mockResolvedValue({ orders: [reviewable('FIRST'), reviewable('SECOND')] });
    mount('/');
    await screen.findByText(/Order FIRST has arrived/);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await settle();
    expect(reviewDialog()).toBeNull();
  });

  it('with storage unavailable it still shows at most once per page load', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      mount('/');
      await screen.findByRole('dialog', { name: 'How was your order?' });
      fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
      await settle();
      expect(reviewDialog()).toBeNull();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  it('never on checkout, and without asking the backend there', async () => {
    mount('/checkout');
    await settle();
    expect(reviewDialog()).toBeNull();
    expect(reviewableMock).not.toHaveBeenCalled();
    expect(unpaidMock).not.toHaveBeenCalled();
  });

  it('not on the reviewed order\'s own page', async () => {
    mount('/account/orders/K4M2QP');
    await settle();
    expect(reviewDialog()).toBeNull();
  });

  it('asks nothing when reviews are off or absent (older backend), or for a guest', async () => {
    shop.reviews = { enabled: false, maxLength: 0 };
    mount('/');
    await settle();
    cleanup();
    shop.reviews = undefined;
    mount('/');
    await settle();
    cleanup();
    shop.reviews = { enabled: true, maxLength: 500 };
    useSessionStore.setState({ token: null, customer: null });
    mount('/');
    await settle();
    expect(reviewableMock).not.toHaveBeenCalled();
    expect(reviewDialog()).toBeNull();
  });

  it('any failure of the list (an older backend answers 404) is silently no reminder', async () => {
    reviewableMock.mockRejectedValue(new Error('404'));
    mount('/');
    await settle();
    expect(reviewDialog()).toBeNull();
  });

  it('never while the cart drawer or sign-in dialog is open', async () => {
    useUiStore.setState({ cartOpen: true });
    mount('/');
    await settle();
    expect(reviewDialog()).toBeNull();
    expect(stored()).toEqual({});
  });

  it('is asked of the cache once for five minutes: remounting does not refetch', async () => {
    const client = new QueryClient();
    const first = mount('/', client);
    await screen.findByRole('dialog');
    first.unmount();
    resetReminderForTests();
    localStorage.clear();
    reviewableMock.mockClear();
    mount('/', client);
    await screen.findByRole('dialog');
    expect(reviewableMock).not.toHaveBeenCalled();
  });

  describe('against the unpaid-order pop-up', () => {
    it('with both endpoints returning orders, only the unpaid pop-up shows, and dismissing it does not bring the reminder in that load', async () => {
      unpaidMock.mockResolvedValue([unpaid('OWED01')] as never);
      mount('/');
      await screen.findByRole('dialog', { name: 'You have an unpaid order' });
      expect(reviewDialog()).toBeNull();
      expect(reviewableMock).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
      await waitFor(() => expect(unpaidDialog()).toBeNull());
      await settle();
      expect(reviewDialog()).toBeNull();
      expect(stored()).toEqual({});
    });

    it('waits for the unpaid lookup to answer before asking for reviewable orders', async () => {
      let answer: (v: never) => void = () => undefined;
      unpaidMock.mockReturnValue(new Promise((resolve) => { answer = resolve as never; }));
      mount('/');
      await settle();
      expect(reviewableMock).not.toHaveBeenCalled();
      expect(reviewDialog()).toBeNull();
      await act(async () => { answer([] as never); });
      await screen.findByRole('dialog', { name: 'How was your order?' });
    });

    it('a failed unpaid lookup does not hold the reminder back', async () => {
      unpaidMock.mockRejectedValue(new Error('offline'));
      mount('/');
      await screen.findByRole('dialog', { name: 'How was your order?' });
    });
  });
});
