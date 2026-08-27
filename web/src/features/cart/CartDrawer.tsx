import { useEffect, useMemo } from 'react';
import { Button } from '@mantine/core';
import { Link } from 'react-router';
import { useUiStore } from '@/stores/ui.ts';
import { useCartStore, selectCount } from '@/stores/cart.ts';
import { Sheet } from '@/components/Sheet.tsx';
import { EmptyState } from '@/components/EmptyState.tsx';
import { CloseIcon } from '@/components/icons.tsx';
import { CartLine } from '@/features/cart/CartLine.tsx';
import { CartSummary } from '@/features/cart/CartSummary.tsx';
import { useServerCart } from '@/features/cart/useServerCart.ts';
import classes from '@/features/cart/CartDrawer.module.css';

/**
 * The cart as a panel: it slides in from the right on a desktop and rises as a
 * bottom sheet on a phone, in the same chassis the product and filter sheets
 * use. Opening it in server mode pulls the customer's cart first — they may
 * have added to it from the bot since this tab was last awake.
 */
export function CartDrawer() {
  const opened = useUiStore((s) => s.cartOpen);
  const close = useUiStore((s) => s.close);
  const lines = useCartStore((s) => s.lines);
  const count = useCartStore(selectCount);
  const { setQuantity, remove, issues, isSyncing, refresh } = useServerCart();

  const dismiss = () => close('cartOpen');

  useEffect(() => {
    if (opened) void refresh();
  }, [opened, refresh]);

  const issueByProduct = useMemo(
    () => new Map(issues.map((i) => [i.productId, i])),
    [issues],
  );
  const blocked = issues.some((i) => i.inactive);

  return (
    <Sheet
      opened={opened}
      onClose={dismiss}
      label="Your cart"
      header={
        <div className={classes.head}>
          <div>
            <h2 className={classes.title}>Your cart</h2>
            <p className={classes.sub}>
              {count} {count === 1 ? 'item' : 'items'}
              {isSyncing ? <span className={classes.pulse} aria-hidden /> : null}
            </p>
          </div>
          <button type="button" className={classes.close} onClick={dismiss} aria-label="Close">
            <CloseIcon size={16} />
          </button>
        </div>
      }
      footer={lines.length > 0 ? <CartSummary blocked={blocked} onNavigate={dismiss} /> : undefined}
    >
      {lines.length === 0 ? (
        <EmptyState
          eyebrow="Cart"
          title="Nothing on the order yet"
          description="Everything you add shows up here, with the price at the quantity you're buying."
          action={
            <Button component={Link} to="/" variant="default" size="sm" onClick={dismiss}>
              Browse the catalogue
            </Button>
          }
        />
      ) : (
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
      )}
    </Sheet>
  );
}
