import { useEffect, useState } from 'react';
import { productImageUrl } from '@/lib/media-url.ts';
import classes from '@/features/catalog/ProductImage.module.css';

export interface ProductImageProps {
  /** Pass `product.imageProductId` — callers render this component only when it is non-null, so an image-less product never fetches. */
  productId: number;
  variant?: 'web' | 'thumbnail';
  alt: string;
  className?: string;
  /** Skip lazy-loading for the one image above the fold. */
  eager?: boolean;
}

/**
 * A product photo in its well. Most catalogues have images for some products and
 * not others, so a miss is a normal state, not an error: the image removes itself
 * and the well keeps the grid's rhythm with the chassis' "nothing here" rule.
 */
export function ProductImage({ productId, variant = 'web', alt, className, eager = false }: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [productId, variant]);

  return (
    <span className={className ? `${classes.well} ${className}` : classes.well}>
      {failed ? (
        <span className={classes.rule} aria-hidden />
      ) : (
        <img
          className={classes.image}
          src={productImageUrl(productId, variant)}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
