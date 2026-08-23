import { Link } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useCartStore, selectCount, selectSubtotal } from '@/stores/cart.ts';
import { formatMoney } from '@/lib/format.ts';
import { ChevronIcon } from '@/components/icons.tsx';
import classes from '@/features/wholesale/WholesaleBar.module.css';

/**
 * The running tab. Sits at the foot of the sheet from the first line on, because
 * a wholesale order is built by scrolling one long list — the buyer should never
 * have to leave it to find out what they are up to.
 *
 * `/cart` is the app's own way in: on a desktop that route hands off to the cart
 * drawer, on a phone it is the cart page.
 */
export function WholesaleBar() {
  const { currency } = useSettings();
  const lines = useCartStore((s) => s.lines.length);
  const units = useCartStore(selectCount);
  const subtotal = useCartStore((s) => selectSubtotal(s.lines));

  if (lines === 0) return null;

  return (
    <div className={classes.bar}>
      <Link
        to="/cart"
        className={classes.action}
        aria-label={`View basket — ${lines} ${lines === 1 ? 'line' : 'lines'}, ${units} ${units === 1 ? 'unit' : 'units'}, ${formatMoney(subtotal, currency)}`}
      >
        <span className={classes.figures}>
          <span className={classes.subtotal}>{formatMoney(subtotal, currency)}</span>
          <span className={classes.tally} aria-hidden>
            {lines} {lines === 1 ? 'line' : 'lines'} · {units} {units === 1 ? 'unit' : 'units'}
          </span>
        </span>
        <span className={classes.cta} aria-hidden>
          View basket
          <ChevronIcon size={12} />
        </span>
      </Link>
    </div>
  );
}
