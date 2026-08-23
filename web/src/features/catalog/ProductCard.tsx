import { Link } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { deriveStockStatus, formatMoney } from '@/lib/format.ts';
import { ProductImage } from '@/features/catalog/ProductImage.tsx';
import { StockChip } from '@/features/catalog/StockChip.tsx';
import { AddToCart } from '@/features/catalog/AddToCart.tsx';
import type { Product } from '@/types/catalog.ts';
import classes from '@/features/catalog/ProductCard.module.css';

export interface ProductCardProps {
  product: Product;
  /** The first row of the grid loads its images straight away. */
  eager?: boolean;
}

/**
 * One product in the grid. The whole tile opens the product page — the name link
 * stretches over the card — and the quick-add sits above it so a tap on the
 * button never navigates.
 */
export function ProductCard({ product, eager = false }: ProductCardProps) {
  const { currency } = useSettings();
  const status = deriveStockStatus(product.inStock, product.lowStockAlert);
  const best = product.pricingTiers.reduce<Product['pricingTiers'][number] | null>(
    (lowest, tier) => (!lowest || tier.price < lowest.price ? tier : lowest),
    null,
  );

  return (
    <article className={classes.card}>
      <ProductImage
        productId={product.imageProductId ?? product.id}
        variant="thumbnail"
        alt={product.displayName}
        eager={eager}
        className={classes.media}
      />

      <div className={classes.body}>
        <h3 className={classes.name}>
          <Link to={`/p/${product.id}`} className={classes.link}>
            {product.displayName}
          </Link>
        </h3>

        {product.isPreorder || status !== 'in' ? (
          <div className={classes.flags}>
            {product.isPreorder ? <span className={classes.preorder}>Pre-order</span> : null}
            {status !== 'in' ? <StockChip status={status} /> : null}
          </div>
        ) : null}

        <div className={classes.foot}>
          <p className={classes.prices}>
            <span className={classes.price}>{formatMoney(product.price, currency)}</span>
            {best ? (
              <span className={classes.tier}>
                {best.minQuantity}+ {formatMoney(best.price, currency)}
              </span>
            ) : null}
          </p>
          <div className={classes.add}>
            <AddToCart product={product} size="sm" showPrice={false} />
          </div>
        </div>
      </div>
    </article>
  );
}
