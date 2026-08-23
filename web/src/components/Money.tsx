import { useSettings } from '@/app/settings.ts';
import { formatMoney } from '@/lib/format.ts';

/**
 * A price in the store's currency. Always tabular so figures line up when a
 * quantity stepper or a quote changes the number in place.
 */
export function Money({ amount, currency }: { amount: number; currency?: string }) {
  const settings = useSettings();
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {formatMoney(amount, currency ?? settings.currency)}
    </span>
  );
}
