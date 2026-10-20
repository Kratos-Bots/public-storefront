/** What the shopper is actually charged when it is not in the order's own currency (a dropship partner that takes payment itself). */
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
 * backend, or a payment taken in the order's own currency), so every such screen is exactly what it was.
 * `baseCurrency` is the quote's or order's currency, not the shop's: a EUR warehouse whose partner charges GBP in a
 * GBP shop is a real charge line.
 */
export function chargedIn(item: Chargeable | null | undefined, baseCurrency: string): ChargedIn | null {
  const currency = item?.chargeCurrency;
  const amount = item?.settlementTotal;
  if (!currency || typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  if (currency.toUpperCase() === baseCurrency.toUpperCase()) return null;
  return { amount, currency };
}

/** The chosen coin's figure, else its method's: a coin can be charged differently from the method it sits under. */
export function chargedInFor(method: Chargeable | null | undefined, combo: Chargeable | null | undefined, baseCurrency: string): ChargedIn | null {
  return chargedIn(combo, baseCurrency) ?? chargedIn(method, baseCurrency);
}

/**
 * A placed payment's own quote (`settlementAmount` in `settlementCurrency`), the same for every kind of payment. Null when
 * that currency is the order's own (`orderCurrency`): the backend's descriptors can still carry a same-currency pair.
 */
export function chargedInFromPayment(
  payment: { settlementAmount?: number | null; settlementCurrency?: string | null } | null | undefined,
  orderCurrency?: string,
): ChargedIn | null {
  const amount = payment?.settlementAmount;
  const currency = payment?.settlementCurrency;
  if (amount == null || !currency || !Number.isFinite(amount)) return null;
  if (orderCurrency && currency.toUpperCase() === orderCurrency.toUpperCase()) return null;
  return { amount, currency };
}
