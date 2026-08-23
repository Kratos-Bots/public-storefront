import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/app/settings.ts';
import { useCartStore } from '@/stores/cart.ts';
import { deriveStockStatus, formatMoney } from '@/lib/format.ts';
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
 * The one place a product enters the cart. Renders nothing when the client runs
 * browse-only, so a shop with `ordering: false` never shows a control that leads
 * nowhere. The label carries the state — no toast, no badge animation.
 */
export function AddToCart({ product, size = 'lg', showPrice = true }: AddToCartProps) {
  const { features, currency } = useSettings();
  const add = useCartStore((s) => s.add);
  const [phase, setPhase] = useState<'idle' | 'added' | 'again'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!features.ordering) return null;

  const status = deriveStockStatus(product.inStock, product.lowStockAlert);
  const outOfStock = !product.isPreorder && status === 'out';
  const disabled = !product.isActive || outOfStock;

  const verb = product.isPreorder ? 'Pre-order' : 'Add';
  const price = showPrice ? ` · ${formatMoney(product.price, currency)}` : '';
  const label = !product.isActive
    ? 'Unavailable'
    : outOfStock
      ? 'Out of stock'
      : phase === 'added'
        ? 'Added'
        : phase === 'again'
          ? 'Add another'
          : `${verb}${price}`;

  const onClick = () => {
    add(product, 1);
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
      aria-label={showPrice ? undefined : `${label} — ${product.displayName}`}
    >
      <span className={classes.label} aria-live="polite">
        {label}
      </span>
    </button>
  );
}
