import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CryptoComboPicker } from '@/features/checkout/CryptoComboPicker.tsx';
import { comboPhrase } from '@/features/checkout/crypto-groups.ts';
import { textSnapshot } from '@/text/snapshot.ts';
import type { CryptoOption } from '@/types/checkout.ts';

const opt = (coin: string, network: string, coinLabel: string, networkLabel: string, feeRateText = ''): CryptoOption => ({
  coin, network, coinLabel, networkLabel, feeType: null, feeValue: null, feeRateText, feeLabel: '', fee: 0, chargeTotal: 46.03,
});

const EIGHT: CryptoOption[] = [
  opt('btc', 'bitcoin', 'BTC', 'Bitcoin', '−3%'),
  opt('ltc', 'litecoin', 'LTC', 'Litecoin'),
  opt('eth', 'ethereum', 'ETH', 'Ethereum'),
  opt('usdt', 'ethereum', 'USDT', 'Ethereum'),
  opt('usdc', 'ethereum', 'USDC', 'Ethereum'),
  opt('usdt', 'tron', 'USDT', 'Tron'),
  opt('usdt', 'polygon', 'USDT', 'Polygon'),
  opt('usdc', 'polygon', 'USDC', 'Polygon'),
];

afterEach(cleanup);

describe('CryptoComboPicker', () => {
  it('headlines each network, even when there is only one', () => {
    const { rerender } = render(<CryptoComboPicker options={EIGHT} value={null} onChange={() => {}} currency="GBP" />);
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-labelledby') && document.getElementById(g.getAttribute('aria-labelledby')!)!.textContent))
      .toEqual(['Bitcoin network', 'Litecoin network', 'Ethereum network', 'Tron network', 'Polygon network']);
    rerender(<CryptoComboPicker options={[opt('usdt', 'tron', 'USDT', 'Tron')]} value={null} onChange={() => {}} currency="GBP" />);
    expect(screen.getByRole('group', { name: 'Tron network' })).toBeTruthy();
  });

  it('is one radio group whose rows are named for coin and network', () => {
    render(<CryptoComboPicker options={EIGHT} value={null} onChange={() => {}} currency="GBP" />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(8);
    expect(new Set(radios.map((r) => r.getAttribute('name'))).size).toBe(1);
    expect(screen.getByRole('radio', { name: /^USDT on Polygon/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^USDT on Tron/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^BTC on Bitcoin −3%/ })).toBeTruthy();
  });

  it('places each row under its own network heading', () => {
    render(<CryptoComboPicker options={EIGHT} value={null} onChange={() => {}} currency="GBP" />);
    const poly = within(screen.getByRole('group', { name: 'Polygon network' }));
    expect(poly.getAllByRole('radio').map((r) => r.closest('label')!.textContent)).toEqual([
      expect.stringMatching(/^USDT on Polygon/), expect.stringMatching(/^USDC on Polygon/),
    ]);
  });

  it('does not stutter when the coin is named like its network', () => {
    render(<CryptoComboPicker options={[opt('ltc', 'litecoin', 'Litecoin', 'Litecoin')]} value={null} onChange={() => {}} currency="GBP" />);
    const row = screen.getByRole('radio').closest('label')!;
    expect(row.textContent).toMatch(/^Litecoin\s*Litecoin network/);
    expect(row.textContent).not.toMatch(/on Litecoin/);
  });

  it('checks the chosen combo only, and reports a pick', () => {
    const onChange = vi.fn();
    render(<CryptoComboPicker options={EIGHT} value={{ coin: 'usdt', network: 'tron' }} onChange={onChange} currency="GBP" />);
    const checked = screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked);
    expect(checked).toHaveLength(1);
    expect(checked[0]!.closest('label')!.textContent).toMatch(/^USDT on Tron/);
    fireEvent.click(screen.getByRole('radio', { name: /^USDC on Polygon/ }));
    expect(onChange).toHaveBeenCalledWith({ coin: 'usdc', network: 'polygon' });
  });

  it('renders nothing without options', () => {
    const { container } = render(<CryptoComboPicker options={[]} value={null} onChange={() => {}} currency="GBP" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('comboPhrase', () => {
  const t = textSnapshot().t;
  it('reads "coin on network", or just the name when they match', () => {
    expect(comboPhrase(t, opt('usdt', 'polygon', 'USDT', 'Polygon'))).toBe('USDT on Polygon');
    expect(comboPhrase(t, opt('ltc', 'litecoin', 'Litecoin', 'Litecoin'))).toBe('Litecoin');
  });
});
