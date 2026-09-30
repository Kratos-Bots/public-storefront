import { lazy, useMemo } from 'react';
import { z } from 'zod';
import { defineBlock } from '@/builder/define.ts';
import { useBuilderMode } from '@/builder/mode.ts';
import { useCatalog } from '@/features/catalog/use-catalog.ts';
import { useText } from '@/text/runtime.tsx';
import { PageSkeleton } from '@/components/PageSkeleton.tsx';
import { pickFeatured, type FeaturedQuery } from '@/builder/blocks/_shared/featured.ts';
import classes from '@/builder/blocks/FeaturedProducts.module.css';

const ProductCard = lazy(() => import('@/features/catalog/ProductCard.tsx').then((m) => ({ default: m.ProductCard })));

type Props = { id: string; title: string } & FeaturedQuery;

function FeaturedView({ title, ...query }: Omit<Props, 'id'>) {
  const catalog = useCatalog();
  const { editing } = useBuilderMode();
  const { t } = useText();
  const picked = useMemo(
    () => (catalog.data ? pickFeatured(catalog.data.products, catalog.data.categories, query) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the query is plain data; serialise it
    [catalog.data, JSON.stringify(query)],
  );
  if (catalog.isPending) return <PageSkeleton inline />;
  if (picked.length === 0) {
    return editing ? <p className={classes.hint} data-sf-block="FeaturedProducts">Pick products, or a category with products in it.</p> : null;
  }
  const siblingImages = picked.some((p) => p.imageProductId !== null);
  return (
    <section className={classes.root} data-sf-block="FeaturedProducts" aria-label={title || t('catalog.featured.ariaLabel')}>
      {title ? <h2 className={classes.title}>{title}</h2> : null}
      <div className={classes.grid}>
        {picked.map((product, i) => (
          <ProductCard key={product.id} product={product} index={i} hasSiblingImages={siblingImages} />
        ))}
      </div>
    </section>
  );
}

export const block = defineBlock<Props>({
  name: 'FeaturedProducts', label: 'Featured products', category: 'catalogue', layouts: 'all', routeBound: false, slots: [],
  schema: z.object({
    title: z.string().max(120),
    source: z.enum(['picked', 'category']),
    items: z.array(z.object({ productId: z.number().int().positive() })).max(24),
    categoryId: z.number().int().positive().nullable(),
    limit: z.number().int().min(1).max(24),
  }),
  defaultProps: { title: 'Featured', source: 'category', items: [], categoryId: null, limit: 4 },
  render: ({ title, source, items, categoryId, limit }) => <FeaturedView title={title} source={source} items={items} categoryId={categoryId} limit={limit} />,
});
