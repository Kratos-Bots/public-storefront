import { Link } from 'react-router';
import { useSettings } from '@/app/settings.ts';
import { deriveStockStatus, formatMoney } from '@/lib/format.ts';
import { ProductImage } from '@/features/catalog/ProductImage.tsx';
import { StockChip } from '@/features/catalog/StockChip.tsx';
import { AddToCart } from '@/features/catalog/AddToCart.tsx';
import { rowAnim } from '@/lib/motion.ts';
import type { Product } from '@/types/catalog.ts';
import classes from '@/features/catalog/ProductCard.module.css';
import imageClasses from '@/features/catalog/ProductImage.module.css';

export interface ProductCardProps {
  product: Product;
  /** The first row of the grid loads its images straight away. */
  eager?: boolean;
  /** False when nothing in the visible set has a photo: the well is dropped entirely. */
  hasSiblingImages?: boolean;
  /** Position in the grid, for the entrance stagger. */
  index?: number;
}

/**
 * One product in the grid. The whole tile opens the product page — the name link
 * stretches over the card — and the quick-add sits above it so a tap on the
 * button never navigates.
 */
export function ProductCard({ product, eager = false, hasSiblingImages = true, index = 0 }: ProductCardProps) {
  const { currency } = useSettings();
  const status = deriveStockStatus(product.inStock, product.lowStockAlert);
  const best = product.pricingTiers.reduce<Product['pricingTiers'][number] | null>(
    (lowest, tier) => (!lowest || tier.price < lowest.price ? tier : lowest),
    null,
  );
  const anim = rowAnim(index);
  const hasImage = product.imageProductId !== null;

  return (
    <article className={`${classes.card} ${anim.className}`} style={anim.style}>
      {hasImage ? (
        <ProductImage
          productId={product.imageProductId!}
          variant="thumbnail"
          alt={product.displayName}
          eager={eager}
          className={classes.media}
        />
      ) : hasSiblingImages ? (
        <span className={`${imageClasses.well} ${classes.media}`} aria-hidden>
          <span className={imageClasses.rule} />
        </span>
      ) : null}

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
