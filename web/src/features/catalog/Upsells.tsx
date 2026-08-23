import { useMemo } from 'react';
import { useSettings } from '@/app/settings.ts';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { upsellsFor } from '@/features/catalog/filter.ts';
import { ProductCard } from '@/features/catalog/ProductCard.tsx';
import type { Product } from '@/types/catalog.ts';
import classes from '@/features/catalog/Upsells.module.css';

/** The most a product page will suggest — past four it stops being a suggestion. */
const MAX_UPSELLS = 4;

/**
 * What the client has curated as going with this product. Silent when the feature
 * is off, when nothing is curated, or when the curated ids are no longer in the
 * catalogue — an empty "you may also like" rail is worse than none.
 */
export function Upsells({ product }: { product: Product }) {
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
      <div className={classes.row}>
        {items.map((item) => (
          <ProductCard key={item.id} product={item} />
        ))}
      </div>
    </section>
  );
}
