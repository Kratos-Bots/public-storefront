import { useEffect, useContext, useMemo, type ReactNode } from 'react';
import { useCartStore, selectCount } from '@/stores/cart.ts';
import { CartDataContext, CartFamily, type CartData } from '@/builder/family-cart.ts';
import { defaultSlotRenders } from '@/builder/render.tsx';
import type { SlotRender } from '@/builder/define.ts';
import { CartHostContext } from '@/features/cart/cart-host.ts';
import { CART_DRAWER_VIEWS, CART_PAGE_VIEWS } from '@/features/cart/cart-parts.tsx';
import { cartViews } from '@/builder/blocks/_shared/cart-views.ts';
import { useServerCart } from '@/features/cart/useServerCart.ts';
import classes from '@/features/cart/CartPage.module.css';

/**
 * The cart — the CartContents container. A phone gets this as a page rather than the drawer: the
 * sheet would cover the catalogue it was opened from and leave nowhere to go back to, and a cart
 * of ten lines wants the whole screen anyway. A desktop visitor to /cart is handed to the drawer
 * by the router, which renders the same container inside a CartHostContext (stage 4 spec §7.3).
 */
export interface CartPageProps {
  /** Legacy (v0.6.0) callers: replaces the summary slot's foot. */
  foot?: (ctx: { blocked: boolean; className: string }) => ReactNode;
  /** The CartContents block's slots; omitted = the default arrangement (tests, v0.7.0 call sites). */
  slots?: { head: SlotRender; main: SlotRender; summary: SlotRender };
}

export function CartPage({ foot, slots }: CartPageProps) {
  const host = useContext(CartHostContext);
  const lines = useCartStore((s) => s.lines);
  const count = useCartStore(selectCount);
  const { setQuantity, remove, issues, isSyncing, refresh } = useServerCart();

  // The page pulls the customer's cart when it mounts; the drawer does so when it opens.
  useEffect(() => {
    if (!host) void refresh();
  }, [host, refresh]);

  const legacy = useMemo(
    () => (slots ? null : (defaultSlotRenders('CartContents', 'storefront', {}, 'cart') as unknown as NonNullable<CartPageProps['slots']>)),
    [slots],
  );
  const s = slots ?? legacy!;

  const issueByProduct = useMemo(() => new Map(issues.map((i) => [i.productId, i])), [issues]);
  const blocked = issues.some((i) => i.inactive || i.belowMin || i.aboveMax);
  const surface = host ? 'drawer' : 'page';
  const dismiss = host?.dismiss;
  const data = useMemo<CartData>(
    () => ({ surface, lines, count, isSyncing, issueByProduct, blocked, setQuantity, remove, ...(dismiss ? { dismiss } : {}) }),
    [surface, lines, count, isSyncing, issueByProduct, blocked, setQuantity, remove, dismiss],
  );
  const value = useMemo(() => ({ data, views: host ? CART_DRAWER_VIEWS : CART_PAGE_VIEWS }), [data, host]);

  const empty = lines.length === 0;
  // The summary slot, or v0.6.0's foot for a legacy caller; never a wrapper for an empty cart.
  const summary = (className?: string): ReactNode => {
    if (foot) return foot({ blocked, className: className ?? '' });
    return className === undefined ? s.summary() : s.summary({ className });
  };

  let body: ReactNode;
  if (host) {
    // The drawer's own header carries the title and count, so head is page-only; an empty
    // summary slot (or an empty cart) leaves no footer.
    const showsSummary = !empty && (foot ? true : s.summary.items.length > 0);
    body = host.frame({ body: s.main(), footer: showsSummary ? summary() : undefined });
  } else if (empty) {
    body = <>{s.head()}{s.main()}{summary()}</>;
  } else {
    body = <div className={classes.page}>{s.head()}{s.main()}{summary(classes.foot)}</div>;
  }
  return (
    <CartDataContext.Provider value={data}>
      <CartFamily.Provider value={value}>{body}</CartFamily.Provider>
    </CartDataContext.Provider>
  );
}

cartViews.page = CartPage;
