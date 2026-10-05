import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ order: {} as Record<string, unknown>, links: [] as Array<{ label: string; url: string }> }));
vi.mock('@/app/settings.ts', () => ({
  useSettings: () => ({ currency: 'GBP', brand: { name: 'Northbound Supply', links: {} }, supportLinks: h.links }),
}));
vi.mock('@/features/account/queries.ts', async (orig) => ({
  ...(await orig<typeof import('@/features/account/queries.ts')>()),
  useOrder: () => ({ data: h.order, isPending: false, isError: false }),
  useProfile: () => ({ data: undefined, isPending: true, isError: false }),
}));
vi.mock('@/api/orders.ts', async (orig) => ({
  ...(await orig<typeof import('@/api/orders.ts')>()),
  cancelOrder: vi.fn(),
  fetchOrderPayment: vi.fn(),
  fetchOrderPaymentOptions: vi.fn(),
  selectOrderPaymentMethod: vi.fn(),
}));

import { fetchOrderPayment, fetchOrderPaymentOptions } from '@/api/orders.ts';
import { AccountLayout, isOrderDetailPath } from '@/features/account/AccountLayout.tsx';
import { OrderDetailPage } from '@/features/account/OrderDetailPage.tsx';
import { ApiError } from '@/lib/errors.ts';
import { RenderDoc } from '@/builder/render.tsx';
import { validateDoc } from '@/builder/guard.ts';
import { partId } from '@/builder/parts.ts';
import { PaymentSection } from '@/features/order-status/PaymentSection.tsx';
import type { ComponentData, PuckDoc } from '@/builder/types.ts';
import type { PublicOrder } from '@/types/public-order.ts';

const paymentMock = vi.mocked(fetchOrderPayment);
const optionsMock = vi.mocked(fetchOrderPaymentOptions);

const base = {
  reference: 'K4M2QP', totalAmount: 46.03, outstandingBalance: 46.03, createdAt: '2026-01-02T10:00:00Z', status: 'pending',
  subtotal: 40, shippingAmount: 6.03, discountAmount: 0, items: [], payments: [], shipments: [],
};
const address = { firstName: 'Ada', surname: 'Byron', addressLine1: '1 Mill Lane', addressLine2: null, addressLine3: '', city: 'Leeds', county: null, zip: 'LS1 1AA', country: 'GB', servicePoint: null };

const publicOrder = (payment: PublicOrder['payment']): PublicOrder => ({
  reference: 'K4M2QP', status: 'pending', createdAt: '2026-01-02T10:00:00Z', deliveredAt: null, isPreorder: false, currency: 'GBP',
  items: [], totals: { subtotal: 40, shippingAmount: 6.03, discountAmount: 0, taxAmount: 0, totalAmount: 46.03 },
  shippingAddress: null, shipments: [], cryptoPayments: [], payment,
});
const method = {
  slot: 'card' as const, method: 'stripe', displayName: 'Card', type: 'gateway' as const, details: null, feeType: null,
  feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 46.03,
};

let client: QueryClient;
const at = (path: string, ui = <OrderDetailPage />) =>
  render(
    <QueryClientProvider client={client}>
      <MantineProvider env="test">
        <MemoryRouter initialEntries={[path]}>
          <Routes><Route path="/account/*" element={ui} /></Routes>
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
const mount = () => at('/account/orders/K4M2QP');
const overview = () => document.querySelector('[data-columns]') as HTMLElement;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  h.links = [];
  paymentMock.mockReset();
  optionsMock.mockReset().mockResolvedValue([method]);
});
afterEach(cleanup);

describe('the account around an order', () => {
  it('hides the account greeting and the section tabs on an order page, and keeps them on the list', async () => {
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed' };
    const first = at('/account/orders/K4M2QP', <AccountLayout><OrderDetailPage /></AccountLayout>);
    await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
    expect(screen.queryByRole('navigation', { name: 'Account sections' })).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    first.unmount();
    at('/account/orders', <AccountLayout><p>the list</p></AccountLayout>);
    expect(await screen.findByRole('navigation', { name: 'Account sections' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });

  it('isOrderDetailPath matches only a single order', () => {
    expect(['/account/orders/K4M2QP', '/account/orders/K4M2QP/'].map(isOrderDetailPath)).toEqual([true, true]);
    expect(['/account/orders', '/account/orders/', '/account/profile', '/account/orders/A/b'].map(isOrderDetailPath)).toEqual([false, false, false, false]);
  });
});

describe('the header', () => {
  it('has a back link, the reference as the one h1, the status in words, and the order date', async () => {
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed' };
    mount();
    const title = await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
    const back = screen.getByRole('link', { name: 'All orders' });
    expect(back.getAttribute('href')).toBe('/account/orders');
    expect(title.parentElement!.textContent).toMatch(/K4M2QP\S*\s*\S+/);
    expect(screen.getByText(/Placed 2 January 2026/)).toBeTruthy();
  });

  it('a collection order keeps "Collect from {name}" in the heading', async () => {
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed', servicePoint: { name: 'Corner Shop', carrier: 'DPD' } };
    mount();
    const title = await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
    expect(title.closest('header')!.textContent).toContain('Collect from Corner Shop');
  });
});

describe('items: promotions and discounts', () => {
  const tea = { name: 'Sencha 100g', quantity: 3, unitPrice: 9.5, lineTotal: 28.5, promotionDiscount: 12.5 };
  const paid = { ...base, outstandingBalance: 0, status: 'confirmed', items: [tea], subtotal: 28.5, shippingAmount: 0, discountAmount: 14.5, totalAmount: 14, promotionDiscount: 12.5, promotions: [{ label: '3 for 2 on all teas', amount: 12.5 }] };
  const items = async () => within(await screen.findByRole('region', { name: 'Items' }));

  it('adds a promotion row and shows the discount row without the promotion part, so the rows add up', async () => {
    h.order = paid;
    mount();
    const card = await items();
    expect(card.getByText('3 for 2 on all teas')).toBeTruthy();
    expect(card.getByText('3 for 2 on all teas').nextElementSibling!.textContent).toBe('−£12.50');
    expect(card.getByText('Discount').nextElementSibling!.textContent).toBe('−£2.00'); // 14.50 − 12.50
  });

  it('hides the discount row when the promotions account for all of it', async () => {
    h.order = { ...paid, discountAmount: 12.5, totalAmount: 16 };
    mount();
    const card = await items();
    expect(card.getByText('3 for 2 on all teas')).toBeTruthy();
    expect(card.queryByText('Discount')).toBeNull();
  });

  it('is unchanged for an order with no promotion fields: one discount row, no promotion row', async () => {
    h.order = { ...paid, items: [{ ...tea, promotionDiscount: undefined }], promotionDiscount: undefined, promotions: undefined };
    mount();
    const card = await items();
    expect(card.getByText('Discount').nextElementSibling!.textContent).toBe('−£14.50');
    expect(card.queryByText('3 for 2 on all teas')).toBeNull();
    expect(card.getByText('Sencha 100g').closest('li')!.querySelector('s')).toBeNull();
  });

  it('a line made free by a promotion says Free, with the full price struck through', async () => {
    h.order = { ...paid, items: [{ ...tea, quantity: 1, lineTotal: 9.5, promotionDiscount: 9.5 }], promotionDiscount: 9.5, promotions: [{ label: 'Free tea', amount: 9.5 }], discountAmount: 9.5, totalAmount: 0 };
    mount();
    const card = await items();
    const line = card.getByText('Sencha 100g').closest('li')!;
    expect(line.querySelector('s')!.textContent).toBe('£9.50');
    expect(line.textContent).toContain('Free');
    expect(line.textContent).not.toMatch(/£0\.00/);
  });

  it('a line with part of its price taken off shows the struck price and the net', async () => {
    h.order = paid;
    mount();
    const line = (await items()).getByText('Sencha 100g').closest('li')!;
    expect(line.querySelector('s')!.textContent).toBe('£28.50');
    expect(line.textContent).toContain('£16.00');
  });
});

describe('payment needed', () => {
  it('unpaid: the payment card leads with the amount and holds the method picker and Cancel order', async () => {
    h.order = { ...base, canCancel: true, cancelBlockedBy: null };
    paymentMock.mockResolvedValue(publicOrder({ canPay: true, payBy: null, activePayment: null }));
    mount();
    const card = await screen.findByRole('region', { name: 'Payment needed' });
    expect(card.getAttribute('data-sf-part')).toBe('card');
    expect(await within(card).findByText(/Choose how you.d like to pay/)).toBeTruthy();
    expect(card.querySelector('h2 + p')!.textContent).toContain('£46.03');
    expect(within(card).getByRole('button', { name: 'Cancel order' })).toBeTruthy();
    // The card is the first thing in the main column, above the items.
    const main = overview().children[1]!;
    expect(main.firstElementChild).toBe(card);
  });

  it('while the payment state loads there is a busy placeholder, not a bare figure, and Cancel order is already there', async () => {
    h.order = { ...base, canCancel: true, cancelBlockedBy: null };
    paymentMock.mockReturnValue(new Promise(() => {}));
    mount();
    const card = await screen.findByRole('region', { name: 'Payment needed' });
    expect(within(card).getByText('Loading payment options…')).toBeTruthy();
    expect(card.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Cancel order' })).toBeTruthy();
    expect(within(card).queryByText(/Choose how you.d like to pay/)).toBeNull();
  });

  it('when the payment state fails to load it says so, Try again refetches, and Cancel order is still offered', async () => {
    h.order = { ...base, canCancel: true, cancelBlockedBy: null };
    paymentMock.mockRejectedValueOnce(new ApiError(503, 'STOREFRONT_DISABLED'));
    paymentMock.mockResolvedValue(publicOrder({ canPay: true, payBy: null, activePayment: null }));
    mount();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("We couldn't load the payment options.");
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeTruthy();
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/Choose how you.d like to pay/)).toBeTruthy();
    expect(paymentMock).toHaveBeenCalledTimes(2);
  });

  it('a failed read stays on screen while Try again is in flight, with the button busy, until the second read settles', async () => {
    h.order = { ...base, canCancel: true, cancelBlockedBy: null };
    let settle!: (o: PublicOrder) => void;
    paymentMock.mockRejectedValueOnce(new ApiError(503, 'STOREFRONT_DISABLED'));
    paymentMock.mockReturnValueOnce(new Promise<PublicOrder>((r) => { settle = r; }));
    mount();
    const alert = await screen.findByRole('alert');
    const retry = within(alert).getByRole('button', { name: 'Try again' });
    retry.focus();
    fireEvent.click(retry);
    await waitFor(() => expect(paymentMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('alert')).toBe(alert);
    const busy = within(alert).getByRole('button');
    expect(busy.getAttribute('aria-disabled')).toBe('true');
    expect(busy.textContent).toBe('Loading');
    expect(document.activeElement).toBe(busy);
    fireEvent.click(busy);
    expect(paymentMock).toHaveBeenCalledTimes(2);
    await act(async () => { settle(publicOrder({ canPay: true, payBy: null, activePayment: null })); });
    expect(await screen.findByText(/Choose how you.d like to pay/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('inside the payment card the "Payment required" eyebrow is absent in the method-picker and hosted-checkout faces', async () => {
    h.order = { ...base, canCancel: true, cancelBlockedBy: null };
    paymentMock.mockResolvedValue(publicOrder({ canPay: true, payBy: null, activePayment: null }));
    const first = mount();
    const card = await screen.findByRole('region', { name: 'Payment needed' });
    await within(card).findByText(/Choose how you.d like to pay/);
    expect(within(card).queryByText('Payment required')).toBeNull();
    expect(card.querySelectorAll('[data-sf-part="card"]')).toHaveLength(0); // no card inside the card
    first.unmount();
    client.clear();
    paymentMock.mockResolvedValue(publicOrder({
      canPay: true, payBy: null,
      activePayment: { paymentId: 9, method: 'stripe', kind: 'gateway', status: 'pending', checkoutUrl: 'https://pay.example/abc', canChange: true },
    }));
    mount();
    const hosted = await screen.findByRole('region', { name: 'Payment needed' });
    await within(hosted).findByRole('link', { name: /Click here to Pay/ });
    expect(within(hosted).queryByText('Payment required')).toBeNull();
  });

  it('an unpaid order whose payment read says nothing payable (an older backend, no payment block) shows the help text', async () => {
    h.order = { ...base, canCancel: true, cancelBlockedBy: null };
    h.links = [{ label: 'Chat on WhatsApp', url: 'https://wa.me/447700900123' }];
    paymentMock.mockResolvedValue({ ...publicOrder(undefined), payment: undefined });
    mount();
    const card = await screen.findByRole('region', { name: 'Payment needed' });
    expect(await within(card).findByText(/can't be paid online/)).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'Chat on WhatsApp' })).toBeTruthy();
  });

  it('an unpaid order that cannot be paid online shows the help text and support links', async () => {
    h.order = { ...base, canCancel: true, cancelBlockedBy: null };
    h.links = [{ label: 'Chat on WhatsApp', url: 'https://wa.me/447700900123' }];
    paymentMock.mockResolvedValue(publicOrder({ canPay: false, payBy: null, activePayment: null }));
    mount();
    const card = await screen.findByRole('region', { name: 'Payment needed' });
    expect(await within(card).findByText(/can't be paid online/)).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'Chat on WhatsApp' }).getAttribute('href')).toBe('https://wa.me/447700900123');
    expect(within(card).getByRole('button', { name: 'Cancel order' })).toBeTruthy();
  });

  it('a paid order has no payment card and asks for no payment state', async () => {
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed', canCancel: false, cancelBlockedBy: 'paid' };
    mount();
    await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
    expect(screen.queryByRole('region', { name: 'Payment needed' })).toBeNull();
    expect(paymentMock).not.toHaveBeenCalled();
  });

  it('a cancelled order with a balance on paper has no payment card', async () => {
    h.order = { ...base, status: 'cancelled', outstandingBalance: 46.03, canCancel: false, cancelBlockedBy: null };
    mount();
    await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
    expect(screen.queryByRole('region', { name: 'Payment needed' })).toBeNull();
    expect(paymentMock).not.toHaveBeenCalled();
  });
});

describe('details', () => {
  it('items are a card with the grand total as its own, emphasised line', async () => {
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed', items: [{ name: 'Oat Bar', quantity: 3, unitPrice: 4.5, lineTotal: 13.5 }] };
    mount();
    const card = await screen.findByRole('region', { name: 'Items' });
    expect(card.getAttribute('data-sf-part')).toBe('card');
    expect(within(card).getByRole('heading', { level: 2, name: 'Items' })).toBeTruthy();
    expect(card.textContent).toContain('Oat Bar');
    const total = within(card).getByText('Total');
    expect(total.parentElement!.textContent).toContain('£46.03');
  });

  it('shows the delivery address, skipping blank lines', async () => {
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed', shippingAddress: address };
    mount();
    const card = await screen.findByRole('region', { name: 'Delivery address' });
    expect(card.textContent).toContain('Ada Byron');
    expect(card.textContent).toContain('1 Mill Lane');
    expect(card.textContent).toContain('LS1 1AA');
    expect(card.textContent).toContain('United Kingdom');
    expect(card.querySelectorAll('[data-address-line]')).toHaveLength(4); // name, line 1, city + postcode, country
  });

  it('a collection order says Collection point, with the point name and carrier', async () => {
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed', shippingAddress: { ...address, servicePoint: { name: 'Corner Shop', carrier: 'DPD' } } };
    mount();
    const card = await screen.findByRole('region', { name: 'Collection point' });
    expect(card.textContent).toContain('Corner Shop');
    expect(card.textContent).toContain('DPD');
  });

  it('shows the collection carrier in its display form, as the parcels card does', async () => {
    const via = async (carrier: string) => {
      h.order = { ...base, outstandingBalance: 0, status: 'confirmed', shippingAddress: { ...address, servicePoint: { name: 'Corner Shop', carrier } } };
      const view = mount();
      const card = await screen.findByRole('region', { name: 'Collection point' });
      const text = card.textContent ?? '';
      view.unmount();
      return text;
    };
    expect(await via('evri')).toContain('Via Evri');
    expect(await via('dpd')).toContain('Via DPD');
    expect(await via('Royal Mail')).toContain('Via Royal Mail');
  });

  it('no address: the address part draws nothing', async () => {
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed', shippingAddress: null };
    mount();
    await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
    expect(screen.queryByRole('region', { name: 'Delivery address' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Collection point' })).toBeNull();
  });

  it('payment history says the status in plain words, and an unknown status as it came', async () => {
    const payment = (status: string, i: number) => ({ method: 'stripe', amount: 5, status, createdAt: `2026-01-0${i + 2}T10:00:00Z` });
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed', payments: ['pending', 'completed', 'failed', 'cancelled', 'expired', 'refunded', 'odd_state'].map(payment) };
    mount();
    const card = await screen.findByRole('region', { name: 'Payments' });
    for (const word of ['Waiting', 'Paid', 'Cancelled', 'Expired', 'Refunded', 'odd_state']) expect(within(card).getByText(word)).toBeTruthy();
    expect(within(card).queryByText('Failed')).toBeNull();
  });

  describe('failed payments are left out of the history', () => {
    const pay = (method: string, status: string, i: number) => ({ method, amount: 5, status, createdAt: `2026-01-0${i + 2}T10:00:00Z` });
    const rows = (card: HTMLElement) => card.querySelectorAll('li');

    it('shows only the pending row when two earlier attempts failed', async () => {
      h.order = { ...base, outstandingBalance: 0, status: 'confirmed', payments: [pay('stripe', 'failed', 0), pay('crypto', 'failed', 1), pay('bank', 'pending', 2)] };
      mount();
      const card = await screen.findByRole('region', { name: 'Payments' });
      expect(rows(card)).toHaveLength(1);
      expect(within(card).getByText('Waiting')).toBeTruthy();
      expect(screen.queryByText(/Failed/)).toBeNull();
    });

    it('draws no Payments card when every payment failed, and with nothing else to show the page is one column', async () => {
      h.order = { ...base, outstandingBalance: 0, status: 'confirmed', shippingAddress: null, shipments: [], payments: [pay('stripe', 'failed', 0), pay('crypto', 'failed', 1)] };
      mount();
      await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
      expect(screen.queryByRole('region', { name: 'Payments' })).toBeNull();
      expect(overview().dataset.columns).toBe('one');
    });

    it('shows only the completed row when an earlier attempt failed', async () => {
      h.order = { ...base, outstandingBalance: 0, status: 'confirmed', payments: [pay('stripe', 'failed', 0), pay('crypto', 'completed', 1)] };
      mount();
      const card = await screen.findByRole('region', { name: 'Payments' });
      expect(rows(card)).toHaveLength(1);
      expect(within(card).getByText('Paid')).toBeTruthy();
      expect(within(card).queryByText('Failed')).toBeNull();
    });
  });

  it('parcels are a card with the track link', async () => {
    h.order = {
      ...base, outstandingBalance: 0, status: 'shipped',
      shipments: [{ status: 'in_transit', carrier: 'Royal Mail', trackingNumber: 'RM1', trackingUrl: 'https://track.example/RM1', trackingStatusDescription: 'At the depot', shippedAt: null, deliveredAt: null }],
    };
    mount();
    const card = await screen.findByRole('region', { name: 'Parcels' });
    expect(within(card).getByRole('link', { name: 'Track this parcel' }).getAttribute('href')).toBe('https://track.example/RM1');
    expect(card.textContent).toContain('At the depot');
  });
});

describe('layout', () => {
  it('two columns when the side column has something to draw, one when it has not', async () => {
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed', shippingAddress: address };
    const first = mount();
    await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
    expect(overview().dataset.columns).toBe('two');
    first.unmount();
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed', shippingAddress: null, shipments: [], payments: [] };
    mount();
    await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
    expect(overview().dataset.columns).toBe('one');
  });

  it('the DOM order is the mobile order: header, payment, items, then address, parcels and history', async () => {
    h.order = {
      ...base, canCancel: true, cancelBlockedBy: null, shippingAddress: address,
      shipments: [{ status: 'shipped', carrier: 'Royal Mail', trackingNumber: 'RM1', trackingUrl: null, trackingStatusDescription: null, shippedAt: null, deliveredAt: null }],
      payments: [{ method: 'stripe', amount: 5, status: 'pending', createdAt: '2026-01-02T10:00:00Z' }],
    };
    paymentMock.mockResolvedValue(publicOrder({ canPay: true, payBy: null, activePayment: null }));
    mount();
    await screen.findByRole('region', { name: 'Payment needed' });
    // Direct children of the areas only: the payment section draws sections of its own inside the card.
    const names = [...overview().querySelectorAll('h1, :scope > div > section')]
      .map((e) => (e.tagName === 'H1' ? 'title' : e.getAttribute('aria-label') ?? 'Payment needed'));
    expect(names).toEqual(['title', 'Payment needed', 'Items', 'Delivery address', 'Parcels', 'Payments']);
  });
});

describe('stored arrangements', () => {
  const root = { props: { title: '', description: '', chrome: 'shell' } } as PuckDoc['root'];
  const c = (type: string, id: string, props: Record<string, unknown> = {}): ComponentData => ({ type, props: { id, ...props } });
  const part = (type: string): ComponentData => c(type, partId('od', type));
  const section = (id: string, content: ComponentData[]): ComponentData =>
    c('Section', id, { padding: 'lg', backgroundToken: 'none', textToken: 'none', width: 'rail', content });
  const settled = { ...base, outstandingBalance: 0, status: 'confirmed', items: [{ name: 'Oat Bar', quantity: 1, unitPrice: 4, lineTotal: 4 }] };
  const renderStored = (content: ComponentData[], guard = true) => {
    const doc: PuckDoc = { root, content: [c('OrderDetail', 'od', { content })] };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = guard ? validateDoc(doc, 'account.order', 'storefront').doc! : doc;
    warn.mockRestore();
    return at('/account/orders/K4M2QP', <RenderDoc doc={out} docKey="account.order" layout="storefront" />);
  };

  it('an arrangement without OrderAddress and OrderParcels, for an order with no payments, is one column with no side wrapper', async () => {
    h.order = { ...settled, shippingAddress: address };
    renderStored([part('OrderHeading'), part('OrderItems'), part('OrderPayments')]);
    await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
    expect(overview().dataset.columns).toBe('one');
    expect(overview().children).toHaveLength(2);
  });

  it('a content block wrapping parcels and items lands in the main column', async () => {
    h.order = {
      ...settled, shippingAddress: address,
      shipments: [{ status: 'shipped', carrier: 'Royal Mail', trackingNumber: 'RM1', trackingUrl: null, trackingStatusDescription: null, shippedAt: null, deliveredAt: null }],
    };
    renderStored([part('OrderHeading'), section('wrap', [part('OrderParcels'), part('OrderItems')]), part('OrderAddress')], false);
    await screen.findByRole('region', { name: 'Parcels' });
    expect(overview().dataset.columns).toBe('two');
    const [, main, side] = [...overview().children] as HTMLElement[];
    expect(within(main!).getByRole('region', { name: 'Items' })).toBeTruthy();
    expect(within(main!).getByRole('region', { name: 'Parcels' })).toBeTruthy();
    expect(within(side!).getByRole('region', { name: 'Delivery address' })).toBeTruthy();
  });

  it('with no side column, a side-bound content block still renders, at the end of the main column', async () => {
    h.order = { ...settled, shippingAddress: null };
    renderStored([part('OrderHeading'), part('OrderItems'), section('wrap', [part('OrderParcels')])], false);
    await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
    expect(overview().dataset.columns).toBe('one');
    expect(overview().children).toHaveLength(2);
    const main = overview().children[1] as HTMLElement;
    const last = main.lastElementChild as HTMLElement;
    expect(last.tagName).toBe('SECTION');
    expect(last.getAttribute('aria-label')).toBeNull();
    expect(last).not.toBe(within(main).getByRole('region', { name: 'Items' }));
  });
});

describe('PaymentSection faces', () => {
  const crypto = (verificationStatus: string, txidMasked: string | null) => ({
    paymentId: 5, paymentStatus: 'pending', coin: 'usdt', network: 'polygon', coinLabel: 'USDT', networkLabel: 'Polygon', address: '0xabc',
    coinAmount: '1', fiatAmount: 1, verificationStatus, needsAttention: false, txidMasked,
  });
  const cryptoActive = { paymentId: 5, method: 'crypto', kind: 'crypto' as const, status: 'pending', checkoutUrl: null, canChange: true };
  const section = (order: PublicOrder) =>
    render(
      <QueryClientProvider client={client}>
        <MantineProvider env="test"><MemoryRouter><PaymentSection order={order} reference="K4M2QP" /></MemoryRouter></MantineProvider>
      </QueryClientProvider>,
    );

  it('draws no eyebrow and no card of its own: the payment card around it says what is needed', async () => {
    section(publicOrder({ canPay: true, payBy: null, activePayment: null }));
    expect(await screen.findByText(/Choose how you.d like to pay/)).toBeTruthy();
    expect(screen.queryByText('Payment required')).toBeNull();
    expect(document.querySelector('[data-sf-part="card"]')).toBeNull();
    expect(document.querySelector('[data-embedded]')).toBeNull();
  });

  it('an awaiting crypto face is three numbered steps, states the coin amount once and carries no status pill', async () => {
    const awaiting = { ...publicOrder({ canPay: true, payBy: null, activePayment: cryptoActive }), cryptoPayments: [{ ...crypto('pending', null), coinAmount: '46.030000' }] };
    section(awaiting);
    const face = await screen.findByRole('region', { name: 'Crypto payment' });
    expect(within(face).getByRole('heading', { name: 'Pay with USDT' })).toBeTruthy();
    expect(within(face).getAllByText(/46\.03/)).toHaveLength(1);
    expect(within(face).queryByText('Awaiting payment')).toBeNull();
    expect(face.querySelector('[data-sf-part="badge"]')).toBeNull();
    expect(within(face).getByText('Amount to send')).toBeTruthy();
    expect(within(face).getByText('Transaction ID')).toBeTruthy();
    expect(['1', '2', '3'].map((n) => within(face).getByText(n, { selector: 'span[aria-hidden]' }).textContent)).toEqual(['1', '2', '3']);
  });

  it('keeps a status pill once the transaction is being checked', async () => {
    const awaiting = { ...publicOrder({ canPay: true, payBy: null, activePayment: cryptoActive }), cryptoPayments: [crypto('checking', '1a2b3c…d4e5f6')] };
    section(awaiting);
    const face = await screen.findByRole('region', { name: 'Crypto payment' });
    expect(within(face).getByText('Verifying', { selector: '[data-sf-part="badge"]' })).toBeTruthy();
  });

  it('a hosted checkout face says it is secure without repeating the amount', async () => {
    section(publicOrder({
      canPay: true, payBy: null,
      activePayment: { paymentId: 9, method: 'stripe', kind: 'gateway', status: 'pending', checkoutUrl: 'https://pay.example/abc', canChange: false },
    }));
    expect(await screen.findByText('Secure hosted checkout')).toBeTruthy();
    expect(screen.queryByText(/£/)).toBeNull();
    expect(screen.queryByText('Awaiting payment')).toBeNull();
  });

  it('the pay-by notice is plain sentence case with only the date in bold', async () => {
    section(publicOrder({ canPay: true, payBy: '2026-08-26T09:05:00.000Z', activePayment: null }));
    const notice = (await screen.findByText(/After that the order is cancelled automatically/)).closest('p')!;
    expect(notice.textContent).toMatch(/^Pay by .+\. After that the order is cancelled automatically\.$/);
    expect(notice.querySelectorAll('strong')).toHaveLength(1);
  });

  it('a pending offline payment draws no eyebrow', async () => {
    section(publicOrder({ canPay: true, payBy: null, activePayment: { paymentId: 7, method: 'bank', kind: 'other', status: 'pending', checkoutUrl: null, canChange: false } }));
    expect(await screen.findByRole('heading', { level: 3 })).toBeTruthy();
    expect(screen.queryByText('Payment pending')).toBeNull();
  });
});

describe('the visual pass', () => {
  it('only an order page gets the wide account column', async () => {
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed' };
    const first = at('/account/orders/K4M2QP', <AccountLayout><OrderDetailPage /></AccountLayout>);
    await screen.findByRole('heading', { level: 1, name: 'K4M2QP' });
    expect(document.querySelector('[class*="accountOrder"]')).toBeTruthy();
    first.unmount();
    at('/account/orders', <AccountLayout><p>the list</p></AccountLayout>);
    await screen.findByRole('navigation', { name: 'Account sections' });
    expect(document.querySelector('[class*="accountOrder"]')).toBeNull();
  });

  it('a cancelled order says so, and says nothing was charged only when no money moved', async () => {
    h.order = { ...base, outstandingBalance: 0, status: 'cancelled', shippingAddress: address };
    const first = mount();
    const header = (await screen.findByRole('heading', { level: 1, name: 'K4M2QP' })).closest('header')!;
    expect(header.textContent).toContain('This order was cancelled. Nothing was charged.');
    expect(screen.getByRole('region', { name: 'Address' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Delivery address' })).toBeNull();
    first.unmount();
    h.order = { ...base, outstandingBalance: 0, status: 'cancelled', payments: [{ method: 'stripe', amount: 46.03, status: 'completed', createdAt: '2026-01-02T10:00:00Z' }] };
    mount();
    const again = (await screen.findByRole('heading', { level: 1, name: 'K4M2QP' })).closest('header')!;
    expect(again.textContent).toContain('This order was cancelled.');
    expect(again.textContent).not.toContain('Nothing was charged');
  });

  it('a refunded order says it was refunded', async () => {
    h.order = { ...base, outstandingBalance: 0, status: 'refunded' };
    mount();
    expect((await screen.findByRole('heading', { level: 1, name: 'K4M2QP' })).closest('header')!.textContent).toContain('This order was refunded.');
  });

  it('a collection address leads with the point, then its address, then who is collecting; no card inside the card', async () => {
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed', shippingAddress: { ...address, servicePoint: { name: 'Corner Shop', carrier: 'DPD' } } };
    mount();
    const card = await screen.findByRole('region', { name: 'Collection point' });
    const lines = [...card.querySelectorAll('[data-address-line]')].map((l) => l.textContent);
    expect(lines).toEqual(['Corner Shop', 'Via DPD', '1 Mill Lane', 'Leeds LS1 1AA', 'United Kingdom', 'Collecting: Ada Byron']);
    expect(card.querySelectorAll('[data-sf-part="card"]')).toHaveLength(0);
  });

  it('the line count is shown for two lines or more, not for one', async () => {
    const item = (name: string) => ({ name, quantity: 1, unitPrice: 5, lineTotal: 5 });
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed', items: [item('One')] };
    const first = mount();
    const card = await screen.findByRole('region', { name: 'Items' });
    expect(within(card).queryByText(/line/)).toBeNull();
    first.unmount();
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed', items: [item('One'), item('Two')] };
    mount();
    expect(within(await screen.findByRole('region', { name: 'Items' })).getByText('2 lines')).toBeTruthy();
  });

  it('a payment the shop gave no name for is title-cased, never a raw slug', async () => {
    h.order = { ...base, outstandingBalance: 0, status: 'confirmed', payments: [{ method: 'crypto_static', amount: 5, status: 'completed', createdAt: '2026-01-02T10:00:00Z' }] };
    mount();
    const card = await screen.findByRole('region', { name: 'Payments' });
    expect(within(card).getByText('Crypto Static')).toBeTruthy();
    expect(within(card).queryByText('crypto static')).toBeNull();
  });

  it('with no payment card, parcels sit in the main column under the items; with one, they stay beside the address', async () => {
    const shipments = [{ status: 'shipped', carrier: 'Royal Mail', trackingNumber: 'RM1', trackingUrl: null, trackingStatusDescription: null, shippedAt: null, deliveredAt: null }];
    h.order = { ...base, outstandingBalance: 0, status: 'shipped', shippingAddress: address, shipments };
    const first = mount();
    const parcels = await screen.findByRole('region', { name: 'Parcels' });
    const [, main, side] = [...overview().children] as HTMLElement[];
    expect(main!.contains(parcels)).toBe(true);
    expect(side!.contains(screen.getByRole('region', { name: 'Delivery address' }))).toBe(true);
    first.unmount();
    h.order = { ...base, status: 'pending', canCancel: true, cancelBlockedBy: null, shippingAddress: address, shipments };
    paymentMock.mockResolvedValue(publicOrder({ canPay: true, payBy: null, activePayment: null }));
    mount();
    const beside = await screen.findByRole('region', { name: 'Parcels' });
    const [, , side2] = [...overview().children] as HTMLElement[];
    expect(side2!.contains(beside)).toBe(true);
  });

  it('each way to pay is one whole-width button with what it costs; the first is the filled one', async () => {
    h.order = { ...base, canCancel: true, cancelBlockedBy: null };
    paymentMock.mockResolvedValue(publicOrder({ canPay: true, payBy: null, activePayment: null }));
    optionsMock.mockResolvedValue([
      { ...method, displayName: 'Pay by card', fee: 1.42, feeRateText: '+3%', chargeTotal: 47.45 },
      { ...method, method: 'crypto', type: 'crypto', displayName: 'Pay with crypto', fee: -1.42, feeRateText: '−3%', chargeTotal: 44.61 },
    ]);
    mount();
    const card = await screen.findByRole('region', { name: 'Payment needed' });
    const buttons = await within(card).findAllByRole('button', { name: /^Pay/ });
    expect(buttons.map((b) => b.getAttribute('data-variant'))).toEqual(['filled', 'default']);
    expect(buttons[0]!.textContent).toBe('Pay by cardIncludes a £1.42 fee£47.45');
    expect(buttons[1]!.textContent).toBe('Pay with crypto3% discount£44.61');
  });

  it('the payment card forgets a failed read when another order is shown', async () => {
    h.order = { ...base, canCancel: true, cancelBlockedBy: null };
    paymentMock.mockRejectedValue(new ApiError(500, 'boom'));
    // A new element each time, or React skips the re-render that shows the other order.
    const tree = () => (
      <QueryClientProvider client={client}>
        <MantineProvider env="test">
          <MemoryRouter initialEntries={['/account/orders/K4M2QP']}>
            <Routes><Route path="/account/*" element={<OrderDetailPage />} /></Routes>
          </MemoryRouter>
        </MantineProvider>
      </QueryClientProvider>
    );
    const view = render(tree());
    expect(await screen.findByText("We couldn't load the payment options.")).toBeTruthy();
    paymentMock.mockReturnValue(new Promise(() => undefined));
    h.order = { ...base, reference: 'B2B2B2', canCancel: true, cancelBlockedBy: null };
    view.rerender(tree());
    await screen.findByRole('region', { name: 'Payment needed' });
    expect(screen.queryByText("We couldn't load the payment options.")).toBeNull();
  });
});
