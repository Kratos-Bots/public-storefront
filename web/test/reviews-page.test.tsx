import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const shop = vi.hoisted(() => ({ reviews: { enabled: true, maxLength: 500 } as undefined | { enabled: boolean; maxLength: number } }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ currency: 'GBP', supportLinks: [], reviews: shop.reviews }) }));
vi.mock('@/api/reviews.ts', () => ({ fetchReviews: vi.fn(), fetchReviewableOrders: vi.fn(), submitReview: vi.fn() }));

import { fetchReviews } from '@/api/reviews.ts';
import { ReviewsPage } from '@/features/reviews/ReviewsPage.tsx';
import { ApiError } from '@/lib/errors.ts';

const fetchMock = vi.mocked(fetchReviews);

const meta = (page: number, totalPages: number) => ({
  page, limit: 10, totalItems: 12, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1,
});
const review = (id: number, rating: number, comment: string | null) => ({ id, rating, comment, createdAt: '2026-10-01T09:00:00Z' });

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MantineProvider env="test">
        <MemoryRouter><ReviewsPage /></MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  fetchMock.mockReset();
  shop.reviews = { enabled: true, maxLength: 500 };
});
afterEach(cleanup);

describe('the reviews page', () => {
  it('shows the average and count, then the reviews newest first with stars and dates, and no names', async () => {
    fetchMock.mockResolvedValue({
      data: { stats: { average: 4.66, count: 12 }, reviews: [review(2, 5, 'Fast and well packed'), review(1, 4, null)] },
      meta: meta(1, 1),
    });
    mount();
    await screen.findByText('Fast and well packed');
    expect(screen.getByRole('heading', { level: 1, name: 'Customer reviews' })).toBeTruthy();
    expect(screen.getByText('4.7')).toBeTruthy();
    expect(screen.getByText('12 reviews')).toBeTruthy();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByRole('img', { name: '5 stars out of 5' })).toBeTruthy();
    expect(within(items[0]!).getByText('Fast and well packed')).toBeTruthy();
    expect(within(items[0]!).getByText('1 October 2026')).toBeTruthy();
    expect(within(items[1]!).getByText('Rated without a comment.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load more reviews' })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(1, 10);
  });

  it('Load more fetches the next page and appends it', async () => {
    fetchMock
      .mockResolvedValueOnce({ data: { stats: { average: 4.5, count: 12 }, reviews: [review(12, 5, 'Newest')] }, meta: meta(1, 2) })
      .mockResolvedValueOnce({ data: { stats: { average: 4.5, count: 12 }, reviews: [review(11, 4, 'Older')] }, meta: meta(2, 2) });
    mount();
    await screen.findByText('Newest');
    fireEvent.click(screen.getByRole('button', { name: 'Load more reviews' }));
    await screen.findByText('Older');
    expect(fetchMock).toHaveBeenLastCalledWith(2, 10);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([expect.stringContaining('Newest'), expect.stringContaining('Older')]);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more reviews' })).toBeNull());
  });

  it('with no reviews yet, says so and shows no summary', async () => {
    fetchMock.mockResolvedValue({ data: { stats: { average: null, count: 0 }, reviews: [] }, meta: meta(1, 0) });
    mount();
    await screen.findByText('No reviews yet');
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByText(/out of 5/)).toBeNull();
  });

  it('a failed load says so and offers Try again', async () => {
    fetchMock.mockRejectedValueOnce(new ApiError(0, 'Network error'));
    mount();
    await screen.findByRole('heading', { level: 1, name: 'Reviews did not load' });
    fetchMock.mockResolvedValue({ data: { stats: { average: 5, count: 1 }, reviews: [review(1, 5, 'Great')] }, meta: meta(1, 1) });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Great');
  });

  it('while reviews are off (or an older backend sends none) it is the not-found page and asks nothing', () => {
    shop.reviews = { enabled: false, maxLength: 0 };
    mount();
    expect(screen.getByRole('heading', { name: /./ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Customer reviews' })).toBeNull();
    cleanup();
    shop.reviews = undefined;
    mount();
    expect(screen.queryByRole('heading', { name: 'Customer reviews' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
