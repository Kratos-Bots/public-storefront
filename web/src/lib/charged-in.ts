/** What the shopper is actually charged when it is not in the store's currency (a dropship partner that takes payment itself). */
export interface ChargedIn {
  amount: number;
  currency: string;
}

interface Chargeable {
  chargeCurrency?: string;
  settlementTotal?: number;
}

/**
 * The "Charged in EUR: €65.25" figure of one method or coin. Null when the backend sent neither field (an older
 * backend, or a payment taken in the store's own currency), so every such screen is exactly what it was.
 */
export function chargedIn(item: Chargeable | null | undefined, storeCurrency: string): ChargedIn | null {
  const currency = item?.chargeCurrency;
  const amount = item?.settlementTotal;
  if (!currency || typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  if (currency.toUpperCase() === storeCurrency.toUpperCase()) return null;
  return { amount, currency };
}

/** The chosen coin's figure, else its method's: a coin can be charged differently from the method it sits under. */
export function chargedInFor(method: Chargeable | null | undefined, combo: Chargeable | null | undefined, storeCurrency: string): ChargedIn | null {
  return chargedIn(combo, storeCurrency) ?? chargedIn(method, storeCurrency);
}

/** A placed payment's own quote (`settlementAmount` in `settlementCurrency`), the same for every kind of payment. */
export function chargedInFromPayment(
  payment: { settlementAmount?: number | null; settlementCurrency?: string | null } | null | undefined,
): ChargedIn | null {
  const amount = payment?.settlementAmount;
  const currency = payment?.settlementCurrency;
  if (amount == null || !currency || !Number.isFinite(amount)) return null;
  return { amount, currency };
}
