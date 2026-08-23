import { Link, useLocation } from 'react-router';
import { useMediaQuery } from '@mantine/hooks';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore, selectCount, selectSubtotal } from '@/stores/cart.ts';
import { formatMoney } from '@/lib/format.ts';
import { checkoutTarget } from '@/features/cart/checkout-target.ts';
import { useServerCart } from '@/features/cart/useServerCart.ts';
import { ChevronIcon } from '@/components/icons.tsx';
import classes from '@/features/cart/MobileCartBar.module.css';

/** Mantine's `md` breakpoint — above it the cart is a drawer and needs no band. */
const DESKTOP = '(min-width: 62em)';

/**
 * Whether the running tab is on screen. The shells ask too: a fixed band covers
 * the foot of the page, so whatever is under it has to make room.
 *
 * It stands down for the wholesale sheet, which flies its own tab in the same
 * slot, and on the two routes that already show the cart — `/cart` and
 * `/checkout` — where a second way in would only be in the way.
 */
export function useMobileCartBar(): boolean {
  const { features } = useSettings();
  const count = useCartStore(selectCount);
  const { pathname } = useLocation();
  // Read synchronously: a deferred match flashes the band on a desktop first paint.
  const desktop = useMediaQuery(DESKTOP, false, { getInitialValueInEffect: false });

  return (
    features.ordering &&
    !features.wholesale &&
    !desktop &&
    count > 0 &&
    pathname !== '/cart' &&
    pathname !== '/checkout'
  );
}

/**
 * The running tab on a phone: what is on the order, and the way on. The figures
 * are the way back into the cart page; the button is the way out of it — two
 * jobs, two targets, both a thumb's width.
 */
export function MobileCartBar() {
  const { currency, features } = useSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const count = useCartStore(selectCount);
  const subtotal = useCartStore((s) => selectSubtotal(s.lines));
  const { issues } = useServerCart();
  const showing = useMobileCartBar();

  if (!showing) return null;

  const blocked = issues.some((i) => i.inactive);
  const items = `${count} ${count === 1 ? 'item' : 'items'}`;

  return (
    <div className={classes.bar}>
      <div className={classes.inner}>
        <Link
          to="/cart"
          className={classes.view}
          aria-label={`View cart — ${items}, ${formatMoney(subtotal, currency)}`}
        >
          <span className={classes.subtotal}>{formatMoney(subtotal, currency)}</span>
          <span className={classes.tally} aria-hidden>
            {items}
            <ChevronIcon size={11} />
          </span>
        </Link>

        {blocked ? (
          <button type="button" className={classes.checkout} disabled>
            Checkout
          </button>
        ) : (
          <Link to={checkoutTarget(loggedIn, features.guestCheckout)} className={classes.checkout}>
            Checkout
          </Link>
        )}
      </div>
    </div>
  );
}
