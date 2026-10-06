import type { CryptoOption } from '@/types/checkout.ts';
import { textKey, type TextApi } from '@/text/snapshot.ts';

export interface NetworkGroup {
  network: string;
  /** The network's name as the shop labels it (the first row's). */
  label: string;
  options: CryptoOption[];
}

/**
 * One group per network, networks in the order they first appear and rows in the order given: the backend's
 * list is the shop's own order, so grouping must not re-sort it. A coin sent on the wrong network is lost, so
 * the network, not the coin kind, is what the picker is organised around.
 */
export function groupByNetwork(options: CryptoOption[]): NetworkGroup[] {
  const groups = new Map<string, NetworkGroup>();
  for (const o of options) {
    const group = groups.get(o.network);
    if (group) group.options.push(o);
    else groups.set(o.network, { network: o.network, label: o.networkLabel, options: [o] });
  }
  return [...groups.values()];
}

const norm = (s: string) => s.trim().toLowerCase();

/** A native coin whose label is its chain's name ("Litecoin" on Litecoin): "Litecoin on Litecoin" would only stutter. */
export function namesNetworkAsCoin(o: CryptoOption): boolean {
  return norm(o.coinLabel) === norm(o.networkLabel);
}

/** One option in a phrase ("USDT on Polygon"), for the Review line and the order page's Pay button. */
export function comboPhrase(t: TextApi['t'], o: CryptoOption): string {
  return namesNetworkAsCoin(o) ? o.coinLabel : t(textKey('checkout.crypto.coinOnNetwork'), { coin: o.coinLabel, network: o.networkLabel });
}
