import { useContext, useMemo } from 'react';
import { useSettings } from '@/app/settings.ts';
import { useEffectiveLayout } from '@/app/layout.ts';
import { useSessionStore, selectIsLoggedIn } from '@/stores/session.ts';
import { useCartStore, selectCount, selectHasMixedPreorder, selectSubtotal } from '@/stores/cart.ts';
import { CartSummaryFamily, useCartFamilyOptional, type CartSummaryData } from '@/builder/family-cart.ts';
import { defaultSlotRenders } from '@/builder/render.tsx';
import type { SlotRender, StyleAttrs } from '@/builder/define.ts';
import { checkoutTarget } from '@/features/cart/checkout-target.ts';
import { CartHostContext } from '@/features/cart/cart-host.ts';
import { CART_SUMMARY_VIEWS } from '@/features/cart/cart-summary-parts.tsx';
import { cartViews } from '@/builder/blocks/_shared/cart-views.ts';
import { useServerCart } from '@/features/cart/useServerCart.ts';
import classes from '@/features/cart/CartSummary.module.css';

export interface CartSummaryProps {
  /** A line the server has withdrawn, or one violating its order-quantity limit, is
   *  still on the order — checkout is held until it's removed or fixed. Omitted: read from the cart. */
  blocked?: boolean;
  /** Called when a link inside the summary is followed, so the drawer can stand down. */
  onNavigate?: () => void;
  /** The CartSummary block's items slot; omitted = v0.7.0's arrangement. */
  slots?: { items: SlotRender };
  /** The block's style attributes, spread on the root. */
  styleAttrs?: StyleAttrs;
}

/**
 * The docket foot — the CartSummary container. Micro-caps label left, tabular figure right, one
 * heavy rule above the subtotal — the same ledger the wholesale tab and the mobile bar are set in,
 * so the cart reads as one instrument at three sizes. Its pieces are parts (cart-summary-parts).
 *
 * Nothing here is a total: shipping and discounts are the quote's business, and
 * saying so plainly is cheaper than a shopper discovering it at the payment step.
 *
 * Inside a CartContents it takes `blocked` and `dismiss` from the cart family and draws nothing for
 * an empty cart; on its own (v0.7.0 allowed that) it reads them from the cart store and the host.
 */
export function CartSummary({ blocked: blockedProp, onNavigate, slots, styleAttrs }: CartSummaryProps) {
  const cart = useCartFamilyOptional();
  const host = useContext(CartHostContext);
  const { issues } = useServerCart();
  const { currency, features } = useSettings();
  const loggedIn = useSessionStore(selectIsLoggedIn);
  const count = useCartStore(selectCount);
  const subtotal = useCartStore((s) => selectSubtotal(s.lines));
  const mixedPreorder = useCartStore(selectHasMixedPreorder);
  // The web app's primary action is the checkout button there — a second one
  // in the summary would be the same action twice, one thumb-width apart.
  const primaryElsewhere = useEffectiveLayout() === 'webapp';
  const given = slots?.items;
  const items = useMemo(() => given ?? defaultSlotRenders('CartSummary', 'storefront', {}, 'cart').items!, [given]);

  const blocked = blockedProp ?? cart?.blocked ?? issues.some((i) => i.inactive || i.belowMin || i.aboveMax);
  const navigate = onNavigate ?? cart?.dismiss ?? host?.dismiss;
  const checkoutTo = checkoutTarget(loggedIn, features.guestCheckout);
  const value = useMemo(() => {
    const data: CartSummaryData = { blocked, count, subtotal, currency, mixedPreorder, primaryElsewhere, checkoutTo, ...(navigate ? { onNavigate: navigate } : {}) };
    return { data, views: CART_SUMMARY_VIEWS };
  }, [blocked, count, subtotal, currency, mixedPreorder, primaryElsewhere, checkoutTo, navigate]);

  // Today neither the page foot nor the drawer footer exists for an empty cart.
  if (cart && cart.lines.length === 0) return null;
  return (
    <CartSummaryFamily.Provider value={value}>
      <div className={classes.summary} {...styleAttrs}>{items()}</div>
    </CartSummaryFamily.Provider>
  );
}

cartViews.summary = CartSummary;
