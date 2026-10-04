import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/api/orders.ts', () => ({ cancelOrder: vi.fn() }));
vi.mock('@/api/public-order.ts', async (orig) => ({ ...(await orig<typeof import('@/api/public-order.ts')>()), cancelPublicOrder: vi.fn() }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ supportLinks: [{ label: 'Chat', url: 'https://t.me/example_shop' }] }) }));

import { cancelOrder } from '@/api/orders.ts';
import { cancelPublicOrder, OrderNotCancellableError } from '@/api/public-order.ts';
import { CancelOrder } from '@/features/order-status/CancelOrder.tsx';

const cancelMock = vi.mocked(cancelOrder);
const cancelPublicMock = vi.mocked(cancelPublicOrder);

const mount = (over: Partial<Parameters<typeof CancelOrder>[0]> = {}) => {
  const props = { reference: 'K4M2QP', canCancel: true, blockedBy: null, onCancelled: vi.fn(), ...over };
  render(
    <MantineProvider env="test">
      <QueryClientProvider client={new QueryClient()}>
        <CancelOrder {...props} />
      </QueryClientProvider>
    </MantineProvider>,
  );
  return props;
};

beforeEach(() => { cancelMock.mockReset(); cancelPublicMock.mockReset(); });
afterEach(cleanup);

describe('CancelOrder', () => {
  it('asks before cancelling, and Keep backs out without a request', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    expect(screen.getByText('Cancel order K4M2QP?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep the order' }));
    expect(screen.queryByText('Cancel order K4M2QP?')).toBeNull();
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('a signed-in cancel calls the session route and reports success', async () => {
    cancelMock.mockResolvedValueOnce({ reference: 'K4M2QP', status: 'cancelled' });
    const props = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' })); });
    expect(cancelMock).toHaveBeenCalledWith('K4M2QP');
    expect(cancelPublicMock).not.toHaveBeenCalled();
    expect(props.onCancelled).toHaveBeenCalledTimes(1);
  });

  it('with an access key and no session flag it cancels through the order link', async () => {
    cancelPublicMock.mockResolvedValueOnce({ reference: 'K4M2QP', status: 'cancelled' });
    mount({ accessKey: 'abc123', viaLink: true });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' })); });
    expect(cancelPublicMock).toHaveBeenCalledWith('K4M2QP', 'abc123');
  });

  it.each([
    ['paid', 'This order has already been paid, so it can no longer be cancelled here.'],
    ['bank_transfer', 'A payment may already be on its way, so this order cannot be cancelled here. Contact us and we will help.'],
    ['crypto_submitted', 'A payment may already be on its way, so this order cannot be cancelled here. Contact us and we will help.'],
    ['not_pending', 'This order is no longer waiting for payment.'],
  ] as const)('a refusal for %s says why and still refreshes', async (reason, text) => {
    cancelMock.mockRejectedValueOnce(new OrderNotCancellableError(reason));
    const props = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' })); });
    expect(screen.getByText(text)).toBeTruthy();
    expect(props.onCancelled).toHaveBeenCalledTimes(1);
  });

  it('any other failure can be retried', async () => {
    cancelMock.mockRejectedValueOnce(new Error('network'));
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' })); });
    expect(screen.getByText("We couldn't cancel the order. Please try again.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yes, cancel it' })).toBeTruthy();
  });

  it('does not double-submit', async () => {
    let resolve!: (v: { reference: string; status: string }) => void;
    cancelMock.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' }));
    fireEvent.click(screen.getByRole('button', { name: /Cancelling|Yes, cancel it/ }));
    expect(cancelMock).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ reference: 'K4M2QP', status: 'cancelled' }); });
  });

  it('shows the contact line and the shop’s links when money may be on its way', () => {
    mount({ canCancel: false, blockedBy: 'bank_transfer' });
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
    expect(screen.getByText('To cancel this order, contact us: a payment may already be on its way.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Chat' }).getAttribute('href')).toBe('https://t.me/example_shop');
  });

  it('renders nothing when the order is paid or the backend is older', () => {
    const { container } = render(
      <MantineProvider env="test"><QueryClientProvider client={new QueryClient()}><CancelOrder reference="K4M2QP" canCancel={undefined} blockedBy={undefined} /></QueryClientProvider></MantineProvider>,
    );
    // MantineProvider injects <style> tags into the container; the control itself must add no element.
    expect(container.querySelectorAll(':not(style)')).toHaveLength(0);
  });

  const wrap = (props: Parameters<typeof CancelOrder>[0]) => (
    <MantineProvider env="test"><QueryClientProvider client={new QueryClient()}><CancelOrder {...props} /></QueryClientProvider></MantineProvider>
  );

  it.each([
    ['not_pending', { canCancel: false, blockedBy: null }, 'This order is no longer waiting for payment.'],
    ['paid', { canCancel: false, blockedBy: 'paid' }, 'This order has already been paid, so it can no longer be cancelled here.'],
  ] as const)('a %s refusal stays on screen after the refreshed order hides the control', async (reason, after, text) => {
    cancelMock.mockRejectedValueOnce(new OrderNotCancellableError(reason));
    const base = { reference: 'K4M2QP', canCancel: true, blockedBy: null } as const;
    const { rerender } = render(wrap(base));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' })); });
    rerender(wrap({ reference: 'K4M2QP', ...after }));
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
  });

  it('a bank_transfer refusal stays alongside the contact line and support link', async () => {
    cancelMock.mockRejectedValueOnce(new OrderNotCancellableError('bank_transfer'));
    const { rerender } = render(wrap({ reference: 'K4M2QP', canCancel: true, blockedBy: null }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' })); });
    rerender(wrap({ reference: 'K4M2QP', canCancel: false, blockedBy: 'bank_transfer' }));
    expect(screen.getByText('A payment may already be on its way, so this order cannot be cancelled here. Contact us and we will help.')).toBeTruthy();
    expect(screen.getByText('To cancel this order, contact us: a payment may already be on its way.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Chat' })).toBeTruthy();
  });

  it('renders nothing when viaLink is set without an access key', () => {
    const { container } = render(wrap({ reference: 'K4M2QP', viaLink: true, canCancel: true, blockedBy: null }));
    expect(container.querySelectorAll(':not(style)')).toHaveLength(0);
  });

  it('Escape closes the confirmation like Keep and returns focus to the Cancel button', () => {
    mount();
    const trigger = screen.getByRole('button', { name: 'Cancel order' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Keep the order' }), { key: 'Escape' });
    expect(screen.queryByText('Cancel order K4M2QP?')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel order' }));
    expect(cancelMock).not.toHaveBeenCalled();
  });
});
