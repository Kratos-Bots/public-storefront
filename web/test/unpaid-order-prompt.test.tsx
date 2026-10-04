import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router';
import { ApiError } from '@/lib/errors.ts';

vi.mock('@/api/orders.ts', () => ({ fetchUnpaidOrders: vi.fn(), cancelOrder: vi.fn() }));
vi.mock('@/api/public-order.ts', async (orig) => ({ ...(await orig<typeof import('@/api/public-order.ts')>()), fetchPublicOrder: vi.fn(), cancelPublicOrder: vi.fn() }));
vi.mock('@/stores/saved-orders.ts', () => ({ listSavedOrders: vi.fn(), removeSavedOrder: vi.fn() }));
vi.mock('@/app/builder-gate.ts', () => ({ isBuilderMode: vi.fn(() => false) }));
const shop = vi.hoisted(() => ({ access: undefined as undefined | { storefront: string } }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ supportLinks: [{ label: 'Chat', url: 'https://t.me/example_shop' }], currency: 'GBP', access: shop.access }) }));
vi.mock('@/app/preview-listener.ts', () => ({ isPreviewMode: vi.fn(() => false) }));

import { cancelOrder, fetchUnpaidOrders } from '@/api/orders.ts';
import { cancelPublicOrder, fetchPublicOrder, InvalidLinkError } from '@/api/public-order.ts';
import { accessGate } from '@/app/access-gate.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { isPreviewMode } from '@/app/preview-listener.ts';
import { UnpaidOrderPrompt } from '@/features/unpaid-prompt/UnpaidOrderPrompt.tsx';
import { listSavedOrders, removeSavedOrder } from '@/stores/saved-orders.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useUiStore } from '@/stores/ui.ts';

const unpaidMock = vi.mocked(fetchUnpaidOrders);
const cancelMock = vi.mocked(cancelOrder);
const publicMock = vi.mocked(fetchPublicOrder);
const savedMock = vi.mocked(listSavedOrders);
const builderMock = vi.mocked(isBuilderMode);
const previewMock = vi.mocked(isPreviewMode);
const removeMock = vi.mocked(removeSavedOrder);
const cancelPublicMock = vi.mocked(cancelPublicOrder);

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
  cancelPublicMock.mockReset();
  useUiStore.setState({ loginOpen: false, cartOpen: false });
  unpaidMock.mockReset(); cancelMock.mockReset(); publicMock.mockReset(); savedMock.mockReset();
  savedMock.mockReturnValue([]);
  removeMock.mockReset();
  builderMock.mockReturnValue(false);
  previewMock.mockReturnValue(false);
  shop.access = undefined;
  accessGate.getState().reset();
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
    for (const queryKey of [['orders'], ['order', 'K4M2QP'], ['public-order', 'K4M2QP', 'key-K4M2QP'], ['unpaid-prompt']]) {
      expect(spy).toHaveBeenCalledWith({ queryKey });
    }
  });

  it('guest: cancelling through the order link works and refreshes the guest views', async () => {
    signOut();
    savedMock.mockReturnValue([saved('BBBBBB')]);
    publicMock.mockResolvedValue(publicOrder('BBBBBB', true) as never);
    cancelPublicMock.mockResolvedValue({ reference: 'BBBBBB', status: 'cancelled' });
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    mount('/', client);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' })); });
    expect(cancelPublicMock).toHaveBeenCalledWith('BBBBBB', 'key-BBBBBB');
    expect(cancelMock).not.toHaveBeenCalled();
    await waitFor(() => expect(dialog()).toBeNull());
    expect(spy).toHaveBeenCalledWith({ queryKey: ['unpaid-prompt'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['public-order', 'BBBBBB', 'key-BBBBBB'] });
  });

  it('a guest with nothing saved makes no request at all', async () => {
    signOut();
    savedMock.mockReturnValue([]);
    mount('/');
    await settle();
    expect(dialog()).toBeNull();
    expect(publicMock).not.toHaveBeenCalled();
    expect(unpaidMock).not.toHaveBeenCalled();
  });

  it.each(['loginOpen', 'cartOpen'] as const)('does not open over, or stay over, the %s panel; it appears when that closes', async (panel) => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    useUiStore.setState({ [panel]: true });
    mount('/');
    await settle();
    expect(dialog()).toBeNull();
    expect(unpaidMock).not.toHaveBeenCalled();
    act(() => useUiStore.setState({ [panel]: false }));
    await screen.findByRole('dialog', { name: 'You have an unpaid order' });
    act(() => useUiStore.setState({ [panel]: true }));
    await waitFor(() => expect(dialog()).toBeNull());
  });

  it('a different customer logging in without a reload never sees the previous customer’s list', async () => {
    unpaidMock.mockImplementation(async () => (useSessionStore.getState().customer?.id === 1 ? [unpaid('ADAORD')] : [unpaid('BOBORD')]) as never);
    const client = new QueryClient();
    mount('/', client);
    await screen.findByText('Order ADAORD is waiting for payment.');
    act(() => useSessionStore.setState({ token: 'tok2', customer: { id: 2, nickname: 'Bob' } }));
    await screen.findByText('Order BOBORD is waiting for payment.');
    expect(screen.queryByText('Order ADAORD is waiting for payment.')).toBeNull();
  });

  it('Escape with focus on the confirmation itself, or while cancelling, leaves the pop-up open', async () => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    let release: (v: { reference: string; status: string }) => void = () => {};
    cancelMock.mockReturnValue(new Promise((r) => { release = r; }));
    mount('/');
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    const panel = screen.getByRole('group');
    // Real key events at the focused element reach Mantine's window listener, as in a browser.
    const press = (el: Element) => fireEvent.keyDown(el, { key: 'Escape', bubbles: true });
    // A click on the confirmation text leaves focus on the (focusable) panel; Escape is then sent to it.
    act(() => panel.focus());
    expect(document.activeElement).toBe(panel);
    press(panel);
    expect(dialog()).toBeTruthy();
    expect(screen.queryByText('Cancel order K4M2QP?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    const open = screen.getByRole('group');
    // working: Keep is disabled and focus has moved to the panel
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' }));
    await waitFor(() => expect(document.activeElement).toBe(open));
    press(document.activeElement!);
    expect(dialog()).toBeTruthy();
    expect(screen.getByRole('group')).toBeTruthy();
    await act(async () => { release({ reference: 'K4M2QP', status: 'cancelled' }); });
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

  it('never shows in the appearance preview, and asks nothing', async () => {
    previewMock.mockReturnValue(true);
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    mount('/');
    await settle();
    expect(dialog()).toBeNull();
    expect(unpaidMock).not.toHaveBeenCalled();
  });

  it('a session with no customer id yet asks nothing', async () => {
    useSessionStore.setState({ token: 'tok', customer: null });
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    mount('/');
    await settle();
    expect(unpaidMock).not.toHaveBeenCalled();
  });

  it('a customer the shop has refused sees no pop-up on /account and nothing is requested', async () => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    accessGate.getState().setDenied(true);
    mount('/account');
    await settle();
    expect(dialog()).toBeNull();
    expect(unpaidMock).not.toHaveBeenCalled();
  });

  it('a restricted shop waits for the profile to say shopAccess: true, and never requests it itself', async () => {
    shop.access = { storefront: 'restricted' };
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    const client = new QueryClient();
    const first = mount('/account', client);
    await settle();
    expect(dialog()).toBeNull();
    expect(unpaidMock).not.toHaveBeenCalled();
    act(() => client.setQueryData(['profile'], { shopAccess: false }));
    await settle();
    expect(dialog()).toBeNull();
    expect(unpaidMock).not.toHaveBeenCalled();
    act(() => client.setQueryData(['profile'], { shopAccess: true }));
    await screen.findByRole('dialog', { name: 'You have an unpaid order' });
    first.unmount();
  });

  describe('saved links the lookup proves dead are forgotten', () => {
    const guestMount = () => { signOut(); savedMock.mockReturnValue([saved('AAAAAA')]); return mount('/'); };
    it('an invalid link is removed', async () => {
      publicMock.mockRejectedValue(new InvalidLinkError());
      guestMount();
      await waitFor(() => expect(removeMock).toHaveBeenCalledWith('AAAAAA'));
    });
    it.each(['cancelled', 'refunded'])('a %s order is removed', async (status) => {
      publicMock.mockResolvedValue({ ...publicOrder('AAAAAA', false), status } as never);
      guestMount();
      await waitFor(() => expect(removeMock).toHaveBeenCalledWith('AAAAAA'));
    });
    it.each([
      ['a network error', () => new Error('offline')],
      ['a server error', () => new ApiError(503, 'down')],
      ['rate limiting', () => new ApiError(429, 'slow down')],
    ])('%s keeps the link', async (_name, make) => {
      publicMock.mockRejectedValue(make());
      guestMount();
      await waitFor(() => expect(publicMock).toHaveBeenCalledTimes(1));
      await settle();
      expect(removeMock).not.toHaveBeenCalled();
    });
    it('a paid but still active order keeps the link', async () => {
      publicMock.mockResolvedValue({ ...publicOrder('AAAAAA', false), status: 'processing' } as never);
      guestMount();
      await waitFor(() => expect(publicMock).toHaveBeenCalledTimes(1));
      await settle();
      expect(removeMock).not.toHaveBeenCalled();
    });
    it('an order that can be paid keeps the link', async () => {
      publicMock.mockResolvedValue({ ...publicOrder('AAAAAA', true), status: 'pending' } as never);
      guestMount();
      await screen.findByRole('dialog');
      expect(removeMock).not.toHaveBeenCalled();
    });
  });

  it('prunes a dead saved link without refetching the surviving order', async () => {
    signOut();
    let store = [saved('AAAAAA'), saved('BBBBBB')];
    savedMock.mockImplementation(() => store);
    removeMock.mockImplementation((ref) => { store = store.filter((s) => s.reference !== ref); });
    publicMock.mockImplementation(async (ref) => ({ ...publicOrder(ref, ref === 'BBBBBB'), status: ref === 'AAAAAA' ? 'cancelled' : 'pending' }) as never);
    mount('/');
    await screen.findByRole('dialog', { name: 'You have an unpaid order' });
    await settle();
    expect(removeMock).toHaveBeenCalledWith('AAAAAA');
    expect(publicMock.mock.calls.filter((c) => c[0] === 'BBBBBB')).toHaveLength(1);
    expect(dialog()).toBeTruthy();
  });
});
