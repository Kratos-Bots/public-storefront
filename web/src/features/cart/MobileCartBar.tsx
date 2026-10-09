import { Link, useLocation } from 'react-router';
import { useMediaQuery } from '@mantine/hooks';
import { useSettings } from '@/app/settings.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore, selectCount, selectSubtotal } from '@/stores/cart.ts';
import { formatMoney } from '@/lib/format.ts';
import { haptic } from '@/lib/telegram-webapp.ts';
import { basketPromotions } from '@/lib/promotions.ts';
import { checkoutTarget } from '@/features/cart/checkout-target.ts';
import { useServerCart } from '@/features/cart/useServerCart.ts';
import { ChevronIcon } from '@/components/icons.tsx';
import { Slot } from '@/templates/runtime.tsx';
import classes from '@/features/cart/MobileCartBar.module.css';
import { useText } from '@/text/runtime.tsx';

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
  const showing = useMobileCartBar();
  return showing ? <CartBar /> : null;
}

/**
 * Where the band sits: `page` clears the browser's own home-indicator inset; `webapp` is the Mini App's browser
 * stand-in (that inset plus Telegram's); `telegram` is inside Telegram, where only `--tg-safe-bottom` counts —
 * the browser's inset would count the notch twice.
 */
export type CartBarInset = 'page' | 'webapp' | 'telegram';

/**
 * The band itself, with no opinion on when it shows: the mobile storefront gates it on the viewport and the route
 * (`MobileCartBar`), the Mini App on its primary-action rules (`WebAppCartBar`). One body, so the checkout
 * target, the blocking rule and the promotion strike-through cannot drift apart between them.
 */
export function CartBar({ inset = 'page' }: { inset?: CartBarInset }) {
  const { t, tp } = useText();
  const { currency, features } = useSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const count = useCartStore(selectCount);
  const subtotal = useCartStore((s) => selectSubtotal(s.lines));
  const { issues, server } = useServerCart();

  const blocked = issues.some((i) => i.inactive || i.belowMin || i.aboveMax);
  const items = tp('cart.summary.items', count);
  // With promotions applied the bar leads with the basket after them and keeps the subtotal struck
  // beside it; the server's figures only count while they still match the lines on screen.
  const promo = basketPromotions(server);
  const applied = promo !== null && promo.discount > 0;
  const shown = applied ? promo.total : subtotal;
  // Telegram's own buttons tick when pressed; the in-page band stands in for them there.
  const tap = inset === 'telegram' ? () => haptic.impact('light') : undefined;

  return (
    <div className={inset === 'page' ? classes.bar : `${classes.bar} ${classes[inset]}`} data-sf-part="cart-bar">
      <div className={classes.inner}>
        <Link
          to="/cart"
          className={classes.view}
          onClick={tap}
          aria-label={t('cart.bar.viewCartLabel', { items, subtotal: formatMoney(shown, currency) })}
        >
          <span className={classes.subtotal}>
            {applied ? <s className={classes.was}>{formatMoney(subtotal, currency)}</s> : null}
            {formatMoney(shown, currency)}
          </span>
          <span className={classes.tally} aria-hidden>
            {items}
            <ChevronIcon size={11} />
          </span>
        </Link>

        {blocked ? (
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
        ) : (
          <Link
            to={checkoutTarget(loggedIn, features.guestCheckout)}
            onClick={tap}
            className={classes.checkout}
            data-sf-part="button"
            data-variant="filled"
            data-sf-cta="main"
          >
            {t('cart.summary.checkout')}
            <Slot name="ButtonAdornment" variant="primary" cta />
          </Link>
        )}
      </div>
    </div>
  );
}
