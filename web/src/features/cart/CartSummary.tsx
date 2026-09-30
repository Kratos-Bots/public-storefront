import { Link } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { useEffectiveLayout } from '@/app/layout.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore, selectCount, selectHasMixedPreorder, selectSubtotal } from '@/stores/cart.ts';
import { formatMoney } from '@/lib/format.ts';
import { checkoutTarget } from '@/features/cart/checkout-target.ts';
import { Slot } from '@/templates/runtime.tsx';
import classes from '@/features/cart/CartSummary.module.css';
import { useText } from '@/text/runtime.tsx';

export interface CartSummaryProps {
  /** A line the server has withdrawn, or one violating its order-quantity limit, is
   *  still on the order — checkout is held until it's removed or fixed. */
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
  const { t, tp } = useText();
  const { currency, features } = useSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const count = useCartStore(selectCount);
  const subtotal = useCartStore((s) => selectSubtotal(s.lines));
  const mixedPreorder = useCartStore(selectHasMixedPreorder);
  // The web app's primary action is the checkout button there — a second one
  // in the summary would be the same action twice, one thumb-width apart.
  const primaryElsewhere = useEffectiveLayout() === 'webapp';

  return (
    <div className={classes.summary}>
      {mixedPreorder ? (
        <p className={classes.notice}>
          {t('cart.summary.mixedNotice')}
        </p>
      ) : null}

      <div className={classes.ledger}>
        <span className={classes.label}>
          {t('common.totals.subtotal')}
          <span className={classes.units}>
            {tp('cart.summary.items', count)}
          </span>
        </span>
        <span className={classes.figure}>{formatMoney(subtotal, currency)}</span>
      </div>

      <p className={classes.terms}>{t('cart.summary.terms')}</p>

      {primaryElsewhere ? (
        blocked ? <p className={classes.held}>{t('cart.summary.held')}</p> : null
      ) : blocked ? (
        <>
          <button
            type="button"
            className={classes.checkout}
            disabled
            data-sf-part="button"
            data-variant="filled"
            data-sf-cta="main"
          >
            {t('cart.summary.checkout')}
            <Slot name="ButtonAdornment" variant="primary" cta />
          </button>
          <p className={classes.held}>{t('cart.summary.held')}</p>
        </>
      ) : (
        <Link
          to={checkoutTarget(loggedIn, features.guestCheckout)}
          className={classes.checkout}
          onClick={onNavigate}
          data-sf-part="button"
          data-variant="filled"
          data-sf-cta="main"
        >
          {t('cart.summary.checkout')}
          <Slot name="ButtonAdornment" variant="primary" cta />
        </Link>
      )}

      <Link to="/" className={classes.keep} onClick={onNavigate}>
        {t('cart.summary.keepShopping')}
      </Link>
    </div>
  );
}
