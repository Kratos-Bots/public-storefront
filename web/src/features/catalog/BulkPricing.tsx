import { useSettings } from '@/app/settings.ts';
import { formatMoney } from '@/lib/format.ts';
import type { PricingTier } from '@/types/catalog.ts';
import classes from '@/features/catalog/BulkPricing.module.css';

export interface BulkPricingProps {
  tiers: PricingTier[];
  /** The product's base price — the rung everything else is measured against. */
  price: number;
}

/**
 * The quantity ladder. Real tabular data, so it is a real table: the shopper is
 * comparing a column of unit prices, and the saving is the column they came for.
 */
export function BulkPricing({ tiers, price }: BulkPricingProps) {
  const { currency } = useSettings();
  if (tiers.length === 0) return null;

  const byQuantity = new Map<number, number>([[1, price]]);
  for (const tier of tiers) byQuantity.set(tier.minQuantity, tier.price);
  const rows = [...byQuantity.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <table className={classes.table}>
      <thead>
        <tr>
          <th scope="col">Quantity</th>
          <th scope="col">Unit price</th>
          <th scope="col">Saving</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([quantity, unit]) => {
          const saving = price > 0 ? Math.round((1 - unit / price) * 100) : 0;
          return (
            <tr key={quantity}>
              <th scope="row">{quantity}+</th>
              <td className={classes.price}>{formatMoney(unit, currency)}</td>
              <td className={classes.saving}>{saving > 0 ? `−${saving}%` : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
