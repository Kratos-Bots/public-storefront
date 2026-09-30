import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/app/settings.ts';
import { addToCart } from '@/features/cart/useServerCart.ts';
import { deriveStockStatus, formatMoney, resolveUnitPrice } from '@/lib/format.ts';
import { Slot } from '@/templates/runtime.tsx';
import { useText } from '@/text/runtime.tsx';
import type { Product } from '@/types/catalog.ts';
import classes from '@/features/catalog/AddToCart.module.css';

/** How long the button holds "Added" before offering another. */
export const ADDED_MS = 1600;

export interface AddToCartProps {
  product: Product;
  /** `sm` is the card's quick-add; `lg` is the product page's primary action. */
  size?: 'sm' | 'lg';
  /** Print the price in the label. Off on cards, where the price is already set beside it. */
  showPrice?: boolean;
}

/**
 * The one place a product enters the cart. Writes through `addToCart` rather
 * than the store, so a logged-in shopper's quick-add reaches `PUT /cart` (and
 * the admin's Live Carts) the same way a stepper edit in the drawer does.
 * Renders nothing when the client runs
 * browse-only, so a shop with `ordering: false` never shows a control that leads
 * nowhere. The label carries the state — no toast, no badge animation.
 */
export function AddToCart({ product, size = 'lg', showPrice = true }: AddToCartProps) {
  const { features, currency } = useSettings();
  const { t } = useText();
  const [phase, setPhase] = useState<'idle' | 'added' | 'again'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!features.ordering) return null;

  const status = deriveStockStatus(product.inStock, product.lowStockAlert);
  // A product with fewer units in stock than its own minimum can never actually
  // be bought, but the catalogue only ever reports `inStock` as a boolean — the
  // exact count is never sent to the public API — so this can only catch full
  // depletion, not a positive-but-insufficient stock level. See task-13-report.md.
  const outOfStock = !product.isPreorder && status === 'out';
  const disabled = !product.isActive || outOfStock;

  // A product with a minimum opens straight at it — never fewer than the floor
  // it would just be flagged for a moment later — so the first tap always adds
  // a compliant line rather than one the cart has to immediately correct.
  const quantity = Math.max(1, product.minOrderQuantity ?? 1);
  const totalPrice = resolveUnitPrice(product, quantity) * quantity;

  const verb = product.isPreorder ? t('common.product.preorder') : t('product.add.verb');
  const qty = quantity > 1 ? ` ${quantity}` : '';
  const price = showPrice ? ` · ${formatMoney(totalPrice, currency)}` : '';
  const label = !product.isActive
    ? t('product.add.unavailable')
    : outOfStock
      ? t('product.add.outOfStock')
      : phase === 'added'
        ? t('product.add.added')
        : phase === 'again'
          ? t('product.add.another')
          : `${verb}${qty}${price}`;

  const onClick = () => {
    addToCart(product, quantity);
    setPhase('added');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPhase('again'), ADDED_MS);
  };

  return (
    <button
      type="button"
      className={`${classes.button} ${size === 'sm' ? classes.sm : classes.lg} ${phase === 'added' ? classes.done : ''}`}
      disabled={disabled}
      onClick={onClick}
      aria-label={showPrice ? undefined : t('product.add.labelWithName', { label, name: product.displayName })}
      data-sf-part="button"
      data-variant="filled"
    >
      <span className={classes.label} aria-live="polite">
        {label}
      </span>
      {/* The detail page / menu sheet CTA (lg) is a main CTA; the card quick-add (sm) is not. */}
      <Slot name="ButtonAdornment" variant="primary" cta={size === 'lg'} />
    </button>
  );
}
