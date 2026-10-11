import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ order: {} as Record<string, unknown> }));
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ currency: 'GBP', brand: { name: 'Northbound Supply', links: {} }, supportLinks: [], reviews: { enabled: true, maxLength: 40 } }),
}));
vi.mock('@/features/account/queries.ts', async (orig) => ({
  ...(await orig<typeof import('@/features/account/queries.ts')>()),
  useOrder: () => ({ data: h.order, isPending: false, isError: false }),
  useProfile: () => ({ data: undefined, isPending: true, isError: false }),
}));
vi.mock('@/api/reviews.ts', () => ({ submitReview: vi.fn(), fetchReviewableOrders: vi.fn(), fetchReviews: vi.fn() }));

import { submitReview } from '@/api/reviews.ts';
import { OrderDetailPage } from '@/features/account/OrderDetailPage.tsx';
import { silentParts } from '@/features/account/order-layout.ts';
import { ApiError } from '@/lib/errors.ts';
import { RenderDoc } from '@/builder/render.tsx';
import { validateDoc } from '@/builder/guard.ts';
import { partId } from '@/builder/parts.ts';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';

const submitMock = vi.mocked(submitReview);

const base = {
  reference: 'K4M2QP', totalAmount: 46.03, outstandingBalance: 0, createdAt: '2026-01-02T10:00:00Z', status: 'delivered',
  subtotal: 40, shippingAmount: 6.03, discountAmount: 0, items: [{ name: 'Oat Bar', quantity: 1, unitPrice: 4, lineTotal: 4 }], payments: [], shipments: [],
};
const canReview = { ...base, review: { canReview: true, existing: null } };
const existing = (status: 'pending' | 'approved' | 'rejected') => ({
  ...base, review: { canReview: false, existing: { rating: 4, comment: 'Arrived quickly', status, createdAt: '2026-01-09T10:00:00Z' } },
});

let client: QueryClient;
function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname + l.search}</span>;
}
const at = (path: string, ui = <OrderDetailPage />) =>
  render(
    <QueryClientProvider client={client}>
      <MantineProvider env="test">
        <MemoryRouter initialEntries={[path]}>
          <Routes><Route path="/account/*" element={ui} /></Routes>
          <Where />
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
const mount = (search = '') => at(`/account/orders/K4M2QP${search}`);
const stars = () => screen.getAllByRole('radio');
const send = () => screen.getByRole('button', { name: /Send review|Sending/ }) as HTMLButtonElement;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  submitMock.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe('the review form', () => {
  it('is a real radio group of five stars, each named "n star(s)", with Send disabled until one is chosen', async () => {
    h.order = canReview;
    mount();
    const group = await screen.findByRole('radiogroup', { name: 'Your rating' });
    expect(within(group).getAllByRole('radio').map((r) => r.id && (r as HTMLInputElement).labels?.[0]?.textContent)).toEqual(['1 star', '2 stars', '3 stars', '4 stars', '5 stars']);
    expect(send().disabled).toBe(true);
    expect(screen.getByText('Choose a rating to send your review.')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('4 stars'));
    expect((screen.getByLabelText('4 stars') as HTMLInputElement).checked).toBe(true);
    expect(send().disabled).toBe(false);
  });

  it('counts the comment against the shop\'s limit and refuses text past it', async () => {
    h.order = canReview;
    mount();
    const box = (await screen.findByLabelText(/Your comments/)) as HTMLTextAreaElement;
    expect(box.maxLength).toBe(40);
    expect(screen.getByText('0 of 40')).toBeTruthy();
    fireEvent.change(box, { target: { value: 'Lovely packaging' } });
    expect(screen.getByText('16 of 40')).toBeTruthy();
  });

  it('sends the rating and the trimmed comment, shows the thank-you and the read-only review awaiting approval', async () => {
    h.order = canReview;
    submitMock.mockResolvedValue({ review: { rating: 5, comment: 'Lovely packaging', status: 'pending', createdAt: '2026-01-09T10:00:00Z' } });
    mount();
    fireEvent.click(await screen.findByLabelText('5 stars'));
    fireEvent.change(screen.getByLabelText(/Your comments/), { target: { value: '  Lovely packaging  ' } });
    fireEvent.click(send());
    await screen.findByText(/Thank you for your review/);
    expect(submitMock).toHaveBeenCalledWith('K4M2QP', { rating: 5, comment: 'Lovely packaging' });
    expect(screen.getByText(/awaiting approval/)).toBeTruthy();
    expect(screen.getByRole('img', { name: '5 stars out of 5' })).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('leaves the comment out when it is blank', async () => {
    h.order = canReview;
    submitMock.mockResolvedValue({ review: { rating: 3, comment: null, status: 'pending', createdAt: '2026-01-09T10:00:00Z' } });
    mount();
    fireEvent.click(await screen.findByLabelText('3 stars'));
    fireEvent.change(screen.getByLabelText(/Your comments/), { target: { value: '   ' } });
    fireEvent.click(send());
    await screen.findByText(/Thank you/);
    expect(submitMock).toHaveBeenCalledWith('K4M2QP', { rating: 3 });
  });

  it('shows the in-flight state while sending and does not send twice', async () => {
    h.order = canReview;
    let finish: (v: never) => void = () => undefined;
    submitMock.mockReturnValue(new Promise((resolve) => { finish = resolve as never; }));
    mount();
    fireEvent.click(await screen.findByLabelText('2 stars'));
    fireEvent.click(send());
    await waitFor(() => expect(send().textContent).toBe('Sending'));
    expect(send().disabled).toBe(true);
    fireEvent.submit(send().closest('form')!);
    expect(submitMock).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ review: { rating: 2, comment: null, status: 'approved', createdAt: '2026-01-09T10:00:00Z' } } as never); });
    await screen.findByText(/Thank you/);
  });

  it('a 422 shows the server\'s message inline and keeps the rating and the comment', async () => {
    h.order = canReview;
    submitMock.mockRejectedValue(new ApiError(422, 'Reviews open 7 days after delivery.'));
    mount();
    fireEvent.click(await screen.findByLabelText('4 stars'));
    fireEvent.change(screen.getByLabelText(/Your comments/), { target: { value: 'Good' } });
    fireEvent.click(send());
    expect((await screen.findByRole('alert')).textContent).toBe('Reviews open 7 days after delivery.');
    expect((screen.getByLabelText(/Your comments/) as HTMLTextAreaElement).value).toBe('Good');
    expect((screen.getByLabelText('4 stars') as HTMLInputElement).checked).toBe(true);
    expect(send().disabled).toBe(false);
  });

  it('a network failure keeps what was typed and says so', async () => {
    h.order = canReview;
    submitMock.mockRejectedValue(new ApiError(0, 'Network error'));
    mount();
    fireEvent.click(await screen.findByLabelText('1 star'));
    fireEvent.change(screen.getByLabelText(/Your comments/), { target: { value: 'Slow' } });
    fireEvent.click(send());
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not send your review/);
    expect((screen.getByLabelText(/Your comments/) as HTMLTextAreaElement).value).toBe('Slow');
  });

  it.each([[409, 'You have already reviewed this order'], [422, 'A review for this order already exists.']])(
    'a double submit (%s) refetches the order instead of showing a scary error', async (status, message) => {
      h.order = canReview;
      submitMock.mockRejectedValue(new ApiError(status, message));
      const invalidate = vi.spyOn(client, 'invalidateQueries');
      mount();
      fireEvent.click(await screen.findByLabelText('5 stars'));
      fireEvent.click(send());
      await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['order', 'K4M2QP'] }));
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['orders', 'reviewable'] });
      expect(screen.getByRole('alert').textContent).toBe('This order already has a review.');
    });

  it('a successful send refreshes the order, the reminder list and the public list', async () => {
    h.order = canReview;
    submitMock.mockResolvedValue({ review: { rating: 5, comment: null, status: 'pending', createdAt: '2026-01-09T10:00:00Z' } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    mount();
    fireEvent.click(await screen.findByLabelText('5 stars'));
    fireEvent.click(send());
    await screen.findByText(/Thank you/);
    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toContainEqual(['order', 'K4M2QP']);
    expect(keys).toContainEqual(['orders', 'reviewable']);
    expect(keys).toContainEqual(['reviews']);
  });
});

describe('an existing review', () => {
  it.each([
    ['pending', /Thanks, your review is awaiting approval/],
    ['approved', /^Published$/],
    ['rejected', /^Submitted$/],
  ] as const)('%s: read-only with its rating, comment and status', async (status, line) => {
    h.order = existing(status);
    mount();
    await screen.findByText('Arrived quickly');
    expect(screen.getByRole('img', { name: '4 stars out of 5' })).toBeTruthy();
    expect(screen.getByText(line)).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send review' })).toBeNull();
  });

  it('a rejected review is shown as submitted, with nothing alarming', async () => {
    h.order = existing('rejected');
    mount();
    await screen.findByText('Arrived quickly');
    expect(document.body.textContent).not.toMatch(/reject|declin|denied/i);
  });
});

describe('neither form nor review', () => {
  it.each([
    ['an order that cannot be reviewed', { ...base, review: { canReview: false, existing: null } }],
    ['an older backend that sends no review', base],
  ])('%s renders nothing', async (_name, order) => {
    h.order = order;
    mount();
    await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByText('Rate your order')).toBeNull();
    expect(screen.queryByText('Your review')).toBeNull();
  });
});

describe('?review=1', () => {
  it('scrolls the form into view, focuses the rating, and removes the parameter without a new history entry', async () => {
    h.order = canReview;
    mount('?review=1');
    await screen.findByRole('radiogroup');
    await waitFor(() => expect(document.activeElement).toBe(stars()[0]));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/account/orders/K4M2QP'));
  });

  it('an order that cannot be reviewed ignores the parameter silently (and drops it)', async () => {
    h.order = { ...base, review: { canReview: false, existing: null } };
    mount('?review=1');
    await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/account/orders/K4M2QP'));
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('without the parameter nothing is scrolled or focused', async () => {
    h.order = canReview;
    mount();
    await screen.findByRole('radiogroup');
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(stars()[0]);
  });
});

describe('an owner arrangement that predates the review part', () => {
  const c = (type: string, id: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
  const part = (type: string): ComponentData => ({ type, props: { id: partId('od', type) } });
  const root = { props: { chrome: 'shell' } } as unknown as PuckDoc['root'];
  const renderStored = (content: ComponentData[]) => {
    const doc: PuckDoc = { root, content: [c('OrderDetail', 'od', { content })] };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = validateDoc(doc, 'account.order', 'storefront').doc!;
    warn.mockRestore();
    return at('/account/orders/K4M2QP', <RenderDoc doc={out} docKey="account.order" layout="storefront" />);
  };

  it('shows the review form under the items although the stored layout has no OrderReview', async () => {
    h.order = canReview;
    renderStored([part('OrderHeading'), part('OrderItems'), part('OrderPayments')]);
    const form = await screen.findByText('Rate your order');
    const items = screen.getByRole('region', { name: 'Items' });
    expect(items.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('and nothing extra for an order with no review to show', async () => {
    h.order = base;
    renderStored([part('OrderHeading'), part('OrderItems')]);
    await screen.findByRole('region', { name: 'Items' });
    expect(screen.queryByText('Rate your order')).toBeNull();
  });

  it('places the part once when the layout already has it', async () => {
    h.order = canReview;
    renderStored([part('OrderHeading'), part('OrderReview'), part('OrderItems')]);
    await screen.findByText('Rate your order');
    expect(screen.getAllByText('Rate your order')).toHaveLength(1);
  });
});

describe('silentParts', () => {
  it('OrderReview is silent unless the order can be reviewed or has a review', () => {
    const silent = (order: object) => silentParts({ ...base, ...order } as never).has('OrderReview');
    expect(silent({})).toBe(true);
    expect(silent({ review: { canReview: false, existing: null } })).toBe(true);
    expect(silent({ review: { canReview: true, existing: null } })).toBe(false);
    expect(silent({ review: { canReview: false, existing: { rating: 5, comment: null, status: 'pending', createdAt: 'x' } } })).toBe(false);
  });
});
