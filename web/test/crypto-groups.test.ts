import { describe, expect, it } from 'vitest';
import { groupByNetwork, namesNetworkAsCoin } from '@/features/checkout/crypto-groups.ts';
import type { CryptoOption } from '@/types/checkout.ts';

const opt = (coin: string, network: string, coinLabel: string, networkLabel: string): CryptoOption => ({
  coin, network, coinLabel, networkLabel, feeType: null, feeValue: null, feeRateText: '', feeLabel: '', fee: 0, chargeTotal: 46.03,
});

/** A realistic shop: native coins first, then the stablecoins on three networks, interleaved as the admin ordered them. */
export const EIGHT: CryptoOption[] = [
  opt('btc', 'bitcoin', 'BTC', 'Bitcoin'),
  opt('ltc', 'litecoin', 'LTC', 'Litecoin'),
  opt('eth', 'ethereum', 'ETH', 'Ethereum'),
  opt('usdt', 'ethereum', 'USDT', 'Ethereum'),
  opt('usdc', 'ethereum', 'USDC', 'Ethereum'),
  opt('usdt', 'tron', 'USDT', 'Tron'),
  opt('usdt', 'polygon', 'USDT', 'Polygon'),
  opt('usdc', 'polygon', 'USDC', 'Polygon'),
];

describe('groupByNetwork', () => {
  it('makes one group per network, in the order each network first appears', () => {
    expect(groupByNetwork(EIGHT).map((g) => g.network)).toEqual(['bitcoin', 'litecoin', 'ethereum', 'tron', 'polygon']);
  });

  it('keeps the rows of a group in the order given', () => {
    const groups = groupByNetwork(EIGHT);
    expect(groups.find((g) => g.network === 'ethereum')!.options.map((o) => o.coin)).toEqual(['eth', 'usdt', 'usdc']);
    expect(groups.find((g) => g.network === 'polygon')!.options.map((o) => o.coin)).toEqual(['usdt', 'usdc']);
    expect(groups.flatMap((g) => g.options).length).toBe(8);
  });

  it('pulls a later row of an earlier network back into that network\'s group', () => {
    const mixed = [opt('usdt', 'tron', 'USDT', 'Tron'), opt('btc', 'bitcoin', 'BTC', 'Bitcoin'), opt('usdc', 'tron', 'USDC', 'Tron')];
    const groups = groupByNetwork(mixed);
    expect(groups.map((g) => [g.network, g.options.map((o) => o.coin)])).toEqual([['tron', ['usdt', 'usdc']], ['bitcoin', ['btc']]]);
  });

  it('names a group by its network label', () => {
    expect(groupByNetwork(EIGHT)[3]!.label).toBe('Tron');
  });

  it('is empty for no options', () => {
    expect(groupByNetwork([])).toEqual([]);
  });
});

describe('namesNetworkAsCoin', () => {
  it('is true when the coin and network read the same, whatever the case or spacing', () => {
    expect(namesNetworkAsCoin(opt('ltc', 'litecoin', 'Litecoin', 'Litecoin'))).toBe(true);
    expect(namesNetworkAsCoin(opt('btc', 'bitcoin', ' bitcoin ', 'Bitcoin'))).toBe(true);
  });
  it('is false for a coin on a differently named network', () => {
    expect(namesNetworkAsCoin(opt('btc', 'bitcoin', 'BTC', 'Bitcoin'))).toBe(false);
  });
});
