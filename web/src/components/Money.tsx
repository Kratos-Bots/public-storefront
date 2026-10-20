import { useCurrency } from '@/features/warehouses/use-currency.ts';
import { formatMoney } from '@/lib/format.ts';

/**
 * A price in the currency being shown (the selected warehouse's). Always tabular so figures line up when a
 * quantity stepper or a quote changes the number in place.
 */
export function Money({ amount, currency }: { amount: number; currency?: string }) {
  const shopCurrency = useCurrency();
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {formatMoney(amount, currency ?? shopCurrency)}
    </span>
  );
}
