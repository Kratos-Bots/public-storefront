import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router';

vi.mock('@/api/orders.ts', async (orig) => ({ ...(await orig<typeof import('@/api/orders.ts')>()), fetchUnpaidOrders: vi.fn() }));
vi.mock('@/app/builder-gate.ts', () => ({ isBuilderMode: vi.fn(() => false) }));
const shop = vi.hoisted(() => ({ access: undefined as undefined | { storefront: string } }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ supportLinks: [{ label: 'Chat', url: 'https://t.me/example_shop' }], currency: 'GBP', access: shop.access }) }));
vi.mock('@/app/preview-listener.ts', () => ({ isPreviewMode: vi.fn(() => false) }));

import { fetchUnpaidOrders } from '@/api/orders.ts';
import { accessGate } from '@/app/access-gate.ts';
import { isBuilderMode } from '@/app/builder-gate.ts';
import { isPreviewMode } from '@/app/preview-listener.ts';
import { UnpaidOrderPrompt } from '@/features/unpaid-prompt/UnpaidOrderPrompt.tsx';
import { resetDismissalForTests } from '@/features/unpaid-prompt/useUnpaidOrder.ts';
import { useSessionStore } from '@/stores/session.ts';
import { useUiStore } from '@/stores/ui.ts';

const unpaidMock = vi.mocked(fetchUnpaidOrders);
const builderMock = vi.mocked(isBuilderMode);
const previewMock = vi.mocked(isPreviewMode);

const unpaid = (reference: string, over: Record<string, unknown> = {}) => ({
  reference, createdAt: '2026-10-03T10:00:00Z', totalAmount: 46.03, outstandingBalance: 46.03,
  payBy: null, canCancel: true, cancelBlockedBy: null, ...over,
});

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
  resetDismissalForTests();
  sessionStorage.clear();
  useUiStore.setState({ loginOpen: false, cartOpen: false });
  unpaidMock.mockReset();
  builderMock.mockReturnValue(false);
  previewMock.mockReturnValue(false);
  shop.access = undefined;
  accessGate.getState().reset();
  signIn();
});
afterEach(cleanup);

describe('UnpaidOrderPrompt', () => {
  it('signed in: shows the newest unpaid order with its amount, one button and Not now', async () => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP'), unpaid('Z9ZZZZ')] as never);
    mount('/');
    await screen.findByRole('dialog', { name: 'You have an unpaid order' });
    expect(screen.getByText('Order K4M2QP is waiting for payment.')).toBeTruthy();
    expect(screen.getByText('£46.03')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Review or cancel order' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
    expect(screen.getByRole('link', { name: /other unpaid orders/ }).getAttribute('href')).toBe('/account/orders');
  });

  it('signed in with one order: no "other orders" line', async () => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    mount('/');
    await screen.findByRole('dialog');
    expect(screen.queryByRole('link', { name: /other unpaid orders/ })).toBeNull();
  });

  it('Review or cancel order goes to the account order page and closes the dialog', async () => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    mount('/');
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Review or cancel order' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/account/orders/K4M2QP'));
    expect(dialog()).toBeNull();
  });

  it('Not now hides it across route changes and remounts, without touching sessionStorage', async () => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    const first = mount('/');
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(sessionStorage.getItem('sf-unpaid-prompt-snoozed')).toBeNull();
    first.unmount();
    unpaidMock.mockClear();
    mount('/catalog');
    await settle();
    expect(dialog()).toBeNull();
    expect(unpaidMock).not.toHaveBeenCalled();
  });

  it('a fresh page load asks again', async () => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    const first = mount('/');
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(dialog()).toBeNull());
    first.unmount();
    resetDismissalForTests();
    mount('/');
    await screen.findByRole('dialog', { name: 'You have an unpaid order' });
  });

  it('a signed-out visitor is never asked and nothing is requested', async () => {
    signOut();
    mount('/');
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
    expect(sessionStorage.getItem('sf-unpaid-prompt-snoozed')).toBeNull();
  });

  it.each(['/checkout', '/order/K4M2QP/abc', '/payment/success', '/account/orders/K4M2QP', '/login'])('never shows on %s, and asks nothing', async (path) => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    mount(path);
    await settle();
    expect(dialog()).toBeNull();
    expect(unpaidMock).not.toHaveBeenCalled();
  });

  it('never shows in the page builder', async () => {
    builderMock.mockReturnValue(true);
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    mount('/');
    await settle();
    expect(dialog()).toBeNull();
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

  it('signing out mid-visit closes the pop-up', async () => {
    unpaidMock.mockResolvedValue([unpaid('K4M2QP')] as never);
    mount('/');
    await screen.findByRole('dialog');
    act(() => signOut());
    await waitFor(() => expect(dialog()).toBeNull());
    expect(screen.queryByText('Order K4M2QP is waiting for payment.')).toBeNull();
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

});
