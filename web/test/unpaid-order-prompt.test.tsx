import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router';

vi.mock('@/api/orders.ts', () => ({ fetchUnpaidOrders: vi.fn(), cancelOrder: vi.fn() }));
vi.mock('@/api/public-order.ts', async (orig) => ({ ...(await orig<typeof import('@/api/public-order.ts')>()), fetchPublicOrder: vi.fn(), cancelPublicOrder: vi.fn() }));
vi.mock('@/stores/saved-orders.ts', () => ({ listSavedOrders: vi.fn() }));
vi.mock('@/app/builder-gate.ts', () => ({ isBuilderMode: vi.fn(() => false) }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ supportLinks: [{ label: 'Chat', url: 'https://t.me/example_shop' }], currency: 'GBP' }) }));

import { cancelOrder, fetchUnpaidOrders } from '@/api/orders.ts';
import { fetchPublicOrder, InvalidLinkError } from '@/api/public-order.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { UnpaidOrderPrompt } from '@/features/unpaid-prompt/UnpaidOrderPrompt.tsx';
import { listSavedOrders } from '@/stores/saved-orders.ts';
import { useSessionStore } from '@/stores/session.ts';

const unpaidMock = vi.mocked(fetchUnpaidOrders);
const cancelMock = vi.mocked(cancelOrder);
const publicMock = vi.mocked(fetchPublicOrder);
const savedMock = vi.mocked(listSavedOrders);
const builderMock = vi.mocked(isBuilderMode);

const unpaid = (reference: string, over: Record<string, unknown> = {}) => ({
  reference, accessKey: `key-${reference}`, createdAt: '2026-10-03T10:00:00Z', totalAmount: 46.03, outstandingBalance: 46.03,
  payBy: null, canCancel: true, cancelBlockedBy: null, ...over,
});
const saved = (reference: string) => ({ reference, accessKey: `key-${reference}`, savedAt: new Date().toISOString() });
const publicOrder = (reference: string, canPay: boolean) => ({ reference, totals: { totalAmount: 12.5 }, payment: { canPay, payBy: null, activePayment: null, canCancel: true, cancelBlockedBy: null } });

const signIn = () => useSessionStore.setState({ token: 'tok', customer: { id: 1, nickname: 'Ada' } });
const signOut = () => useSessionStore.setState({ token: null, customer: null });

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

const mount = (path = '/', client = new QueryClient()) =>
  render(
    <MantineProvider env="test">
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <UnpaidOrderPrompt />
          <Where />
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );

const dialog = () => screen.queryByRole('dialog', { name: 'You have an unpaid order' });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

beforeEach(() => {
  sessionStorage.clear();
  unpaidMock.mockReset(); cancelMock.mockReset(); publicMock.mockReset(); savedMock.mockReset();
  savedMock.mockReturnValue([]);
  builderMock.mockReturnValue(false);
  signIn();
});
afterEach(cleanup);

describe('UnpaidOrderPrompt', () => {
  it('signed in: shows the newest unpaid order with its amount and the three actions', async () => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP'), unpaid('Z9ZZZZ')] as never);
    mount('/');
    await screen.findByRole('dialog', { name: 'You have an unpaid order' });
    expect(screen.getByText('Order K4M2QP is waiting for payment.')).toBeTruthy();
    expect(screen.getByText('£46.03')).toBeTruthy();
    for (const name of ['Complete payment', 'Cancel order', 'Not now']) expect(screen.getByRole('button', { name })).toBeTruthy();
    expect(screen.getByRole('link', { name: /other unpaid orders/ }).getAttribute('href')).toBe('/account/orders');
    expect(publicMock).not.toHaveBeenCalled();
    expect(savedMock).not.toHaveBeenCalled();
  });

  it('signed in with one order: no "other orders" line', async () => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    mount('/');
    await screen.findByRole('dialog');
    expect(screen.queryByRole('link', { name: /other unpaid orders/ })).toBeNull();
  });

  it('signed in: Complete payment goes to the account order page and closes the dialog', async () => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    mount('/');
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Complete payment' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/account/orders/K4M2QP'));
    expect(dialog()).toBeNull();
  });

  it('guest: checks the saved order links and shows one that can still be paid', async () => {
    signOut();
    savedMock.mockReturnValue([saved('AAAAAA'), saved('BBBBBB')]);
    publicMock.mockImplementation(async (ref) => publicOrder(ref, ref === 'BBBBBB') as never);
    mount('/catalog');
    await screen.findByRole('dialog', { name: 'You have an unpaid order' });
    expect(screen.getByText('Order BBBBBB is waiting for payment.')).toBeTruthy();
    expect(screen.getByText('£12.50')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Complete payment' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/order/BBBBBB/key-BBBBBB'));
    expect(unpaidMock).not.toHaveBeenCalled();
  });

  it('guest: a saved link that no longer resolves is skipped, and nothing shows if none qualifies', async () => {
    signOut();
    savedMock.mockReturnValue([saved('AAAAAA')]);
    publicMock.mockRejectedValue(new InvalidLinkError());
    mount('/');
    await waitFor(() => expect(publicMock).toHaveBeenCalledTimes(1));
    await settle();
    expect(dialog()).toBeNull();
  });

  it('Not now hides it for the rest of the visit, across route changes and remounts', async () => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    const first = mount('/');
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(sessionStorage.getItem('sf-unpaid-prompt-snoozed')).toBe('1');
    first.unmount();
    unpaidMock.mockClear();
    mount('/catalog');
    await settle();
    expect(dialog()).toBeNull();
    expect(unpaidMock).not.toHaveBeenCalled();
  });

  it('closing with the close button counts as Not now', async () => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    mount('/');
    await screen.findByRole('dialog');
    fireEvent.click(document.querySelector('.mantine-Modal-close') as HTMLElement);
    await waitFor(() => expect(dialog()).toBeNull());
    expect(sessionStorage.getItem('sf-unpaid-prompt-snoozed')).toBe('1');
  });

  it.each(['/checkout', '/order/K4M2QP/abc', '/payment/success', '/account/orders/K4M2QP', '/login'])('never shows on %s, and asks nothing', async (path) => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    savedMock.mockReturnValue([saved('AAAAAA')]);
    mount(path);
    await settle();
    expect(dialog()).toBeNull();
    expect(unpaidMock).not.toHaveBeenCalled();
    expect(publicMock).not.toHaveBeenCalled();
  });

  it('never shows in the page builder', async () => {
    builderMock.mockReturnValue(true);
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    mount('/');
    await settle();
    expect(dialog()).toBeNull();
    expect(unpaidMock).not.toHaveBeenCalled();
  });

  it('cancelling from the dialog closes it and refreshes the orders', async () => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    cancelMock.mockResolvedValue({ reference: 'K4M2QP', status: 'cancelled' });
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    mount('/', client);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' })); });
    expect(cancelMock).toHaveBeenCalledWith('K4M2QP');
    await waitFor(() => expect(dialog()).toBeNull());
    expect(spy).toHaveBeenCalledWith({ queryKey: ['orders'] });
  });

  it('an order that cannot be cancelled shows the contact line instead of Cancel', async () => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP', { canCancel: false, cancelBlockedBy: 'bank_transfer' })] as never);
    mount('/');
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
    expect(screen.getByText(/To cancel this order, contact us/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Chat' })).toBeTruthy();
  });

  it('a failed lookup shows nothing, throws nothing and is not retried', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    unpaidMock.mockRejectedValue(new Error('404'));
    mount('/');
    await waitFor(() => expect(unpaidMock).toHaveBeenCalledTimes(1));
    await settle();
    expect(dialog()).toBeNull();
    expect(unpaidMock).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('a lookup that answers with something that is not a list shows nothing', async () => {
    unpaidMock.mockResolvedValue(undefined as never);
    mount('/');
    await settle();
    expect(dialog()).toBeNull();
  });

  it('signing out mid-visit closes a signed-in order, and the guest path uses saved links only', async () => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    savedMock.mockReturnValue([saved('GGGGGG')]);
    publicMock.mockResolvedValue(publicOrder('GGGGGG', false) as never);
    mount('/');
    await screen.findByRole('dialog');
    act(() => signOut());
    await waitFor(() => expect(dialog()).toBeNull());
    expect(screen.queryByText('Order K4M2QP is waiting for payment.')).toBeNull();
    await waitFor(() => expect(publicMock).toHaveBeenCalledWith('GGGGGG', 'key-GGGGGG'));
  });

  it('a signed-in customer is never offered saved guest links', async () => {
    unpaidMock.mockResolvedValue([]);
    savedMock.mockReturnValue([saved('GGGGGG')]);
    publicMock.mockResolvedValue(publicOrder('GGGGGG', true) as never);
    mount('/');
    await settle();
    expect(dialog()).toBeNull();
    expect(publicMock).not.toHaveBeenCalled();
  });

  it('Escape in the cancel confirmation closes only the confirmation, not the pop-up', async () => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    mount('/');
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    const keep = screen.getByRole('button', { name: 'Keep the order' });
    fireEvent.keyDown(keep, { key: 'Escape' });
    expect(screen.queryByText('Cancel order K4M2QP?')).toBeNull();
    expect(dialog()).toBeTruthy();
    expect(sessionStorage.getItem('sf-unpaid-prompt-snoozed')).toBeNull();
    // With the confirmation closed, Escape dismisses the pop-up as usual.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Complete payment' }), { key: 'Escape' });
    await waitFor(() => expect(dialog()).toBeNull());
  });
});
