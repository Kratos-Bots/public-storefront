import { useSettings } from '@/app/settings.ts';
import { formatMoney } from '@/lib/format.ts';
import { activeRungMin, ladderRungs } from '@/features/wholesale/wholesale-helpers.ts';
import type { Product } from '@/types/catalog.ts';
import classes from '@/features/wholesale/TierLadder.module.css';

export interface TierLadderProps {
  id: string;
  product: Product;
  quantity: number;
  band: boolean;
  inCart: boolean;
  groupEnd: boolean;
  ordering: boolean;
}

/**
 * The price breaks, unrolled into the sheet's own columns — each rung's price
 * lands under the unit price it would become, so the buyer reads straight down
 * from what they are paying now to what the next break is worth. The rung in
 * force is named, not just tinted.
 */
export function TierLadder({ id, product, quantity, band, inCart, groupEnd, ordering }: TierLadderProps) {
  const { currency } = useSettings();
  const rungs = ladderRungs(product);
  const activeMin = activeRungMin(product, quantity);

  return (
    <tbody
      id={id}
      role="rowgroup"
      className={`${classes.ladder} ${band ? classes.band : ''} ${inCart ? classes.inCart : ''} ${
        groupEnd ? classes.groupEnd : ''
      }`}
    >
      {rungs.map((rung) => {
        const active = rung.minQuantity === activeMin;
        const off =
          product.price > 0 && rung.price < product.price
            ? Math.round((1 - rung.price / product.price) * 100)
            : 0;
        return (
          <tr
            key={rung.minQuantity}
            className={`${classes.rung} ${active ? classes.active : ''}`}
            role="row"
          >
            <td className={classes.pad} role="cell" />
            <td className={classes.threshold} role="cell">
              {rung.minQuantity}+ units
              {active ? <span className={classes.now}>your price</span> : null}
            </td>
            <td className={classes.price} role="cell">
              {formatMoney(rung.price, currency)}
              <span className={classes.each}>/ea</span>
            </td>
            <td className={classes.off} role="cell">
              {off > 0 ? `−${off}%` : null}
            </td>
            {ordering ? <td className={classes.pad} colSpan={2} role="cell" /> : null}
          </tr>
        );
      })}
    </tbody>
  );
}
