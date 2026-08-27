import { useSettings } from '@/app/settings.ts';
import { useCartStore } from '@/stores/cart.ts';
import { deriveStockStatus, formatMoney } from '@/lib/format.ts';
import { StockChip } from '@/features/catalog/StockChip.tsx';
import { MinusIcon, PlusIcon } from '@/components/icons.tsx';
import { rowAnim } from '@/lib/motion.ts';
import type { Product } from '@/types/catalog.ts';
import classes from '@/features/catalog/ProductRow.module.css';

export interface ProductRowProps {
  product: Product;
  /** Opens the detail sheet. The whole row is the target; the gutter sits above it. */
  onSelect: (product: Product) => void;
  /** Position in the list, for the entrance stagger. Omit when a wrapping
   *  element (e.g. `ProductGrid`'s `<li>`) already animates — see `ProductList`
   *  vs. `ProductGrid` for the two call shapes. */
  index?: number;
}

/**
 * One line of the manifest: name and code on the left, price in tabular mono, and
 * an action gutter of fixed width on the right. The gutter is the point — a `+`
 * and the quantity stepper occupy exactly the same slot, so the column of prices
 * holds its edge whether the cart is empty or full.
 */
export function ProductRow({ product, onSelect, index }: ProductRowProps) {
  const { currency, features } = useSettings();
  const quantity = useCartStore((s) => s.lines.find((l) => l.productId === product.id)?.quantity ?? 0);
  const add = useCartStore((s) => s.add);
  const setQuantity = useCartStore((s) => s.setQuantity);

  const status = deriveStockStatus(product.inStock, product.lowStockAlert);
  const unavailable = !product.isActive || (!product.isPreorder && status === 'out');
  const best = product.pricingTiers.reduce<Product['pricingTiers'][number] | null>(
    (lowest, tier) => (!lowest || tier.price < lowest.price ? tier : lowest),
    null,
  );

  return (
    <div
      className={index === undefined ? classes.row : `${classes.row} ${rowAnim(index).className}`}
      style={index === undefined ? undefined : rowAnim(index).style}
    >
      <div className={classes.text}>
        <h3 className={classes.name}>
          <button type="button" className={classes.open} onClick={() => onSelect(product)}>
            {product.displayName}
          </button>
        </h3>
        <p className={classes.meta}>
          <span className={classes.sku}>{product.sku}</span>
          {best ? (
            <span className={classes.tier}>
              {best.minQuantity}+ {formatMoney(best.price, currency)}
            </span>
          ) : null}
          {product.isPreorder ? <span className={classes.preorder}>Pre-order</span> : null}
          {status !== 'in' ? <StockChip status={status} /> : null}
        </p>
      </div>

      <p className={classes.price}>{formatMoney(product.price, currency)}</p>

      {features.ordering ? (
        <div className={classes.gutter}>
          {quantity > 0 ? (
            <>
              <button
                type="button"
                className={classes.step}
                onClick={() => setQuantity(product.id, quantity - 1)}
                aria-label={`One fewer ${product.displayName}`}
              >
                <MinusIcon size={15} />
              </button>
              <span className={classes.quantity} aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                className={classes.step}
                onClick={() => setQuantity(product.id, quantity + 1)}
                aria-label={`One more ${product.displayName}`}
              >
                <PlusIcon size={15} />
              </button>
            </>
          ) : (
            <button
              type="button"
              className={classes.quickAdd}
              disabled={unavailable}
              onClick={() => add(product, 1)}
              aria-label={
                !product.isActive
                  ? `Unavailable — ${product.displayName}`
                  : unavailable
                    ? `Out of stock — ${product.displayName}`
                    : `${product.isPreorder ? 'Pre-order' : 'Add'} ${product.displayName}`
              }
            >
              <PlusIcon size={16} />
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
