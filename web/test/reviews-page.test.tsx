import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  it('without IntersectionObserver, Load more fetches the next page and appends it', async () => {
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

  it('without IntersectionObserver, a failed Load more keeps the loaded reviews and offers a retry beside the control', async () => {
    fetchMock
      .mockResolvedValueOnce({ data: { stats: { average: 4.5, count: 12 }, reviews: [review(12, 5, 'Newest')] }, meta: meta(1, 2) })
      .mockRejectedValueOnce(new ApiError(0, 'Network error'))
      .mockResolvedValueOnce({ data: { stats: { average: 4.5, count: 12 }, reviews: [review(11, 4, 'Older')] }, meta: meta(2, 2) });
    mount();
    await screen.findByText('Newest');
    fireEvent.click(screen.getByRole('button', { name: 'Load more reviews' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Network error');
    expect(screen.getByText('Newest')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Reviews did not load' })).toBeNull();
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await screen.findByText('Older');
    expect(screen.queryByRole('alert')).toBeNull();
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

/** A stand-in for the browser's observer: the test decides when the sentinel comes into range. */
class FakeObserver {
  static all: FakeObserver[] = [];
  disconnected = false;
  target: Element | null = null;
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeObserver.all.push(this);
  }
  observe(el: Element) { this.target = el; }
  unobserve() {}
  disconnect() { this.disconnected = true; }
  takeRecords() { return []; }
  static live() { return FakeObserver.all.filter((o) => !o.disconnected); }
  static intersect() {
    for (const o of FakeObserver.live()) o.callback([{ isIntersecting: true, target: o.target! } as IntersectionObserverEntry], o as unknown as IntersectionObserver);
  }
}

describe('the reviews page loads more as the shopper scrolls', () => {
  const first = { data: { stats: { average: 4.5, count: 12 }, reviews: [review(12, 5, 'Newest')] }, meta: meta(1, 2) };
  const second = { data: { stats: { average: 4.5, count: 12 }, reviews: [review(11, 4, 'Older')] }, meta: meta(2, 2) };
  beforeEach(() => {
    FakeObserver.all = [];
    vi.stubGlobal('IntersectionObserver', FakeObserver);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('has no button, and watches a sentinel with 400px to spare', async () => {
    fetchMock.mockResolvedValueOnce(first);
    mount();
    await screen.findByText('Newest');
    expect(screen.queryByRole('button', { name: 'Load more reviews' })).toBeNull();
    expect(FakeObserver.live()).toHaveLength(1);
    expect(FakeObserver.live()[0]!.options?.rootMargin).toBe('400px');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks for the next page once the sentinel is in range, says so while it loads, and appends it', async () => {
    let release: (v: typeof second) => void = () => {};
    fetchMock.mockResolvedValueOnce(first).mockImplementationOnce(() => new Promise((r) => { release = r as typeof release; }));
    mount();
    await screen.findByText('Newest');
    act(() => FakeObserver.intersect());
    expect(await screen.findByText('Loading more reviews')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(fetchMock).toHaveBeenLastCalledWith(2, 10);
    // Never while a fetch is in flight: nothing is watching until it lands.
    expect(FakeObserver.live()).toHaveLength(0);
    await act(async () => release(second));
    await screen.findByText('Older');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Loading more reviews')).toBeNull();
  });

  it('does not ask again after the last page', async () => {
    fetchMock.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    mount();
    await screen.findByText('Newest');
    act(() => FakeObserver.intersect());
    await screen.findByText('Older');
    await waitFor(() => expect(FakeObserver.live()).toHaveLength(0));
    act(() => FakeObserver.intersect());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-sf-part="reviews-sentinel"]')).toBeNull();
  });

  it('watches again after each page, so one that leaves the sentinel in range is followed by the next', async () => {
    const third = { data: { stats: { average: 4.5, count: 12 }, reviews: [review(10, 3, 'Oldest')] }, meta: { ...meta(3, 3) } };
    fetchMock.mockResolvedValueOnce({ ...first, meta: meta(1, 3) }).mockResolvedValueOnce({ ...second, meta: meta(2, 3) }).mockResolvedValueOnce(third);
    mount();
    await screen.findByText('Newest');
    act(() => FakeObserver.intersect());
    await screen.findByText('Older');
    await waitFor(() => expect(FakeObserver.live()).toHaveLength(1));
    act(() => FakeObserver.intersect());
    await screen.findByText('Oldest');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('a failed page keeps the retry button and nothing retries by itself', async () => {
    fetchMock.mockResolvedValueOnce(first).mockRejectedValueOnce(new ApiError(0, 'Network error')).mockResolvedValueOnce(second);
    mount();
    await screen.findByText('Newest');
    act(() => FakeObserver.intersect());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Network error');
    expect(FakeObserver.live()).toHaveLength(0);
    act(() => FakeObserver.intersect());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await screen.findByText('Older');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
