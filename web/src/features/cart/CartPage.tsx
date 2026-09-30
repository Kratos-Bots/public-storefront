import { useEffect, useMemo, type ReactNode } from 'react';
import { Button } from '@mantine/core';
import { Link } from 'react-router';
import { useCartStore, selectCount } from '@/stores/cart.ts';
import { EmptyState } from '@/components/EmptyState.tsx';
import { CartLine } from '@/features/cart/CartLine.tsx';
import { CartSummary } from '@/features/cart/CartSummary.tsx';
import { useServerCart } from '@/features/cart/useServerCart.ts';
import classes from '@/features/cart/CartPage.module.css';
import { useText } from '@/text/runtime.tsx';

/**
 * The cart as a page. A phone gets this rather than the drawer: the sheet would
 * cover the catalogue it was opened from and leave nowhere to go back to, and a
 * cart of ten lines wants the whole screen anyway. A desktop visitor to `/cart`
 * is handed to the drawer by the router.
 */
export interface CartPageProps {
  /** The page builder's CartContents block renders its `summary` slot here; omitted = v0.6.0's foot. */
  foot?: (ctx: { blocked: boolean; className: string }) => ReactNode;
}

export function CartPage({ foot }: CartPageProps) {
  const { t, tp } = useText();
  const lines = useCartStore((s) => s.lines);
  const count = useCartStore(selectCount);
  const { setQuantity, remove, issues, isSyncing, refresh } = useServerCart();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const issueByProduct = useMemo(() => new Map(issues.map((i) => [i.productId, i])), [issues]);
  const blocked = issues.some((i) => i.inactive || i.belowMin || i.aboveMax);

  if (lines.length === 0) {
    return (
      <EmptyState
        eyebrow={t('cart.page.eyebrow')}
        title={t('cart.empty.title')}
        description={t('cart.empty.description')}
        action={
          <Button component={Link} to="/" variant="default" size="sm">
            {t('common.actions.browseCatalogue')}
          </Button>
        }
      />
    );
  }

  return (
    <div className={classes.page}>
      <header className={classes.head}>
        <span className={classes.eyebrow}>{t('cart.page.eyebrow')}</span>
        <h1 className={classes.title}>{t('cart.page.title')}</h1>
        <p className={classes.sub}>
          {tp('cart.summary.items', count)}
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

      {foot ? (
        foot({ blocked, className: classes.foot })
      ) : (
        <div className={classes.foot}>
          <CartSummary blocked={blocked} />
        </div>
      )}
    </div>
  );
}
