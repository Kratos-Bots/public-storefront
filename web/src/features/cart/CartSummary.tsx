import { Link } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore, selectCount, selectHasMixedPreorder, selectSubtotal } from '@/stores/cart.ts';
import { formatMoney } from '@/lib/format.ts';
import { checkoutTarget } from '@/features/cart/checkout-target.ts';
import classes from '@/features/cart/CartSummary.module.css';

export interface CartSummaryProps {
  /** A line the server has withdrawn is still on the order — checkout is held until it goes. */
  blocked: boolean;
  /** Called when a link inside the summary is followed, so the drawer can stand down. */
  onNavigate?: () => void;
}

/**
 * The docket foot. Micro-caps label left, tabular figure right, one heavy rule
 * above the subtotal — the same ledger the wholesale tab and the mobile bar are
 * set in, so the cart reads as one instrument at three sizes.
 *
 * Nothing here is a total: shipping and discounts are the quote's business, and
 * saying so plainly is cheaper than a shopper discovering it at the payment step.
 */
export function CartSummary({ blocked, onNavigate }: CartSummaryProps) {
  const { currency, features } = useSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const count = useCartStore(selectCount);
  const subtotal = useCartStore((s) => selectSubtotal(s.lines));
  const mixedPreorder = useCartStore(selectHasMixedPreorder);

  return (
    <div className={classes.summary}>
      {mixedPreorder ? (
        <p className={classes.notice}>
          This order mixes in-stock and pre-order items — pre-orders dispatch when they land.
        </p>
      ) : null}

      <div className={classes.ledger}>
        <span className={classes.label}>
          Subtotal
          <span className={classes.units}>
            {count} {count === 1 ? 'item' : 'items'}
          </span>
        </span>
        <span className={classes.figure}>{formatMoney(subtotal, currency)}</span>
      </div>

      <p className={classes.terms}>Shipping and discounts are calculated at checkout.</p>

      {blocked ? (
        <>
          <button type="button" className={classes.checkout} disabled>
            Checkout
          </button>
          <p className={classes.held}>Remove the unavailable items to continue.</p>
        </>
      ) : (
        <Link
          to={checkoutTarget(loggedIn, features.guestCheckout)}
          className={classes.checkout}
          onClick={onNavigate}
        >
          Checkout
        </Link>
      )}

      <Link to="/" className={classes.keep} onClick={onNavigate}>
        Continue shopping
      </Link>
    </div>
  );
}
