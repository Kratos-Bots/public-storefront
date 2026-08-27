import { useEffect, useMemo } from 'react';
import { Button } from '@mantine/core';
import { Link } from 'react-router';
import { useCartStore, selectCount } from '@/stores/cart.ts';
import { EmptyState } from '@/components/EmptyState.tsx';
import { CartLine } from '@/features/cart/CartLine.tsx';
import { CartSummary } from '@/features/cart/CartSummary.tsx';
import { useServerCart } from '@/features/cart/useServerCart.ts';
import classes from '@/features/cart/CartPage.module.css';

/**
 * The cart as a page. A phone gets this rather than the drawer: the sheet would
 * cover the catalogue it was opened from and leave nowhere to go back to, and a
 * cart of ten lines wants the whole screen anyway. A desktop visitor to `/cart`
 * is handed to the drawer by the router.
 */
export function CartPage() {
  const lines = useCartStore((s) => s.lines);
  const count = useCartStore(selectCount);
  const { setQuantity, remove, issues, isSyncing, refresh } = useServerCart();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const issueByProduct = useMemo(() => new Map(issues.map((i) => [i.productId, i])), [issues]);
  const blocked = issues.some((i) => i.inactive);

  if (lines.length === 0) {
    return (
      <EmptyState
        eyebrow="Cart"
        title="Nothing on the order yet"
        description="Everything you add shows up here, with the price at the quantity you're buying."
        action={
          <Button component={Link} to="/" variant="default" size="sm">
            Browse the catalogue
          </Button>
        }
      />
    );
  }

  return (
    <div className={classes.page}>
      <header className={classes.head}>
        <span className={classes.eyebrow}>Cart</span>
        <h1 className={classes.title}>Your cart</h1>
        <p className={classes.sub}>
          {count} {count === 1 ? 'item' : 'items'}
          {isSyncing ? <span className={classes.pulse} aria-hidden /> : null}
        </p>
      </header>

      <ul className={classes.lines}>
        {lines.map((line, i) => (
          <CartLine
            key={line.productId}
            line={line}
            issue={issueByProduct.get(line.productId)}
            onQuantity={setQuantity}
            onRemove={remove}
            index={i}
          />
        ))}
      </ul>

      <div className={classes.foot}>
        <CartSummary blocked={blocked} />
      </div>
    </div>
  );
}
