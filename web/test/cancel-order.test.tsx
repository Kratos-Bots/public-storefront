import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/api/orders.ts', async (orig) => ({ ...(await orig<typeof import('@/api/orders.ts')>()), cancelOrder: vi.fn() }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ supportLinks: [{ label: 'Chat', url: 'https://t.me/example_shop' }] }) }));

import { cancelOrder, OrderNotCancellableError } from '@/api/orders.ts';
import { CancelOrder } from '@/features/order-status/CancelOrder.tsx';

const cancelMock = vi.mocked(cancelOrder);

const wrap = (props: Parameters<typeof CancelOrder>[0]) => (
  <MantineProvider env="test"><QueryClientProvider client={new QueryClient()}><CancelOrder {...props} /></QueryClientProvider></MantineProvider>
);

const mount = (over: Partial<Parameters<typeof CancelOrder>[0]> = {}) => {
  const props = { reference: 'K4M2QP', canCancel: true, blockedBy: null, onCancelled: vi.fn(), ...over };
  render(wrap(props));
  return props;
};

const openDialog = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
  return screen.findByRole('dialog');
};

const yes = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Yes, cancel order' });

beforeEach(() => { cancelMock.mockReset(); });
afterEach(cleanup);

describe('CancelOrder', () => {
  it('asks in a dialog before cancelling, and Keep order backs out without a request', async () => {
    mount({ canCancel: true });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancel order K4M2QP?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep order' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('has no close button, and a click outside does not close it', async () => {
    mount({ canCancel: true });
    const dialog = await openDialog();
    expect(within(dialog).queryByRole('button', { name: /close/i })).toBeNull();
    const overlay = document.querySelector('.mantine-Modal-overlay')!;
    expect(overlay).toBeTruthy();
    fireEvent.mouseDown(overlay);
    fireEvent.click(overlay);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('Keep order has focus when it opens, and Escape means Keep order', async () => {
    mount({ canCancel: true });
    const dialog = await openDialog();
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Keep order' })));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('a double tap on Yes sends one request, and nothing closes the dialog while it runs', async () => {
    let finish!: () => void;
    cancelMock.mockReturnValue(new Promise((r) => { finish = () => r({ reference: 'K4M2QP', status: 'cancelled' }); }));
    mount({ canCancel: true });
    const dialog = await openDialog();
    const button = yes(dialog);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole('button', { name: 'Cancelling…' })).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Keep order' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    await act(async () => { finish(); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a signed-in cancel calls the session route and reports success', async () => {
    cancelMock.mockResolvedValueOnce({ reference: 'K4M2QP', status: 'cancelled' });
    const props = mount();
    const dialog = await openDialog();
    await act(async () => { fireEvent.click(yes(dialog)); });
    expect(cancelMock).toHaveBeenCalledWith('K4M2QP');
    expect(props.onCancelled).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it.each([
    ['paid', 'This order has already been paid, so it can no longer be cancelled here.'],
    ['bank_transfer', 'A payment may already be on its way, so this order cannot be cancelled here. Contact us and we will help.'],
    ['crypto_submitted', 'A payment may already be on its way, so this order cannot be cancelled here. Contact us and we will help.'],
    ['not_pending', 'This order is no longer waiting for payment.'],
  ] as const)('a refusal for %s closes the dialog, says why on the page and still refreshes', async (reason, text) => {
    cancelMock.mockRejectedValueOnce(new OrderNotCancellableError(reason));
    const props = mount();
    const dialog = await openDialog();
    await act(async () => { fireEvent.click(yes(dialog)); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText(text)).toBeTruthy();
    expect(props.onCancelled).toHaveBeenCalledTimes(1);
  });

  it('any other failure keeps the dialog open with the message inside it, and can be retried', async () => {
    cancelMock.mockRejectedValueOnce(new Error('network'));
    mount();
    const dialog = await openDialog();
    await act(async () => { fireEvent.click(yes(dialog)); });
    expect(within(screen.getByRole('dialog')).getByText("We couldn't cancel the order. Please try again.")).toBeTruthy();
    cancelMock.mockResolvedValueOnce({ reference: 'K4M2QP', status: 'cancelled' });
    await act(async () => { fireEvent.click(yes(screen.getByRole('dialog'))); });
    expect(cancelMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows the contact line and the shop’s links when money may be on its way', () => {
    mount({ canCancel: false, blockedBy: 'bank_transfer' });
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
    expect(screen.getByText('To cancel this order, contact us: a payment may already be on its way.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Chat' }).getAttribute('href')).toBe('https://t.me/example_shop');
  });

  it('renders nothing when the order is paid or the backend is older', () => {
    const { container } = render(wrap({ reference: 'K4M2QP', canCancel: undefined, blockedBy: undefined }));
    // MantineProvider injects <style> tags into the container; the control itself must add no element.
    expect(container.querySelectorAll(':not(style)')).toHaveLength(0);
  });

  it.each([
    ['not_pending', { canCancel: false, blockedBy: null }, 'This order is no longer waiting for payment.'],
    ['paid', { canCancel: false, blockedBy: 'paid' }, 'This order has already been paid, so it can no longer be cancelled here.'],
  ] as const)('a %s refusal stays on screen after the refreshed order hides the control', async (reason, after, text) => {
    cancelMock.mockRejectedValueOnce(new OrderNotCancellableError(reason));
    const base = { reference: 'K4M2QP', canCancel: true, blockedBy: null } as const;
    const { rerender } = render(wrap(base));
    const dialog = await openDialog();
    await act(async () => { fireEvent.click(yes(dialog)); });
    rerender(wrap({ reference: 'K4M2QP', ...after }));
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
  });

  it('a bank_transfer refusal stays alongside the contact line and support link', async () => {
    cancelMock.mockRejectedValueOnce(new OrderNotCancellableError('bank_transfer'));
    const { rerender } = render(wrap({ reference: 'K4M2QP', canCancel: true, blockedBy: null }));
    const dialog = await openDialog();
    await act(async () => { fireEvent.click(yes(dialog)); });
    rerender(wrap({ reference: 'K4M2QP', canCancel: false, blockedBy: 'bank_transfer' }));
    expect(screen.getByText('A payment may already be on its way, so this order cannot be cancelled here. Contact us and we will help.')).toBeTruthy();
    expect(screen.getByText('To cancel this order, contact us: a payment may already be on its way.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Chat' })).toBeTruthy();
  });

  describe('the order changes under an open dialog', () => {
    const open = { reference: 'K4M2QP', canCancel: true, blockedBy: null } as const;

    it.each(['bank_transfer', 'crypto_submitted'] as const)(
      'blockedBy %s closes the dialog, shows the contact line and the support links, and sends nothing', async (blockedBy) => {
        const { rerender } = render(wrap(open));
        await openDialog();
        rerender(wrap({ reference: 'K4M2QP', canCancel: false, blockedBy }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(screen.getByText('To cancel this order, contact us: a payment may already be on its way.')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Chat' }).getAttribute('href')).toBe('https://t.me/example_shop');
        expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
        expect(cancelMock).not.toHaveBeenCalled();
      });

    it('a payment arriving closes the dialog and says the order has already been paid, with no request', async () => {
      const { rerender } = render(wrap(open));
      await openDialog();
      rerender(wrap({ reference: 'K4M2QP', canCancel: false, blockedBy: 'paid' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.getByText('This order has already been paid, so it can no longer be cancelled here.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
      expect(cancelMock).not.toHaveBeenCalled();
    });

    it('an order that is simply no longer cancellable says it is no longer waiting for payment', async () => {
      const { rerender } = render(wrap(open));
      await openDialog();
      rerender(wrap({ reference: 'K4M2QP', canCancel: false, blockedBy: null }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.getByText('This order is no longer waiting for payment.')).toBeTruthy();
      expect(cancelMock).not.toHaveBeenCalled();
    });
  });
});
