import { useMemo } from 'react';
import { useSettings } from '@/app/settings.ts';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { upsellsFor } from '@/features/catalog/filter.ts';
import { ProductCard } from '@/features/catalog/ProductCard.tsx';
import { ProductRow } from '@/features/catalog/ProductRow.tsx';
import { rowAnim } from '@/lib/motion.ts';
import type { Product } from '@/types/catalog.ts';
import classes from '@/features/catalog/Upsells.module.css';

/** The most a product page will suggest — past four it stops being a suggestion. */
const MAX_UPSELLS = 4;

export interface UpsellsProps {
  product: Product;
  /**
   * Pass a handler to get dense rows that swap the sheet's product in place
   * instead of cards that navigate away. The menu layout's detail sheet does.
   */
  onSelect?: (product: Product) => void;
}

/**
 * What the client has curated as going with this product. Silent when the feature
 * is off, when nothing is curated, or when the curated ids are no longer in the
 * catalogue — an empty "you may also like" rail is worse than none.
 */
export function Upsells({ product, onSelect }: UpsellsProps) {
  const { features } = useSettings();
  const catalog = useCatalog();
  const items = useMemo(
    () => upsellsFor(product, catalog.data).slice(0, MAX_UPSELLS),
    [product, catalog.data],
  );

  if (!features.upsell || items.length === 0) return null;

  return (
    <section className={classes.root} aria-labelledby="upsells-heading">
      <h2 id="upsells-heading" className={classes.head}>
        Often bought with this
      </h2>
      {onSelect ? (
        <ul className={classes.rows}>
          {items.map((item, i) => (
            <li key={item.id} {...rowAnim(i)}>
              <ProductRow product={item} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      ) : (
        <div className={classes.row}>
          {items.map((item, i) => (
            <ProductCard
              key={item.id}
              product={item}
              index={i}
              hasSiblingImages={items.some((p) => p.imageProductId !== null)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
