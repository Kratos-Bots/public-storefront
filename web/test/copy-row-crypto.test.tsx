import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/api/orders.ts', async (orig) => ({ ...(await orig<typeof import('@/api/orders.ts')>()), submitOrderCryptoTxid: vi.fn() }));
vi.mock('@/app/settings.ts', () => ({ useSettings: () => ({ currency: 'GBP', supportLinks: [] }) }));

import { submitOrderCryptoTxid } from '@/api/orders.ts';
import { CopyRow } from '@/features/order-status/CopyRow.tsx';
import { CryptoPaymentCard } from '@/features/order-status/CryptoPaymentCard.tsx';
import type { PublicCryptoPayment } from '@/types/public-order.ts';

const ADDRESS = '0xE2E1a2b3c4d5e6f7089aabbccddeeff0011223344';
const payment: PublicCryptoPayment = {
  paymentId: 5, paymentStatus: 'pending', coin: 'usdt', network: 'polygon', coinLabel: 'USDT', networkLabel: 'Polygon',
  address: ADDRESS, coinAmount: '46.03', fiatAmount: 46.03, verificationStatus: 'pending', needsAttention: false, txidMasked: null,
} as PublicCryptoPayment;

const shell = (node: React.ReactNode) => (
  <MantineProvider env="test"><QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider></MantineProvider>
);

const writeText = vi.fn();
beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  vi.mocked(submitOrderCryptoTxid).mockReset();
});
afterEach(cleanup);

describe('the grouped wallet address', () => {
  const mount = () => render(shell(<CopyRow label="USDT address (Polygon)" value={ADDRESS} groupBy={4} />));
  /** The grouped, visible run and the single raw copy: the only two places the address is written. */
  const parts = (container: HTMLElement) => {
    const value = container.querySelector('p[class*="copyGrouped"]')!;
    const hidden = value.querySelector('span[aria-hidden]')!;
    const raw = [...value.children].find((c) => c !== hidden)!;
    return { value, hidden, raw };
  };

  it('the visible groups, joined, are exactly the address, with no whitespace text between them', () => {
    const { container } = mount();
    const { hidden } = parts(container);
    const groups = [...hidden.children];
    expect(groups.every((g) => g.children.length === 0)).toBe(true);
    expect(groups.map((g) => g.textContent).join('')).toBe(ADDRESS);
    expect(groups.every((g) => (g.textContent ?? '').length <= 4)).toBe(true);
    // Every child of the hidden run is a group element: no whitespace text node that a selection could copy.
    expect([...hidden.childNodes].every((n) => n.nodeType === 1)).toBe(true);
    expect(hidden.textContent).toBe(ADDRESS);
  });

  it('assistive technology gets the address once: the groups are aria-hidden, the raw copy is not', () => {
    const { container } = mount();
    const { value, hidden, raw } = parts(container);
    expect(hidden.getAttribute('aria-hidden')).toBe('true');
    expect(raw.getAttribute('aria-hidden')).toBeNull();
    expect(raw.textContent).toBe(ADDRESS);
    expect(value.querySelectorAll(':scope > *')).toHaveLength(2);
  });

  it('the Copy control writes exactly the raw address', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /copy usdt address/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(ADDRESS);
  });
});

describe('the crypto steps', () => {
  const mount = () => render(shell(<CryptoPaymentCard payment={payment} reference="K4M2QP" currency="GBP" />));

  it('are an ordered list of three items', () => {
    const { container } = mount();
    const list = container.querySelector('ol')!;
    expect(list).toBeTruthy();
    expect(within(list as HTMLElement).getAllByRole('listitem')).toHaveLength(3);
    expect(list.querySelectorAll(':scope > li')).toHaveLength(3);
  });

  it('the transaction id input points at its error only while one shows', async () => {
    vi.mocked(submitOrderCryptoTxid).mockRejectedValue(new Error('boom'));
    mount();
    const input = screen.getByLabelText(/transaction id/i);
    expect(input.getAttribute('aria-describedby')).toBeNull();
    fireEvent.change(input, { target: { value: '0x'.padEnd(20, 'a') } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    const alert = await screen.findByRole('alert');
    const id = input.getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(alert.id).toBe(id);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
});
